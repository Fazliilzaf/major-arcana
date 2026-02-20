const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { getPolicyFloorDefinition } = require('../policy/floor');
const { AGENTS, INTENTS, runAdminOrchestration } = require('../orchestrator/adminOrchestrator');

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function createOrchestratorRouter({
  tenantConfigStore,
  authStore,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get(
    '/orchestrator/meta',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      return res.json({
        agents: AGENTS,
        intents: INTENTS,
        policyFloor: getPolicyFloorDefinition(),
      });
    }
  );

  router.post(
    '/orchestrator/admin-run',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const prompt = normalizeText(req.body?.prompt);
        if (!prompt) {
          return res.status(400).json({ error: 'prompt krävs.' });
        }

        const tenantConfig = await tenantConfigStore.getTenantConfig(req.auth.tenantId);
        const result = await runAdminOrchestration({
          prompt,
          role: req.auth.role,
          tenantId: req.auth.tenantId,
          tenantConfig,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'orchestrator.admin_run',
          outcome: 'success',
          targetType: 'orchestration',
          targetId: req.auth.tenantId,
          metadata: {
            intent: result.intent,
            confidence: result.confidence,
            safetyAdjusted: result.output?.safetyAdjusted === true,
            riskLevel: result.output?.risk?.riskLevel || null,
          },
        });

        return res.json(result);
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte köra orchestrator.' });
      }
    }
  );

  return router;
}

module.exports = {
  createOrchestratorRouter,
};
