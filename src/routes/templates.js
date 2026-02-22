const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { OWNER_ACTIONS } = require('../templates/store');
const { TEMPLATE_CATEGORIES, isValidCategory, normalizeCategory } = require('../templates/constants');
const {
  buildVariablePolicyMeta,
  validateTemplateVariables,
  applyChannelSignature,
} = require('../templates/variables');
const { evaluateTemplateRisk } = require('../risk/templateRisk');
const { generateTemplateDraft } = require('../templates/generator');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseIntSafe(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureAllowedTemplate(templateAccess, req, res) {
  if (!templateAccess || !templateAccess.exists) {
    res.status(404).json({ error: 'Mallen hittades inte.' });
    return false;
  }
  if (!templateAccess.allowed) {
    res.status(403).json({ error: 'Du har inte åtkomst till denna mall.' });
    return false;
  }
  return true;
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

function createTemplateRouter({
  templateStore,
  authStore,
  tenantConfigStore,
  openai,
  model,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get('/templates/meta', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    const tenantRuntime = await getTenantTemplateRuntime(
      tenantConfigStore,
      req.auth.tenantId
    );
    const variablePolicy = buildVariablePolicyMeta({
      allowlistOverridesByCategory: tenantRuntime.templateVariableAllowlistByCategory,
      requiredOverridesByCategory: tenantRuntime.templateRequiredVariablesByCategory,
    });

    return res.json({
      categories: TEMPLATE_CATEGORIES,
      variableWhitelist: variablePolicy.variableWhitelist,
      requiredVariables: variablePolicy.requiredVariables,
      signaturesByChannel: tenantRuntime.templateSignaturesByChannel,
      ownerActions: Object.values(OWNER_ACTIONS),
    });
  });

  router.get('/templates', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const category = normalizeCategory(req.query?.category || '');
      if (category && !isValidCategory(category)) {
        return res.status(400).json({ error: 'Ogiltig kategori.' });
      }
      const templates = await templateStore.listTemplates({
        tenantId: req.auth.tenantId,
        category,
      });
      return res.json({
        tenantId: req.auth.tenantId,
        count: templates.length,
        templates,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa mallar.' });
    }
  });

  router.post('/templates', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const category = normalizeCategory(req.body?.category);
      const name = normalizeText(req.body?.name);
      const channel = normalizeText(req.body?.channel || 'internal');
      const locale = normalizeText(req.body?.locale || 'sv-SE');

      if (!isValidCategory(category)) {
        return res.status(400).json({ error: 'Ogiltig kategori.' });
      }
      if (!name) {
        return res.status(400).json({ error: 'Mallnamn krävs.' });
      }

      const template = await templateStore.createTemplate({
        tenantId: req.auth.tenantId,
        category,
        name,
        channel,
        locale,
        createdBy: req.auth.userId,
      });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'templates.create',
        outcome: 'success',
        targetType: 'template',
        targetId: template.id,
        metadata: { category, name },
      });

      return res.status(201).json({ template });
    } catch (error) {
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte skapa mall.' });
    }
  });

  router.get('/templates/:templateId/versions', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const templateId = String(req.params.templateId || '').trim();
      const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
      if (!ensureAllowedTemplate(access, req, res)) return;

      const versions = await templateStore.listTemplateVersions(templateId);
      return res.json({
        templateId,
        count: versions.length,
        versions,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa mallversioner.' });
    }
  });

  router.get(
    '/templates/:templateId/versions/:versionId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const versionId = String(req.params.versionId || '').trim();
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!ensureAllowedTemplate(access, req, res)) return;

        const version = await templateStore.getTemplateVersion(templateId, versionId);
        if (!version) {
          return res.status(404).json({ error: 'Versionen hittades inte.' });
        }
        return res.json({ version });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa version.' });
      }
    }
  );

  router.post(
    '/templates/:templateId/drafts/generate',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!ensureAllowedTemplate(access, req, res)) return;

        const template = access.template;
        const tenantRuntime = await getTenantTemplateRuntime(
          tenantConfigStore,
          req.auth.tenantId
        );
        const instruction = normalizeText(req.body?.instruction);
        const title = normalizeText(req.body?.title || template.name);

        const generated = await generateTemplateDraft({
          openai,
          model,
          tenantName: req.auth.tenantId,
          category: template.category,
          name: template.name,
          instruction,
        });

        const generatedContentWithSignature = applyChannelSignature({
          content: generated.content,
          channel: template.channel,
          signaturesByChannel: tenantRuntime.templateSignaturesByChannel,
        });

        const variableValidation = validateTemplateVariables({
          category: template.category,
          content: generatedContentWithSignature,
          allowlistOverridesByCategory: tenantRuntime.templateVariableAllowlistByCategory,
          requiredOverridesByCategory: tenantRuntime.templateRequiredVariablesByCategory,
        });

        const draft = await templateStore.createDraftVersion({
          templateId,
          title,
          content: generatedContentWithSignature,
          source: 'ai',
          variablesUsed: variableValidation.variablesUsed,
          createdBy: req.auth.userId,
        });

        const inputEvaluation = evaluateTemplateRisk({
          scope: 'input',
          category: template.category,
          content: instruction || generatedContentWithSignature,
          tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
          variableValidation,
        });
        const outputEvaluation = evaluateTemplateRisk({
          scope: 'output',
          category: template.category,
          content: generatedContentWithSignature,
          tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
          variableValidation,
        });

        const evaluated = await templateStore.evaluateVersion({
          templateId,
          versionId: draft.id,
          inputEvaluation,
          outputEvaluation,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'templates.generate_draft',
          outcome: 'success',
          targetType: 'template_version',
          targetId: evaluated.id,
          metadata: {
            templateId,
            provider: generated.provider,
            decision: evaluated.risk?.decision || null,
          },
        });

        return res.status(201).json({
          templateId,
          version: evaluated,
          generation: { provider: generated.provider },
          variableValidation,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte generera utkast.' });
      }
    }
  );

  router.patch(
    '/templates/:templateId/versions/:versionId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const versionId = String(req.params.versionId || '').trim();
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!ensureAllowedTemplate(access, req, res)) return;
        const template = access.template;
        const tenantRuntime = await getTenantTemplateRuntime(
          tenantConfigStore,
          req.auth.tenantId
        );
        const currentVersion = await templateStore.getTemplateVersion(templateId, versionId);
        if (!currentVersion) {
          return res.status(404).json({ error: 'Versionen hittades inte.' });
        }

        const content = req.body?.content;
        const nextContent =
          typeof content === 'string'
            ? applyChannelSignature({
                content,
                channel: template.channel,
                signaturesByChannel: tenantRuntime.templateSignaturesByChannel,
              })
            : currentVersion.content;
        const title = req.body?.title;
        const variableValidation = validateTemplateVariables({
          category: template.category,
          content: nextContent,
          allowlistOverridesByCategory: tenantRuntime.templateVariableAllowlistByCategory,
          requiredOverridesByCategory: tenantRuntime.templateRequiredVariablesByCategory,
        });

        await templateStore.updateDraftVersion({
          templateId,
          versionId,
          content: typeof content === 'string' ? nextContent : undefined,
          title,
          variablesUsed: variableValidation.variablesUsed,
          updatedBy: req.auth.userId,
        });

        const inputEvaluation = evaluateTemplateRisk({
          scope: 'input',
          category: template.category,
          content: normalizeText(req.body?.instruction || ''),
          tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
          variableValidation,
        });
        const outputEvaluation = evaluateTemplateRisk({
          scope: 'output',
          category: template.category,
          content: nextContent,
          tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
          variableValidation,
        });

        const evaluated = await templateStore.evaluateVersion({
          templateId,
          versionId,
          inputEvaluation,
          outputEvaluation,
        });

        const beforeSnapshot = {
          title: currentVersion.title || null,
          contentLength: String(currentVersion.content || '').length,
          variablesCount: Array.isArray(currentVersion.variablesUsed)
            ? currentVersion.variablesUsed.length
            : 0,
          decision: currentVersion?.risk?.decision || null,
        };
        const afterSnapshot = {
          title: evaluated.title || null,
          contentLength: String(evaluated.content || '').length,
          variablesCount: Array.isArray(evaluated.variablesUsed)
            ? evaluated.variablesUsed.length
            : 0,
          decision: evaluated?.risk?.decision || null,
        };
        const diff = [];
        for (const field of Object.keys(beforeSnapshot)) {
          if (JSON.stringify(beforeSnapshot[field]) !== JSON.stringify(afterSnapshot[field])) {
            diff.push({
              field,
              before: beforeSnapshot[field],
              after: afterSnapshot[field],
            });
          }
        }

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'templates.update_draft',
          outcome: 'success',
          targetType: 'template_version',
          targetId: versionId,
          metadata: {
            templateId,
            decision: evaluated.risk?.decision || null,
            before: beforeSnapshot,
            after: afterSnapshot,
            diff,
          },
        });

        return res.json({
          templateId,
          version: evaluated,
          variableValidation,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte uppdatera version.' });
      }
    }
  );

  router.post(
    '/templates/:templateId/versions/:versionId/evaluate',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const versionId = String(req.params.versionId || '').trim();
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!ensureAllowedTemplate(access, req, res)) return;
        const template = access.template;
        const tenantRuntime = await getTenantTemplateRuntime(
          tenantConfigStore,
          req.auth.tenantId
        );
        const version = await templateStore.getTemplateVersion(templateId, versionId);
        if (!version) {
          return res.status(404).json({ error: 'Versionen hittades inte.' });
        }

        const contentForEvaluation = applyChannelSignature({
          content: version.content,
          channel: template.channel,
          signaturesByChannel: tenantRuntime.templateSignaturesByChannel,
        });

        const variableValidation = validateTemplateVariables({
          category: template.category,
          content: contentForEvaluation,
          variables: version.variablesUsed,
          allowlistOverridesByCategory: tenantRuntime.templateVariableAllowlistByCategory,
          requiredOverridesByCategory: tenantRuntime.templateRequiredVariablesByCategory,
        });

        const inputEvaluation = evaluateTemplateRisk({
          scope: 'input',
          category: template.category,
          content: normalizeText(req.body?.instruction || contentForEvaluation),
          tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
          variableValidation,
        });
        const outputEvaluation = evaluateTemplateRisk({
          scope: 'output',
          category: template.category,
          content: contentForEvaluation,
          tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
          variableValidation,
        });

        const evaluated = await templateStore.evaluateVersion({
          templateId,
          versionId,
          inputEvaluation,
          outputEvaluation,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'templates.evaluate',
          outcome: 'success',
          targetType: 'template_version',
          targetId: versionId,
          metadata: { templateId, decision: evaluated.risk?.decision || null },
        });

        return res.json({
          templateId,
          version: evaluated,
          variableValidation,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte utvärdera version.' });
      }
    }
  );

  router.post(
    '/templates/:templateId/versions/:versionId/activate',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const versionId = String(req.params.versionId || '').trim();
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!ensureAllowedTemplate(access, req, res)) return;

        const activated = await templateStore.activateVersion({
          templateId,
          versionId,
          activatedBy: req.auth.userId,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'templates.activate_version',
          outcome: 'success',
          targetType: 'template_version',
          targetId: versionId,
          metadata: { templateId },
        });

        return res.json({
          templateId,
          version: activated,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte aktivera version.' });
      }
    }
  );

  router.post(
    '/templates/:templateId/versions/:versionId/archive',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const versionId = String(req.params.versionId || '').trim();
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!ensureAllowedTemplate(access, req, res)) return;

        const archived = await templateStore.archiveVersion({
          templateId,
          versionId,
          archivedBy: req.auth.userId,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'templates.archive_version',
          outcome: 'success',
          targetType: 'template_version',
          targetId: versionId,
          metadata: { templateId },
        });

        return res.json({
          templateId,
          version: archived,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte arkivera version.' });
      }
    }
  );

  router.post(
    '/templates/:templateId/versions/:versionId/clone',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const versionId = String(req.params.versionId || '').trim();
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!ensureAllowedTemplate(access, req, res)) return;

        const cloned = await templateStore.cloneVersion({
          templateId,
          versionId,
          createdBy: req.auth.userId,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'templates.clone_version',
          outcome: 'success',
          targetType: 'template_version',
          targetId: cloned.id,
          metadata: { templateId, sourceVersionId: versionId },
        });

        return res.status(201).json({
          templateId,
          version: cloned,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte klona version.' });
      }
    }
  );

  router.get('/risk/evaluations', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const minRiskLevel = parseIntSafe(req.query?.minRiskLevel, 0);
      const maxRiskLevel = parseIntSafe(req.query?.maxRiskLevel, 5);
      const limit = parseIntSafe(req.query?.limit, 100);
      const ownerDecision =
        typeof req.query?.ownerDecision === 'string' ? req.query.ownerDecision : '';
      const decision =
        typeof req.query?.decision === 'string' ? req.query.decision : '';
      const category =
        typeof req.query?.category === 'string' ? req.query.category : '';
      const reasonCode =
        typeof req.query?.reasonCode === 'string' ? req.query.reasonCode : '';
      const state =
        typeof req.query?.state === 'string' ? req.query.state : '';
      const sinceDays = parseIntSafe(req.query?.sinceDays, 0);
      const search =
        typeof req.query?.search === 'string' ? req.query.search : '';
      const templateId =
        typeof req.query?.templateId === 'string' ? req.query.templateId : '';
      const templateVersionId =
        typeof req.query?.templateVersionId === 'string' ? req.query.templateVersionId : '';
      const evaluations = await templateStore.listEvaluations({
        tenantId: req.auth.tenantId,
        minRiskLevel,
        maxRiskLevel,
        limit,
        ownerDecision,
        decision,
        category,
        reasonCode,
        state,
        sinceDays,
        search,
        templateId,
        templateVersionId,
      });
      return res.json({
        tenantId: req.auth.tenantId,
        count: evaluations.length,
        evaluations,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa riskutvärderingar.' });
    }
  });

  router.get('/risk/summary', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const minRiskLevel = parseIntSafe(req.query?.minRiskLevel, 1);
      const summary = await templateStore.summarizeRisk({
        tenantId: req.auth.tenantId,
        minRiskLevel,
      });
      return res.json(summary);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa risksammanfattning.' });
    }
  });

  router.get(
    '/risk/evaluations/:evaluationId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const evaluationId = String(req.params.evaluationId || '').trim();
        if (!evaluationId) {
          return res.status(400).json({ error: 'evaluationId saknas.' });
        }
        const evaluation = await templateStore.getEvaluation({
          evaluationId,
          tenantId: req.auth.tenantId,
        });
        if (!evaluation) {
          return res.status(404).json({ error: 'Riskutvärderingen hittades inte.' });
        }
        return res.json({ evaluation });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa riskutvärdering.' });
      }
    }
  );

  router.post(
    '/risk/evaluations/:evaluationId/owner-action',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const evaluationId = String(req.params.evaluationId || '').trim();
        const action =
          typeof req.body?.action === 'string' ? req.body.action.trim().toLowerCase() : '';
        const note = typeof req.body?.note === 'string' ? req.body.note : '';
        if (!evaluationId) {
          return res.status(400).json({ error: 'evaluationId saknas.' });
        }
        if (!Object.values(OWNER_ACTIONS).includes(action)) {
          return res.status(400).json({
            error: 'Ogiltig action.',
            allowedActions: Object.values(OWNER_ACTIONS),
          });
        }

        const currentEvaluation = await templateStore.getEvaluation({
          evaluationId,
          tenantId: req.auth.tenantId,
        });
        if (!currentEvaluation) {
          return res.status(404).json({ error: 'Riskutvärderingen hittades inte.' });
        }

        const evaluation = await templateStore.addOwnerAction({
          evaluationId,
          tenantId: req.auth.tenantId,
          action,
          note,
          actorUserId: req.auth.userId,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'risk.owner_action',
          outcome: 'success',
          targetType: 'risk_evaluation',
          targetId: evaluationId,
          metadata: {
            ownerAction: action,
            note: note || '',
            before: {
              ownerDecision: currentEvaluation.ownerDecision || 'pending',
              ownerActionCount: Array.isArray(currentEvaluation.ownerActions)
                ? currentEvaluation.ownerActions.length
                : 0,
            },
            after: {
              ownerDecision: evaluation.ownerDecision || 'pending',
              ownerActionCount: Array.isArray(evaluation.ownerActions)
                ? evaluation.ownerActions.length
                : 0,
            },
            diff: [
              {
                field: 'ownerDecision',
                before: currentEvaluation.ownerDecision || 'pending',
                after: evaluation.ownerDecision || 'pending',
              },
              {
                field: 'ownerActionCount',
                before: Array.isArray(currentEvaluation.ownerActions)
                  ? currentEvaluation.ownerActions.length
                  : 0,
                after: Array.isArray(evaluation.ownerActions)
                  ? evaluation.ownerActions.length
                  : 0,
              },
            ],
          },
        });

        return res.json({
          evaluation,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte spara owner action.' });
      }
    }
  );

  return router;
}

module.exports = {
  createTemplateRouter,
};
