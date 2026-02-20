const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { evaluateTemplateRisk } = require('../risk/templateRisk');
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

async function readTenantConfigSafe(tenantConfigStore, tenantId) {
  const config = await tenantConfigStore.getTenantConfig(tenantId);
  return {
    tenantId,
    riskSensitivityModifier: normalizeRiskModifier(config?.riskSensitivityModifier ?? 0),
    templateVariableAllowlistByCategory:
      config?.templateVariableAllowlistByCategory || {},
    templateRequiredVariablesByCategory:
      config?.templateRequiredVariablesByCategory || {},
    templateSignaturesByChannel: config?.templateSignaturesByChannel || {},
    source: 'tenant_config',
  };
}

function createRiskRouter({
  tenantConfigStore,
  templateStore,
  authStore,
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
      const nextModifier = normalizeRiskModifier(req.body?.riskSensitivityModifier);
      const updated = await tenantConfigStore.updateTenantConfig({
        tenantId: req.auth.tenantId,
        patch: {
          riskSensitivityModifier: nextModifier,
        },
        actorUserId: req.auth.userId,
      });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'risk.settings.update',
        outcome: 'success',
        targetType: 'risk_settings',
        targetId: req.auth.tenantId,
        metadata: {
          riskSensitivityModifier: nextModifier,
        },
      });

      return res.json({
        settings: {
          tenantId: req.auth.tenantId,
          riskSensitivityModifier: normalizeRiskModifier(updated?.riskSensitivityModifier),
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

  router.post('/risk/preview', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const category = normalizeCategory(req.body?.category);
      const content = normalizeText(req.body?.content);
      const scope = normalizeText(req.body?.scope || 'output') || 'output';
      const variables = Array.isArray(req.body?.variables) ? req.body.variables : undefined;

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
        variableValidation,
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
        const nextModifier = normalizeRiskModifier(req.body?.suggestedModifier);
        const note = normalizeText(req.body?.note || '');

        const updated = await tenantConfigStore.updateTenantConfig({
          tenantId: req.auth.tenantId,
          patch: {
            riskSensitivityModifier: nextModifier,
          },
          actorUserId: req.auth.userId,
        });

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
          },
        });

        return res.json({
          settings: {
            tenantId: req.auth.tenantId,
            riskSensitivityModifier: normalizeRiskModifier(updated?.riskSensitivityModifier),
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
