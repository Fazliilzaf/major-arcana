const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');

const { getKnowledgeDirForBrand } = require('../brand/runtimeConfig');
const { resolveBrandForHost } = require('../brand/resolveBrand');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { TEMPLATE_CATEGORIES, normalizeCategory } = require('../templates/constants');
const {
  buildVariablePolicyMeta,
  validateTemplateVariables,
  applyChannelSignature,
} = require('../templates/variables');
const { evaluateTemplateRisk } = require('../risk/templateRisk');

function asNonEmptyString(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed || '';
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = asNonEmptyString(value);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

async function readFileMeta(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return {
        exists: false,
        path: filePath,
        sizeBytes: 0,
        updatedAt: null,
      };
    }
    return {
      exists: true,
      path: filePath,
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  } catch {
    return {
      exists: false,
      path: filePath,
      sizeBytes: 0,
      updatedAt: null,
    };
  }
}

async function readTextPreview(filePath, maxChars = 1800) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const text = String(raw || '').trim();
    if (!text) return '';
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars - 1)}…`;
  } catch {
    return '';
  }
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeTopic(value) {
  return asNonEmptyString(value).replace(/\s+/g, ' ').trim();
}

function ensureCategory(value) {
  const normalized = normalizeCategory(value);
  if (TEMPLATE_CATEGORIES.includes(normalized)) return normalized;
  return 'CONSULTATION';
}

async function getTenantTemplateRuntime(tenantConfigStore, tenantId) {
  if (!tenantConfigStore || typeof tenantConfigStore.getTenantConfig !== 'function') {
    return {
      riskSensitivityModifier: 0,
      templateVariableAllowlistByCategory: {},
      templateRequiredVariablesByCategory: {},
      templateSignaturesByChannel: {},
    };
  }
  try {
    const tenantConfig = await tenantConfigStore.getTenantConfig(tenantId);
    const value = Number(tenantConfig?.riskSensitivityModifier ?? 0);
    return {
      riskSensitivityModifier: Number.isFinite(value)
        ? Math.max(-10, Math.min(10, value))
        : 0,
      templateVariableAllowlistByCategory:
        tenantConfig?.templateVariableAllowlistByCategory || {},
      templateRequiredVariablesByCategory:
        tenantConfig?.templateRequiredVariablesByCategory || {},
      templateSignaturesByChannel: tenantConfig?.templateSignaturesByChannel || {},
    };
  } catch {
    return {
      riskSensitivityModifier: 0,
      templateVariableAllowlistByCategory: {},
      templateRequiredVariablesByCategory: {},
      templateSignaturesByChannel: {},
    };
  }
}

function parseTemplateSeedList(payload) {
  if (Array.isArray(payload?.seeds)) {
    return payload.seeds.filter((item) => item && typeof item === 'object');
  }
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === 'object');
  }
  return [];
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveMailDirectory({
  tenantId,
  tenantConfig,
  defaultBrand,
  brandByHost,
}) {
  const heuristicBrand = resolveBrandForHost(tenantId, {
    defaultBrand,
    brandByHost,
  });

  const candidates = uniqueStrings([
    tenantId,
    tenantConfig?.knowledgeBrand,
    tenantConfig?.brand,
    heuristicBrand,
    resolveBrandForHost(tenantConfig?.brandProfile, { defaultBrand, brandByHost }),
    resolveBrandForHost(tenantConfig?.assistantName, { defaultBrand, brandByHost }),
    defaultBrand,
  ]);

  const attemptedMailDirs = [];

  for (const brand of candidates) {
    const baseDirs = uniqueStrings([
      path.join(process.cwd(), 'knowledge', brand),
      getKnowledgeDirForBrand(brand),
    ]);

    for (const baseDir of baseDirs) {
      const mailDir = path.join(baseDir, 'mail');
      attemptedMailDirs.push(mailDir);
      if (await pathExists(mailDir)) {
        return {
          brand,
          mailDir,
          attemptedMailDirs,
        };
      }
    }
  }

  return {
    brand: candidates[0] || defaultBrand,
    mailDir: path.join(getKnowledgeDirForBrand(defaultBrand), 'mail'),
    attemptedMailDirs,
  };
}

function createMailInsightsRouter({
  authStore,
  templateStore,
  tenantConfigStore,
  config,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get(
    '/mail/insights',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const tenantId = req.auth.tenantId;
        const tenantConfig = await tenantConfigStore.getTenantConfig(tenantId);

        const resolved = await resolveMailDirectory({
          tenantId,
          tenantConfig,
          defaultBrand: config.brand,
          brandByHost: config.brandByHost,
        });

        const ingestReportPath = path.join(resolved.mailDir, 'ingest-report.json');
        const summaryPath = path.join(resolved.mailDir, 'mail-summary.md');
        const faqPath = path.join(resolved.mailDir, 'faq-from-mails.md');
        const tonePath = path.join(resolved.mailDir, 'tone-style-from-mails.md');
        const templateSeedsPath = path.join(
          resolved.mailDir,
          'template-seeds-from-mails.md'
        );
        const threadSamplesPath = path.join(resolved.mailDir, 'thread-samples.md');

        const [
          ingestReportMeta,
          summaryMeta,
          faqMeta,
          toneMeta,
          templateSeedsMeta,
          threadSamplesMeta,
          ingestReport,
          summaryPreview,
          faqPreview,
          tonePreview,
          templateSeedsPreview,
        ] = await Promise.all([
          readFileMeta(ingestReportPath),
          readFileMeta(summaryPath),
          readFileMeta(faqPath),
          readFileMeta(tonePath),
          readFileMeta(templateSeedsPath),
          readFileMeta(threadSamplesPath),
          readJsonFile(ingestReportPath),
          readTextPreview(summaryPath),
          readTextPreview(faqPath),
          readTextPreview(tonePath),
          readTextPreview(templateSeedsPath),
        ]);

        const hasData = Boolean(
          ingestReportMeta.exists ||
            summaryMeta.exists ||
            faqMeta.exists ||
            toneMeta.exists ||
            templateSeedsMeta.exists ||
            threadSamplesMeta.exists
        );

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'mail.insights.read',
          outcome: 'success',
          targetType: 'mail_insights',
          targetId: tenantId,
          metadata: {
            brand: resolved.brand,
            ready: hasData,
          },
        });

        return res.json({
          tenantId,
          brand: resolved.brand,
          ready: hasData,
          generatedAt: new Date().toISOString(),
          paths: {
            mailDir: resolved.mailDir,
            attemptedMailDirs: resolved.attemptedMailDirs,
          },
          files: {
            ingestReport: ingestReportMeta,
            summary: summaryMeta,
            faq: faqMeta,
            tone: toneMeta,
            templateSeeds: templateSeedsMeta,
            threadSamples: threadSamplesMeta,
          },
          report: ingestReport,
          previews: {
            summary: summaryPreview,
            faq: faqPreview,
            tone: tonePreview,
            templateSeeds: templateSeedsPreview,
          },
          guidance: hasData
            ? []
            : [
                'Kör mail-ingest för denna tenant för att fylla panelen.',
                'Exempel: npm run ingest:mails -- --input ./mail-exports --brand hair-tp-clinic',
              ],
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa mail-insikter.' });
      }
    }
  );

  router.post(
    '/mail/template-seeds/apply',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        if (!templateStore) {
          return res.status(500).json({ error: 'templateStore saknas i route-konfiguration.' });
        }

        const tenantId = req.auth.tenantId;
        const tenantConfig = await tenantConfigStore.getTenantConfig(tenantId);
        const resolved = await resolveMailDirectory({
          tenantId,
          tenantConfig,
          defaultBrand: config.brand,
          brandByHost: config.brandByHost,
        });

        const seedPath = path.join(resolved.mailDir, 'template-seeds.json');
        const seedPayload = await readJsonFile(seedPath);
        const seeds = parseTemplateSeedList(seedPayload);
        if (!seeds.length) {
          return res.status(400).json({
            error:
              'Hittade inga template seeds. Kör mail-ingest först så template-seeds.json skapas.',
          });
        }

        const limit = Math.max(1, Math.min(50, asInt(req.body?.limit, 8)));
        const offset = Math.max(0, asInt(req.body?.offset, 0));
        const dryRun = asBool(req.body?.dryRun, false);
        const skipExisting = asBool(req.body?.skipExisting, true);
        const channel = asNonEmptyString(req.body?.channel) || 'email';
        const locale = asNonEmptyString(req.body?.locale) || 'sv-SE';
        const namePrefix = asNonEmptyString(req.body?.namePrefix) || '';
        const categoryFilter = normalizeCategory(req.body?.category || '');

        if (categoryFilter && !TEMPLATE_CATEGORIES.includes(categoryFilter)) {
          return res.status(400).json({ error: 'Ogiltigt category-filter.' });
        }

        const selectedSeeds = seeds
          .filter((seed) => {
            if (!categoryFilter) return true;
            return ensureCategory(seed?.templateCategory) === categoryFilter;
          });

        const pagedSeeds = selectedSeeds.slice(offset, offset + limit);

        if (!pagedSeeds.length) {
          return res.status(400).json({
            error: 'Inga seeds matchade valt filter/limit.',
          });
        }

        const tenantRuntime = await getTenantTemplateRuntime(tenantConfigStore, tenantId);
        const variablePolicy = buildVariablePolicyMeta({
          allowlistOverridesByCategory: tenantRuntime.templateVariableAllowlistByCategory,
          requiredOverridesByCategory: tenantRuntime.templateRequiredVariablesByCategory,
        });

        const existingTemplateIndex = new Map();
        if (skipExisting && typeof templateStore.listTemplates === 'function') {
          const existingTemplates = await templateStore.listTemplates({
            tenantId,
            includeVersions: true,
          });
          for (const template of existingTemplates) {
            const templateCategory = ensureCategory(template?.category);
            const templateName = asNonEmptyString(template?.name);
            const templateChannel = asNonEmptyString(template?.channel).toLowerCase();
            const templateLocale = asNonEmptyString(template?.locale).toLowerCase();
            if (!templateName || !templateCategory) continue;
            const hasMailSeedVersion = Array.isArray(template?.versions)
              ? template.versions.some(
                  (version) =>
                    asNonEmptyString(version?.source).toLowerCase() === 'mail_seed'
                )
              : false;
            if (!hasMailSeedVersion) continue;
            const key = [
              templateCategory,
              templateName.toLowerCase(),
              templateChannel,
              templateLocale,
            ].join('::');
            if (!existingTemplateIndex.has(key)) {
              existingTemplateIndex.set(key, []);
            }
            existingTemplateIndex.get(key).push({
              templateId: template.id,
              currentActiveVersionId: template.currentActiveVersionId || null,
            });
          }
        }

        const previewRows = pagedSeeds.map((seed, index) => {
          const category = ensureCategory(seed?.templateCategory);
          const topic = normalizeTopic(seed?.topic) || 'övrigt';
          const fallbackName = `Mail seed ${topic} ${String(index + 1).padStart(3, '0')}`;
          const templateName = namePrefix
            ? `${namePrefix} ${topic} ${String(index + 1).padStart(3, '0')}`.trim()
            : asNonEmptyString(seed?.templateName) || fallbackName;
          const draftTitle =
            asNonEmptyString(seed?.draftTitle) || `${templateName} (${category})`;
          const instruction =
            asNonEmptyString(seed?.instruction) ||
            `Skapa en ${category}-mall med varm och tydlig ton.`;
          const rawContent =
            asNonEmptyString(seed?.draftContent) ||
            asNonEmptyString(seed?.answerSnippet) ||
            'Hej {{first_name}},\n\nTack för din fråga.\n\nMed vänlig hälsning,\n{{clinic_name}}';
          const contentWithSignature = applyChannelSignature({
            content: rawContent,
            channel,
            signaturesByChannel: tenantRuntime.templateSignaturesByChannel,
          });
          const matchKey = [
            category,
            templateName.toLowerCase(),
            channel.toLowerCase(),
            locale.toLowerCase(),
          ].join('::');
          const existingMatch = existingTemplateIndex.get(matchKey)?.[0] || null;
          const variableValidation = validateTemplateVariables({
            category,
            content: contentWithSignature,
            allowlistOverridesByCategory: tenantRuntime.templateVariableAllowlistByCategory,
            requiredOverridesByCategory: tenantRuntime.templateRequiredVariablesByCategory,
          });
          return {
            category,
            templateName,
            draftTitle,
            instruction,
            content: contentWithSignature,
            variableValidation,
            topic,
            seedId: asNonEmptyString(seed?.seedId) || '',
            skippedExisting: Boolean(existingMatch),
            existingTemplateId: existingMatch?.templateId || null,
          };
        });

        if (dryRun) {
          const skippedExistingRows = previewRows.filter((row) => row.skippedExisting);
          await authStore.addAuditEvent({
            tenantId,
            actorUserId: req.auth.userId,
            action: 'mail.template_seeds.apply.preview',
            outcome: 'success',
            targetType: 'mail_template_seed',
            targetId: tenantId,
            metadata: {
              selected: previewRows.length,
              skippedExisting: skippedExistingRows.length,
              categoryFilter: categoryFilter || null,
              offset,
            },
          });
          return res.json({
            dryRun: true,
            tenantId,
            brand: resolved.brand,
            totalAvailable: selectedSeeds.length,
            offset,
            selected: previewRows.length,
            skipExisting,
            skippedExisting: skippedExistingRows.length,
            variablePolicy,
            preview: previewRows.map((row) => ({
              category: row.category,
              templateName: row.templateName,
              draftTitle: row.draftTitle,
              topic: row.topic,
              seedId: row.seedId,
              skippedExisting: row.skippedExisting,
              existingTemplateId: row.existingTemplateId,
              variablesUsed: row.variableValidation.variablesUsed,
              unknownVariables: row.variableValidation.unknownVariables,
              missingRequiredVariables: row.variableValidation.missingRequiredVariables,
            })),
          });
        }

        const created = [];
        const skippedExisting = [];
        for (const row of previewRows) {
          if (row.skippedExisting) {
            skippedExisting.push({
              category: row.category,
              topic: row.topic,
              seedId: row.seedId,
              templateName: row.templateName,
              templateId: row.existingTemplateId,
            });
            continue;
          }

          const template = await templateStore.createTemplate({
            tenantId,
            category: row.category,
            name: row.templateName,
            channel,
            locale,
            createdBy: req.auth.userId,
          });

          const draft = await templateStore.createDraftVersion({
            templateId: template.id,
            content: row.content,
            title: row.draftTitle,
            source: 'mail_seed',
            variablesUsed: row.variableValidation.variablesUsed,
            createdBy: req.auth.userId,
          });

          const inputEvaluation = evaluateTemplateRisk({
            scope: 'input',
            category: row.category,
            content: row.instruction,
            tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
            variableValidation: row.variableValidation,
          });
          const outputEvaluation = evaluateTemplateRisk({
            scope: 'output',
            category: row.category,
            content: row.content,
            tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
            variableValidation: row.variableValidation,
          });

          const evaluated = await templateStore.evaluateVersion({
            templateId: template.id,
            versionId: draft.id,
            inputEvaluation,
            outputEvaluation,
          });

          created.push({
            category: row.category,
            topic: row.topic,
            seedId: row.seedId,
            templateId: template.id,
            templateName: template.name,
            versionId: evaluated.id,
            decision: evaluated?.risk?.decision || 'allow',
            riskLevel: evaluated?.risk?.riskLevel || 1,
            unknownVariables: row.variableValidation.unknownVariables,
            missingRequiredVariables: row.variableValidation.missingRequiredVariables,
          });
        }

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'mail.template_seeds.apply',
          outcome: 'success',
          targetType: 'mail_template_seed',
          targetId: tenantId,
          metadata: {
            created: created.length,
            skippedExisting: skippedExisting.length,
            categoryFilter: categoryFilter || null,
            offset,
          },
        });

        const statusCode = created.length > 0 ? 201 : 200;
        return res.status(statusCode).json({
          dryRun: false,
          tenantId,
          brand: resolved.brand,
          totalAvailable: selectedSeeds.length,
          offset,
          selected: pagedSeeds.length,
          skipExisting,
          skippedExisting: skippedExisting.length,
          created: created.length,
          skipped: skippedExisting,
          templates: created,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte skapa template drafts från mail-seeds.' });
      }
    }
  );

  return router;
}

module.exports = {
  createMailInsightsRouter,
};
