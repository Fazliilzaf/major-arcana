const path = require('node:path');
const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { evaluateTemplateRisk } = require('../risk/templateRisk');
const { evaluateGoldSetFile } = require('../risk/goldSet');
const { isValidCategory, normalizeCategory } = require('../templates/constants');
const { validateTemplateVariables } = require('../templates/variables');
const { getPolicyFloorDefinition } = require('../policy/floor');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeRiskModifier(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(-10, Math.min(10, Number(num.toFixed(2))));
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

const RISK_GOLD_SET_DEFAULT_PATH = path.join(process.cwd(), 'docs', 'risk', 'gold-set-v1.json');
const DUAL_SIGNOFF_ALLOWED_ROLES = new Set([ROLE_OWNER, ROLE_STAFF]);

async function readTenantConfigSafe(tenantConfigStore, tenantId) {
  const config = await tenantConfigStore.getTenantConfig(tenantId);
  return {
    tenantId,
    riskSensitivityModifier: normalizeRiskModifier(config?.riskSensitivityModifier ?? 0),
    riskThresholdVersion: parsePositiveInt(config?.riskThresholdVersion) || 1,
    riskThresholdHistoryCount: Array.isArray(config?.riskThresholdHistory)
      ? config.riskThresholdHistory.length
      : 0,
    templateVariableAllowlistByCategory:
      config?.templateVariableAllowlistByCategory || {},
    templateRequiredVariablesByCategory:
      config?.templateRequiredVariablesByCategory || {},
    templateSignaturesByChannel: config?.templateSignaturesByChannel || {},
    source: 'tenant_config',
  };
}

async function resolveRiskDualSignOff({
  req,
  authStore,
  tenantId,
  required = false,
} = {}) {
  const rawSignOff = req?.body?.signOff;
  const signOff =
    rawSignOff && typeof rawSignOff === 'object' && !Array.isArray(rawSignOff)
      ? rawSignOff
      : null;
  const approverUserId = normalizeText(signOff?.approverUserId || '');
  const note = normalizeText(signOff?.note || signOff?.reason || '');

  if (!approverUserId) {
    if (required) {
      throw new Error('Dual sign-off krävs: signOff.approverUserId saknas.');
    }
    return null;
  }

  const actorUserId = normalizeText(req?.auth?.userId || '');
  if (actorUserId && approverUserId === actorUserId) {
    throw new Error('Dual sign-off kräver annan approver än aktuell användare.');
  }

  if (!authStore || typeof authStore.listTenantMembers !== 'function') {
    throw new Error('Dual sign-off kunde inte verifieras (listTenantMembers saknas).');
  }

  const members = await authStore.listTenantMembers(tenantId);
  const approver =
    (Array.isArray(members) ? members : []).find(
      (item) =>
        normalizeText(item?.user?.id || '') === approverUserId &&
        normalizeText(item?.membership?.status || '').toLowerCase() === 'active' &&
        DUAL_SIGNOFF_ALLOWED_ROLES.has(
          normalizeText(item?.membership?.role || '').toUpperCase()
        )
    ) || null;

  if (!approver) {
    throw new Error(
      'Dual sign-off kunde inte verifieras: approver saknas eller har ogiltig roll/status i tenant.'
    );
  }

  return {
    approverUserId,
    approverMembershipId: normalizeText(approver?.membership?.id || '') || null,
    approverRole: normalizeText(approver?.membership?.role || '').toUpperCase() || null,
    approverEmail: normalizeText(approver?.user?.email || '') || null,
    note,
  };
}

function createRiskRouter({
  tenantConfigStore,
  templateStore,
  authStore,
  config = null,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get('/policy/floor', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    return res.json({
      policyFloor: getPolicyFloorDefinition(),
    });
  });

  router.get('/risk/settings', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const settings = await readTenantConfigSafe(tenantConfigStore, req.auth.tenantId);

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'risk.settings.read',
        outcome: 'success',
        targetType: 'risk_settings',
        targetId: req.auth.tenantId,
      });

      return res.json({
        settings: {
          ...settings,
          allowedRange: {
            min: -10,
            max: 10,
          },
        },
      });
    } catch (error) {
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa riskinställningar.' });
    }
  });

  router.patch('/risk/settings', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const currentSettings = await readTenantConfigSafe(tenantConfigStore, req.auth.tenantId);
      const beforeModifier = normalizeRiskModifier(currentSettings?.riskSensitivityModifier);
      const beforeVersion = parsePositiveInt(currentSettings?.riskThresholdVersion) || 1;
      const nextModifier = normalizeRiskModifier(req.body?.riskSensitivityModifier);
      const note = normalizeText(req.body?.note || '');
      const dualSignOff = await resolveRiskDualSignOff({
        req,
        authStore,
        tenantId: req.auth.tenantId,
        required: Boolean(config?.riskDualSignoffRequired),
      });
      const updated = await tenantConfigStore.updateTenantConfig({
        tenantId: req.auth.tenantId,
        patch: {
          riskSensitivityModifier: nextModifier,
        },
        actorUserId: req.auth.userId,
        riskChangeMeta: {
          changeSource: 'manual_update',
          note,
          dualSignOffRequired: Boolean(config?.riskDualSignoffRequired),
          signOff: dualSignOff,
        },
      });
      const afterModifier = normalizeRiskModifier(updated?.riskSensitivityModifier);
      const afterVersion = parsePositiveInt(updated?.riskThresholdVersion) || beforeVersion;

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'risk.settings.update',
        outcome: 'success',
        targetType: 'risk_settings',
        targetId: req.auth.tenantId,
        metadata: {
          riskSensitivityModifier: nextModifier,
          before: {
            riskSensitivityModifier: beforeModifier,
            riskThresholdVersion: beforeVersion,
          },
          after: {
            riskSensitivityModifier: afterModifier,
            riskThresholdVersion: afterVersion,
          },
          diff: [
            {
              field: 'riskSensitivityModifier',
              before: beforeModifier,
              after: afterModifier,
            },
          ],
          note,
          dualSignOffRequired: Boolean(config?.riskDualSignoffRequired),
          signOff: dualSignOff,
        },
      });

      return res.json({
        settings: {
          tenantId: req.auth.tenantId,
          riskSensitivityModifier: afterModifier,
          riskThresholdVersion: afterVersion,
          riskThresholdHistoryCount: Array.isArray(updated?.riskThresholdHistory)
            ? updated.riskThresholdHistory.length
            : 0,
          allowedRange: {
            min: -10,
            max: 10,
          },
        },
      });
    } catch (error) {
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte uppdatera riskinställningar.' });
    }
  });

  router.get(
    '/risk/settings/versions',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const requestedLimit = Number.parseInt(String(req.query?.limit ?? ''), 10);
        const limit = Number.isFinite(requestedLimit) ? requestedLimit : 20;
        const [settings, versions] = await Promise.all([
          readTenantConfigSafe(tenantConfigStore, req.auth.tenantId),
          tenantConfigStore.listRiskThresholdVersions({
            tenantId: req.auth.tenantId,
            limit,
          }),
        ]);

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'risk.settings.versions.read',
          outcome: 'success',
          targetType: 'risk_settings_versions',
          targetId: req.auth.tenantId,
          metadata: {
            currentVersion: settings.riskThresholdVersion,
            count: versions.length,
            requestedLimit: limit,
          },
        });

        return res.json({
          tenantId: req.auth.tenantId,
          currentVersion: settings.riskThresholdVersion,
          historyCount: settings.riskThresholdHistoryCount,
          count: versions.length,
          versions,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa riskversionshistorik.' });
      }
    }
  );

  router.post(
    '/risk/settings/rollback',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const targetVersion = parsePositiveInt(req.body?.version);
        if (!targetVersion) {
          return res.status(400).json({ error: 'version måste vara ett positivt heltal.' });
        }
        const note = normalizeText(req.body?.note || '');
        const dualSignOff = await resolveRiskDualSignOff({
          req,
          authStore,
          tenantId: req.auth.tenantId,
          required: Boolean(config?.riskDualSignoffRequired),
        });

        const currentSettings = await readTenantConfigSafe(tenantConfigStore, req.auth.tenantId);
        const beforeModifier = normalizeRiskModifier(currentSettings?.riskSensitivityModifier);
        const beforeVersion = parsePositiveInt(currentSettings?.riskThresholdVersion) || 1;

        const target = await tenantConfigStore.getRiskThresholdVersion({
          tenantId: req.auth.tenantId,
          version: targetVersion,
        });
        if (!target) {
          return res.status(404).json({ error: 'Versionen hittades inte.' });
        }

        const targetModifier = normalizeRiskModifier(target?.riskSensitivityModifier);
        const updated = await tenantConfigStore.updateTenantConfig({
          tenantId: req.auth.tenantId,
          patch: {
            riskSensitivityModifier: targetModifier,
          },
          actorUserId: req.auth.userId,
          riskChangeMeta: {
            changeSource: 'rollback',
            note,
            rollbackFromVersion: targetVersion,
            dualSignOffRequired: Boolean(config?.riskDualSignoffRequired),
            signOff: dualSignOff,
          },
        });
        const afterModifier = normalizeRiskModifier(updated?.riskSensitivityModifier);
        const afterVersion = parsePositiveInt(updated?.riskThresholdVersion) || beforeVersion;

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'risk.settings.rollback',
          outcome: 'success',
          targetType: 'risk_settings',
          targetId: req.auth.tenantId,
          metadata: {
            requestedVersion: targetVersion,
            requestedModifier: targetModifier,
            note,
            before: {
              riskSensitivityModifier: beforeModifier,
              riskThresholdVersion: beforeVersion,
            },
            after: {
              riskSensitivityModifier: afterModifier,
              riskThresholdVersion: afterVersion,
            },
            dualSignOffRequired: Boolean(config?.riskDualSignoffRequired),
            signOff: dualSignOff,
          },
        });

        return res.json({
          settings: {
            tenantId: req.auth.tenantId,
            riskSensitivityModifier: afterModifier,
            riskThresholdVersion: afterVersion,
            riskThresholdHistoryCount: Array.isArray(updated?.riskThresholdHistory)
              ? updated.riskThresholdHistory.length
              : 0,
            allowedRange: {
              min: -10,
              max: 10,
            },
          },
          rollback: {
            requestedVersion: targetVersion,
            requestedModifier: targetModifier,
            appliedVersion: afterVersion,
          },
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte rollbacka riskinställning.' });
      }
    }
  );

  router.post('/risk/preview', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const category = normalizeCategory(req.body?.category);
      const content = normalizeText(req.body?.content);
      const scope = normalizeText(req.body?.scope || 'output') || 'output';
      const variables = Array.isArray(req.body?.variables) ? req.body.variables : undefined;
      const strictVariables =
        req.body?.strictVariables === undefined ? true : parseBool(req.body?.strictVariables, true);

      if (!isValidCategory(category)) {
        return res.status(400).json({ error: 'Ogiltig kategori.' });
      }
      if (!content) {
        return res.status(400).json({ error: 'content krävs.' });
      }

      const settings = await readTenantConfigSafe(tenantConfigStore, req.auth.tenantId);
      const variableValidation = validateTemplateVariables({
        category,
        content,
        variables,
        allowlistOverridesByCategory: settings.templateVariableAllowlistByCategory,
        requiredOverridesByCategory: settings.templateRequiredVariablesByCategory,
      });
      const evaluation = evaluateTemplateRisk({
        scope,
        category,
        content,
        tenantRiskModifier: settings.riskSensitivityModifier,
        riskThresholdVersion: settings.riskThresholdVersion,
        variableValidation,
        enforceStrictTemplateVariables: strictVariables,
      });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'risk.preview',
        outcome: 'success',
        targetType: 'risk_preview',
        targetId: req.auth.tenantId,
        metadata: {
          category,
          strictVariables,
          riskLevel: evaluation.riskLevel,
          decision: evaluation.decision,
        },
      });

      return res.json({
        settings,
        variableValidation,
        evaluation,
      });
    } catch (error) {
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte köra risk preview.' });
    }
  });

  router.get(
    '/risk/precision/report',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const settings = await readTenantConfigSafe(tenantConfigStore, req.auth.tenantId);
        const hasModifierQuery = req.query?.modifier !== undefined;
        const modifier = hasModifierQuery
          ? normalizeRiskModifier(req.query?.modifier)
          : settings.riskSensitivityModifier;
        const hasThresholdVersionQuery = req.query?.thresholdVersion !== undefined;
        const thresholdVersion = hasThresholdVersionQuery
          ? parsePositiveInt(req.query?.thresholdVersion) || settings.riskThresholdVersion
          : settings.riskThresholdVersion;
        const inputFile = RISK_GOLD_SET_DEFAULT_PATH;
        const evaluated = await evaluateGoldSetFile({
          filePath: inputFile,
          tenantRiskModifier: modifier,
          riskThresholdVersion: thresholdVersion,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'risk.precision.report.read',
          outcome: 'success',
          targetType: 'risk_precision_report',
          targetId: req.auth.tenantId,
          metadata: {
            modifier,
            thresholdVersion,
            inputFile,
            datasetVersion: evaluated?.dataset?.version || 'unknown',
            cases: Number(evaluated?.report?.totals?.cases || 0),
            bandAccuracy: Number(evaluated?.report?.totals?.bandAccuracy || 0),
            levelAccuracy: Number(evaluated?.report?.totals?.levelAccuracy || 0),
          },
        });

        return res.json({
          settings,
          calibrationInput: {
            modifier,
            thresholdVersion,
          },
          dataset: evaluated.dataset,
          report: evaluated.report,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa risk precision-rapport.' });
      }
    }
  );

  router.get(
    '/risk/calibration/suggestion',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (!templateStore || typeof templateStore.summarizeRisk !== 'function') {
          return res.status(500).json({ error: 'Risk calibration är inte tillgänglig.' });
        }

        const [settings, summary] = await Promise.all([
          readTenantConfigSafe(tenantConfigStore, req.auth.tenantId),
          templateStore.summarizeRisk({
            tenantId: req.auth.tenantId,
            minRiskLevel: 1,
          }),
        ]);

        const total = Number(summary?.totals?.evaluations || 0);
        const byLevel = summary?.byLevel || {};
        const low = Number(byLevel['1'] || 0) + Number(byLevel['2'] || 0);
        const high = Number(byLevel['4'] || 0) + Number(byLevel['5'] || 0);

        const lowRate = total > 0 ? low / total : 0;
        const highRate = total > 0 ? high / total : 0;

        let suggestedModifier = settings.riskSensitivityModifier;
        let reason = 'stable';
        let confidence = 0.45;

        if (total < 5) {
          reason = 'insufficient_data';
          confidence = 0.2;
        } else if (highRate >= 0.3) {
          suggestedModifier = normalizeRiskModifier(settings.riskSensitivityModifier + 1.5);
          reason = 'too_many_high_critical';
          confidence = 0.78;
        } else if (highRate <= 0.05 && lowRate >= 0.75) {
          suggestedModifier = normalizeRiskModifier(settings.riskSensitivityModifier - 1);
          reason = 'mostly_low_risk';
          confidence = 0.7;
        }

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'risk.calibration.suggestion',
          outcome: 'success',
          targetType: 'risk_calibration',
          targetId: req.auth.tenantId,
          metadata: {
            currentModifier: settings.riskSensitivityModifier,
            suggestedModifier,
            totalEvaluations: total,
            highRate,
            lowRate,
            reason,
          },
        });

        return res.json({
          settings,
          summary: {
            total,
            low,
            high,
            lowRate,
            highRate,
          },
          suggestion: {
            suggestedModifier,
            reason,
            confidence,
            requiresOwnerApproval: true,
          },
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte beräkna kalibreringsförslag.' });
      }
    }
  );

  router.post(
    '/risk/calibration/apply-suggestion',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const currentSettings = await readTenantConfigSafe(tenantConfigStore, req.auth.tenantId);
        const beforeModifier = normalizeRiskModifier(currentSettings?.riskSensitivityModifier);
        const beforeVersion = parsePositiveInt(currentSettings?.riskThresholdVersion) || 1;
        const nextModifier = normalizeRiskModifier(req.body?.suggestedModifier);
        const note = normalizeText(req.body?.note || '');
        const dualSignOff = await resolveRiskDualSignOff({
          req,
          authStore,
          tenantId: req.auth.tenantId,
          required: Boolean(config?.riskDualSignoffRequired),
        });

        const updated = await tenantConfigStore.updateTenantConfig({
          tenantId: req.auth.tenantId,
          patch: {
            riskSensitivityModifier: nextModifier,
          },
          actorUserId: req.auth.userId,
          riskChangeMeta: {
            changeSource: 'calibration_apply',
            note,
            dualSignOffRequired: Boolean(config?.riskDualSignoffRequired),
            signOff: dualSignOff,
          },
        });
        const afterModifier = normalizeRiskModifier(updated?.riskSensitivityModifier);
        const afterVersion = parsePositiveInt(updated?.riskThresholdVersion) || beforeVersion;

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'risk.calibration.apply_suggestion',
          outcome: 'success',
          targetType: 'risk_calibration',
          targetId: req.auth.tenantId,
          metadata: {
            appliedModifier: nextModifier,
            note,
            before: {
              riskSensitivityModifier: beforeModifier,
              riskThresholdVersion: beforeVersion,
            },
            after: {
              riskSensitivityModifier: afterModifier,
              riskThresholdVersion: afterVersion,
            },
            diff: [
              {
                field: 'riskSensitivityModifier',
                before: beforeModifier,
                after: afterModifier,
              },
            ],
            dualSignOffRequired: Boolean(config?.riskDualSignoffRequired),
            signOff: dualSignOff,
          },
        });

        return res.json({
          settings: {
            tenantId: req.auth.tenantId,
            riskSensitivityModifier: afterModifier,
            riskThresholdVersion: afterVersion,
            riskThresholdHistoryCount: Array.isArray(updated?.riskThresholdHistory)
              ? updated.riskThresholdHistory.length
              : 0,
          },
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte applicera kalibreringsförslag.' });
      }
    }
  );

  return router;
}

module.exports = {
  createRiskRouter,
};
