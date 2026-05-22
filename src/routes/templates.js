const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { OWNER_ACTIONS } = require('../templates/ownerActions');
const { TEMPLATE_CATEGORIES, isValidCategory, normalizeCategory } = require('../templates/constants');
const {
  buildVariablePolicyMeta,
  validateTemplateVariables,
  applyChannelSignature,
} = require('../templates/variables');
const { evaluateTemplateRisk } = require('../risk/templateRisk');
const { evaluatePolicyFloorText } = require('../policy/floor');
const { generateTemplateDraft } = require('../templates/generator');
const { createExecutionGateway } = require('../gateway/executionGateway');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseIntSafe(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRevisionValue(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = raw.match(/\d+/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function extractExpectedRevision(req) {
  const fromIfMatch = parseRevisionValue(req.get('if-match'));
  if (fromIfMatch) return fromIfMatch;
  const fromBody = parseRevisionValue(req.body?.expectedRevision);
  if (fromBody) return fromBody;
  return null;
}

function buildVersionEtag(version) {
  const revision = parseRevisionValue(version?.revision);
  if (!revision) return '';
  return `W/\"r${revision}\"`;
}

async function ensureAllowedTemplate(templateAccess, req, res, { authStore, action = 'templates.access' } = {}) {
  if (!templateAccess || !templateAccess.exists) {
    res.status(404).json({ error: 'Mallen hittades inte.' });
    return false;
  }
  if (!templateAccess.allowed) {
    if (authStore && typeof authStore.addAuditEvent === 'function') {
      try {
        await authStore.addAuditEvent({
          tenantId: req?.auth?.tenantId || null,
          actorUserId: req?.auth?.userId || null,
          action,
          outcome: 'forbidden',
          targetType: 'template',
          targetId: templateAccess?.template?.id || '',
          metadata: {
            attemptedTemplateTenantId: templateAccess?.template?.tenantId || null,
            correlationId:
              typeof req?.correlationId === 'string'
                ? req.correlationId
                : typeof req?.get === 'function'
                  ? req.get('x-correlation-id')
                  : null,
          },
        });
      } catch {
        // Ignore audit write failures for access denied paths.
      }
    }
    res.status(403).json({ error: 'Du har inte åtkomst till denna mall.' });
    return false;
  }
  return true;
}

async function getTenantTemplateRuntime(tenantConfigStore, tenantId) {
  if (!tenantConfigStore || typeof tenantConfigStore.getTenantConfig !== 'function') {
    return {
      riskSensitivityModifier: 0,
      riskThresholdVersion: 1,
      templateVariableAllowlistByCategory: {},
      templateRequiredVariablesByCategory: {},
      templateSignaturesByChannel: {},
    };
  }
  try {
    const tenantConfig = await tenantConfigStore.getTenantConfig(tenantId);
    const value = Number(tenantConfig?.riskSensitivityModifier ?? 0);
    const thresholdVersion = Number.parseInt(String(tenantConfig?.riskThresholdVersion ?? 1), 10);
    return {
      riskSensitivityModifier: Number.isFinite(value)
        ? Math.max(-10, Math.min(10, value))
        : 0,
      riskThresholdVersion:
        Number.isFinite(thresholdVersion) && thresholdVersion > 0 ? thresholdVersion : 1,
      templateVariableAllowlistByCategory:
        tenantConfig?.templateVariableAllowlistByCategory || {},
      templateRequiredVariablesByCategory:
        tenantConfig?.templateRequiredVariablesByCategory || {},
      templateSignaturesByChannel: tenantConfig?.templateSignaturesByChannel || {},
    };
  } catch {
    return {
      riskSensitivityModifier: 0,
      riskThresholdVersion: 1,
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
  executionGateway = null,
}) {
  const router = express.Router();
  const gateway =
    executionGateway ||
    createExecutionGateway({
      buildVersion: process.env.npm_package_version || 'dev',
    });

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
      if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.versions.read' }))) return;

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
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.version.read' }))) return;

        const version = await templateStore.getTemplateVersion(templateId, versionId);
        if (!version) {
          return res.status(404).json({ error: 'Versionen hittades inte.' });
        }
        const etag = buildVersionEtag(version);
        if (etag) {
          res.setHeader('ETag', etag);
        }
        return res.json({ version });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa version.' });
      }
    }
  );

  router.get(
    '/templates/:templateId/versions/:versionId/revisions',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const versionId = String(req.params.versionId || '').trim();
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.revisions.read' }))) {
          return;
        }

        const requestedLimit = parseIntSafe(req.query?.limit, 50);
        const revisions = await templateStore.listVersionRevisions({
          templateId,
          versionId,
          limit: requestedLimit,
        });
        if (!revisions) {
          return res.status(404).json({ error: 'Versionen hittades inte.' });
        }
        return res.json({
          templateId,
          versionId,
          count: revisions.length,
          revisions,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa revisionshistorik.' });
      }
    }
  );

  router.get(
    '/templates/:templateId/versions/:versionId/revisions/diff',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const versionId = String(req.params.versionId || '').trim();
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.revision.diff' }))) {
          return;
        }
        const fromRevision = parseRevisionValue(req.query?.from);
        const toRevision = parseRevisionValue(req.query?.to);

        const diff = await templateStore.diffVersionRevisions({
          templateId,
          versionId,
          fromRevision,
          toRevision,
        });
        if (!diff) {
          return res.status(404).json({ error: 'Kunde inte beräkna revision-diff.' });
        }
        return res.json({
          templateId,
          versionId,
          ...diff,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa revision-diff.' });
      }
    }
  );

  router.get(
    '/templates/:templateId/versions/:versionId/revisions/:revisionNo',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const versionId = String(req.params.versionId || '').trim();
        const revisionNo = parseRevisionValue(req.params.revisionNo);
        if (!revisionNo) {
          return res.status(400).json({ error: 'Ogiltig revision.' });
        }
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.revision.read' }))) {
          return;
        }

        const revision = await templateStore.getVersionRevision({
          templateId,
          versionId,
          revision: revisionNo,
        });
        if (!revision) {
          return res.status(404).json({ error: 'Revisionen hittades inte.' });
        }
        return res.json({
          templateId,
          versionId,
          revision,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa revision.' });
      }
    }
  );

  router.post(
    '/templates/:templateId/versions/:versionId/revisions/:revisionNo/rollback',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const versionId = String(req.params.versionId || '').trim();
        const targetRevision = parseRevisionValue(req.params.revisionNo);
        if (!targetRevision) {
          return res.status(400).json({ error: 'Ogiltig revision.' });
        }
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.rollback_draft' }))) {
          return;
        }
        const template = access.template;
        const targetSnapshot = await templateStore.getVersionRevision({
          templateId,
          versionId,
          revision: targetRevision,
        });
        if (!targetSnapshot) {
          return res.status(404).json({ error: 'Revisionen hittades inte.' });
        }

        const tenantRuntime = await getTenantTemplateRuntime(tenantConfigStore, req.auth.tenantId);
        const note = normalizeText(req.body?.note || '');
        const expectedRevision = extractExpectedRevision(req);
        const correlationId =
          normalizeText(req.correlationId) || normalizeText(req.get('x-correlation-id')) || null;
        const idempotencyKey =
          normalizeText(req.get('x-idempotency-key')) ||
          normalizeText(req.body?.idempotencyKey) ||
          null;

        const gatewayResult = await gateway.run({
          context: {
            tenant_id: req.auth.tenantId,
            actor: {
              id: req.auth.userId,
              role: req.auth.role,
            },
            channel: 'template',
            intent: 'templates.rollback_draft',
            payload: {
              templateId,
              versionId,
              targetRevision,
              expectedRevision,
            },
            correlation_id: correlationId,
            idempotency_key: idempotencyKey,
          },
          handlers: {
            audit: async (event) => {
              await authStore.addAuditEvent({
                tenantId: req.auth.tenantId,
                actorUserId: req.auth.userId,
                action: event.action,
                outcome: event.outcome,
                targetType: 'gateway_run',
                targetId: String(event?.metadata?.runId || ''),
                metadata: event.metadata || {},
              });
            },
            inputRisk: async () =>
              evaluateTemplateRisk({
                scope: 'input',
                category: template.category,
                content: note || `rollback draft to revision ${targetRevision}`,
                tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
                riskThresholdVersion: tenantRuntime.riskThresholdVersion,
              }),
            agentRun: async () => {
              const contentWithSignature = applyChannelSignature({
                content: targetSnapshot.content || '',
                channel: template.channel,
                signaturesByChannel: tenantRuntime.templateSignaturesByChannel,
              });
              const variableValidation = validateTemplateVariables({
                category: template.category,
                content: contentWithSignature,
                allowlistOverridesByCategory: tenantRuntime.templateVariableAllowlistByCategory,
                requiredOverridesByCategory: tenantRuntime.templateRequiredVariablesByCategory,
              });
              return {
                nextContent: contentWithSignature,
                nextTitle: targetSnapshot.title || template.name,
                variableValidation,
              };
            },
            outputRisk: async ({ agentResult }) =>
              evaluateTemplateRisk({
                scope: 'output',
                category: template.category,
                content: agentResult?.nextContent || '',
                tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
                riskThresholdVersion: tenantRuntime.riskThresholdVersion,
                variableValidation: agentResult?.variableValidation || null,
                enforceStrictTemplateVariables: true,
              }),
            policyFloor: async ({ agentResult }) =>
              evaluatePolicyFloorText({
                text: agentResult?.nextContent || '',
                context: 'templates',
              }),
            persist: async ({ inputRisk, outputRisk }) => {
              const rolled = await templateStore.rollbackDraftVersion({
                templateId,
                versionId,
                targetRevision,
                updatedBy: req.auth.userId,
                expectedRevision,
                note,
              });
              const evaluated = await templateStore.evaluateVersion({
                templateId,
                versionId: rolled.version.id,
                inputEvaluation: inputRisk?.evaluation || null,
                outputEvaluation: outputRisk?.evaluation || null,
              });
              return {
                artifact_refs: {
                  run_id: null,
                  version_id: evaluated.id,
                },
                evaluated,
                rollback: {
                  fromRevision: rolled.fromRevision,
                },
              };
            },
            response: ({ persisted }) => ({
              templateId,
              version: persisted?.evaluated || null,
              rollback: persisted?.rollback || {
                fromRevision: targetRevision,
              },
            }),
          },
        });

        if (gatewayResult.decision === 'blocked' || gatewayResult.decision === 'critical_escalate') {
          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'templates.rollback_draft',
            outcome: 'blocked',
            targetType: 'template_version',
            targetId: versionId,
            metadata: {
              templateId,
              targetRevision,
              decision: gatewayResult.decision,
            },
          });
          return res.status(403).json({
            error: 'Rollback blockerades av risk/policy.',
            decision: gatewayResult.decision,
            safeResponse: gatewayResult.safe_response,
          });
        }

        const payload = gatewayResult.response_payload || {};
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'templates.rollback_draft',
          outcome: 'success',
          targetType: 'template_version',
          targetId: versionId,
          metadata: {
            templateId,
            targetRevision,
            resultingRevision: payload?.version?.revision || null,
            decision: payload?.version?.risk?.decision || gatewayResult.decision,
          },
        });
        const etag = buildVersionEtag(payload?.version);
        if (etag) {
          res.setHeader('ETag', etag);
        }
        return res.json(payload);
      } catch (error) {
        if (error?.code === 'VERSION_CONFLICT') {
          return res.status(409).json({
            error: error.message,
            code: 'version_conflict',
            expectedRevision: error.expectedRevision || null,
            currentRevision: error.currentRevision || null,
          });
        }
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte rollbacka draft.' });
      }
    }
  );

  router.post(
    '/templates/:templateId/drafts',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const templateId = String(req.params.templateId || '').trim();
        const access = await templateStore.ensureTemplateTenant(templateId, req.auth.tenantId);
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.create_draft_manual' }))) {
          return;
        }

        const template = access.template;
        const title = normalizeText(req.body?.title || template.name);
        const content =
          typeof req.body?.content === 'string' ? req.body.content.trim() : '';
        const source = normalizeText(req.body?.source || 'manual');
        const variablesUsed = Array.isArray(req.body?.variablesUsed) ? req.body.variablesUsed : [];

        if (!content) {
          return res.status(400).json({ error: 'Innehåll krävs för att skapa draft.' });
        }

        const draft = await templateStore.createDraftVersion({
          templateId,
          title,
          content,
          source: source || 'manual',
          variablesUsed,
          createdBy: req.auth.userId,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'templates.create_draft_manual',
          outcome: 'success',
          targetType: 'template_version',
          targetId: draft.id,
          metadata: {
            templateId,
            source: source || 'manual',
            revision: draft.revision || 1,
          },
        });

        const etag = buildVersionEtag(draft);
        if (etag) {
          res.setHeader('ETag', etag);
        }

        return res.status(201).json({
          templateId,
          version: draft,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte skapa draft.' });
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
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.generate_draft' }))) return;

        const template = access.template;
        const tenantRuntime = await getTenantTemplateRuntime(
          tenantConfigStore,
          req.auth.tenantId
        );
        const instruction = normalizeText(req.body?.instruction);
        const title = normalizeText(req.body?.title || template.name);
        const correlationId =
          normalizeText(req.correlationId) || normalizeText(req.get('x-correlation-id')) || null;
        const idempotencyKey =
          normalizeText(req.get('x-idempotency-key')) ||
          normalizeText(req.body?.idempotencyKey) ||
          null;

        const gatewayResult = await gateway.run({
          context: {
            tenant_id: req.auth.tenantId,
            actor: {
              id: req.auth.userId,
              role: req.auth.role,
            },
            channel: 'template',
            intent: 'templates.generate_draft',
            payload: {
              templateId,
              instruction,
              title,
            },
            correlation_id: correlationId,
            idempotency_key: idempotencyKey,
          },
          handlers: {
            audit: async (event) => {
              await authStore.addAuditEvent({
                tenantId: req.auth.tenantId,
                actorUserId: req.auth.userId,
                action: event.action,
                outcome: event.outcome,
                targetType: 'gateway_run',
                targetId: String(event?.metadata?.runId || ''),
                metadata: event.metadata || {},
              });
            },
            inputRisk: async () =>
              evaluateTemplateRisk({
                scope: 'input',
                category: template.category,
                content: instruction,
                tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
                riskThresholdVersion: tenantRuntime.riskThresholdVersion,
              }),
            agentRun: async () => {
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
              return {
                generated,
                content: generatedContentWithSignature,
                variableValidation,
              };
            },
            outputRisk: async ({ agentResult }) =>
              evaluateTemplateRisk({
                scope: 'output',
                category: template.category,
                content: agentResult?.content,
                tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
                riskThresholdVersion: tenantRuntime.riskThresholdVersion,
                variableValidation: agentResult?.variableValidation || null,
                enforceStrictTemplateVariables: true,
              }),
            policyFloor: async ({ agentResult }) =>
              evaluatePolicyFloorText({
                text: agentResult?.content || '',
                context: 'templates',
              }),
            persist: async ({ inputRisk, outputRisk, agentResult }) => {
              const draft = await templateStore.createDraftVersion({
                templateId,
                title,
                content: agentResult?.content || '',
                source: 'ai',
                variablesUsed: agentResult?.variableValidation?.variablesUsed || [],
                createdBy: req.auth.userId,
              });
              const evaluated = await templateStore.evaluateVersion({
                templateId,
                versionId: draft.id,
                inputEvaluation: inputRisk?.evaluation || null,
                outputEvaluation: outputRisk?.evaluation || null,
              });
              return {
                artifact_refs: {
                  run_id: null,
                  draft_id: evaluated.id,
                  version_id: evaluated.id,
                },
                evaluated,
                generated: agentResult?.generated || null,
                variableValidation: agentResult?.variableValidation || null,
              };
            },
            response: ({ persisted }) => ({
              templateId,
              version: persisted?.evaluated || null,
              generation: { provider: persisted?.generated?.provider || null },
              variableValidation: persisted?.variableValidation || null,
            }),
          },
        });

        if (gatewayResult.decision === 'blocked' || gatewayResult.decision === 'critical_escalate') {
          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'templates.generate_draft',
            outcome: 'blocked',
            targetType: 'template',
            targetId: templateId,
            metadata: {
              decision: gatewayResult.decision,
              policy: gatewayResult.policy_summary,
              risk: gatewayResult.risk_summary,
            },
          });
          return res.status(403).json({
            error: 'Utkast blockerades av risk/policy.',
            decision: gatewayResult.decision,
            safeResponse: gatewayResult.safe_response,
          });
        }

        const payload = gatewayResult.response_payload || {};
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'templates.generate_draft',
          outcome: 'success',
          targetType: 'template_version',
          targetId: payload?.version?.id || '',
          metadata: {
            templateId,
            provider: payload?.generation?.provider || null,
            decision: payload?.version?.risk?.decision || gatewayResult.decision || null,
          },
        });
        const etag = buildVersionEtag(payload?.version);
        if (etag) {
          res.setHeader('ETag', etag);
        }

        return res.status(201).json(payload);
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
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.update_draft' }))) return;
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
        const correlationId =
          normalizeText(req.correlationId) || normalizeText(req.get('x-correlation-id')) || null;
        const idempotencyKey =
          normalizeText(req.get('x-idempotency-key')) ||
          normalizeText(req.body?.idempotencyKey) ||
          null;
        const expectedRevision = extractExpectedRevision(req);
        const beforeSnapshot = {
          title: currentVersion.title || null,
          contentLength: String(currentVersion.content || '').length,
          variablesCount: Array.isArray(currentVersion.variablesUsed)
            ? currentVersion.variablesUsed.length
            : 0,
          decision: currentVersion?.risk?.decision || null,
          revision: Number(currentVersion?.revision || 1),
        };

        const gatewayResult = await gateway.run({
          context: {
            tenant_id: req.auth.tenantId,
            actor: {
              id: req.auth.userId,
              role: req.auth.role,
            },
            channel: 'template',
            intent: 'templates.update_draft',
            payload: {
              templateId,
              versionId,
              instruction: normalizeText(req.body?.instruction || ''),
              expectedRevision,
            },
            correlation_id: correlationId,
            idempotency_key: idempotencyKey,
          },
          handlers: {
            audit: async (event) => {
              await authStore.addAuditEvent({
                tenantId: req.auth.tenantId,
                actorUserId: req.auth.userId,
                action: event.action,
                outcome: event.outcome,
                targetType: 'gateway_run',
                targetId: String(event?.metadata?.runId || ''),
                metadata: event.metadata || {},
              });
            },
            inputRisk: async () => {
              const nextContentForInput =
                typeof content === 'string'
                  ? applyChannelSignature({
                      content,
                      channel: template.channel,
                      signaturesByChannel: tenantRuntime.templateSignaturesByChannel,
                    })
                  : currentVersion.content;
              const variableValidationForInput = validateTemplateVariables({
                category: template.category,
                content: nextContentForInput,
                allowlistOverridesByCategory: tenantRuntime.templateVariableAllowlistByCategory,
                requiredOverridesByCategory: tenantRuntime.templateRequiredVariablesByCategory,
              });
              return evaluateTemplateRisk({
                scope: 'input',
                category: template.category,
                content: normalizeText(req.body?.instruction || ''),
                tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
                riskThresholdVersion: tenantRuntime.riskThresholdVersion,
                variableValidation: variableValidationForInput,
              });
            },
            agentRun: async () => {
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
              return {
                nextContent,
                title,
                variableValidation,
              };
            },
            outputRisk: async ({ agentResult }) =>
              evaluateTemplateRisk({
                scope: 'output',
                category: template.category,
                content: agentResult?.nextContent || '',
                tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
                riskThresholdVersion: tenantRuntime.riskThresholdVersion,
                variableValidation: agentResult?.variableValidation || null,
                enforceStrictTemplateVariables: true,
              }),
            policyFloor: async ({ agentResult }) =>
              evaluatePolicyFloorText({
                text: agentResult?.nextContent || '',
                context: 'templates',
              }),
            persist: async ({ inputRisk, outputRisk, agentResult }) => {
              await templateStore.updateDraftVersion({
                templateId,
                versionId,
                content: typeof content === 'string' ? agentResult?.nextContent || '' : undefined,
                title: agentResult?.title,
                variablesUsed: agentResult?.variableValidation?.variablesUsed || [],
                updatedBy: req.auth.userId,
                expectedRevision,
                source: 'patch_update',
                note: normalizeText(req.body?.note || ''),
              });

              const evaluated = await templateStore.evaluateVersion({
                templateId,
                versionId,
                inputEvaluation: inputRisk?.evaluation || null,
                outputEvaluation: outputRisk?.evaluation || null,
              });

              return {
                artifact_refs: {
                  run_id: null,
                  version_id: evaluated.id,
                },
                evaluated,
                variableValidation: agentResult?.variableValidation || null,
              };
            },
            response: ({ persisted }) => ({
              templateId,
              version: persisted?.evaluated || null,
              variableValidation: persisted?.variableValidation || null,
            }),
          },
        });

        if (gatewayResult.decision === 'blocked' || gatewayResult.decision === 'critical_escalate') {
          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'templates.update_draft',
            outcome: 'blocked',
            targetType: 'template_version',
            targetId: versionId,
            metadata: {
              templateId,
              decision: gatewayResult.decision,
              policy: gatewayResult.policy_summary,
              risk: gatewayResult.risk_summary,
            },
          });
          return res.status(403).json({
            error: 'Uppdatering blockerades av risk/policy.',
            decision: gatewayResult.decision,
            safeResponse: gatewayResult.safe_response,
          });
        }

        const payload = gatewayResult.response_payload || {};
        const evaluated = payload?.version || null;
        const afterSnapshot = {
          title: evaluated?.title || null,
          contentLength: String(evaluated?.content || '').length,
          variablesCount: Array.isArray(evaluated?.variablesUsed)
            ? evaluated.variablesUsed.length
            : 0,
          decision: evaluated?.risk?.decision || null,
          revision: Number(evaluated?.revision || 1),
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
            decision: evaluated?.risk?.decision || gatewayResult.decision || null,
            before: beforeSnapshot,
            after: afterSnapshot,
            diff,
          },
        });
        const etag = buildVersionEtag(evaluated);
        if (etag) {
          res.setHeader('ETag', etag);
        }
        return res.json(payload);
      } catch (error) {
        if (error?.code === 'VERSION_CONFLICT') {
          return res.status(409).json({
            error: error.message,
            code: 'version_conflict',
            expectedRevision: error.expectedRevision || null,
            currentRevision: error.currentRevision || null,
          });
        }
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
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.evaluate' }))) return;
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
          riskThresholdVersion: tenantRuntime.riskThresholdVersion,
          variableValidation,
        });
        const outputEvaluation = evaluateTemplateRisk({
          scope: 'output',
          category: template.category,
          content: contentForEvaluation,
          tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
          riskThresholdVersion: tenantRuntime.riskThresholdVersion,
          variableValidation,
          enforceStrictTemplateVariables: true,
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
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.activate' }))) return;

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
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.archive' }))) return;

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
        if (!(await ensureAllowedTemplate(access, req, res, { authStore, action: 'templates.clone' }))) return;

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
