const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { TEMPLATE_CATEGORIES } = require('../templates/constants');

function parseIntSafe(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildCategoryCounter() {
  const counter = {};
  for (const category of TEMPLATE_CATEGORIES) counter[category] = 0;
  return counter;
}

function createDashboardRouter({
  templateStore,
  tenantConfigStore,
  authStore,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get(
    '/dashboard/owner',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const minRiskLevel = parseIntSafe(req.query?.minRiskLevel, 1);
        const auditLimit = Math.max(1, Math.min(100, parseIntSafe(req.query?.auditLimit, 20)));
        const tenantId = req.auth.tenantId;
        const supportsIncidents =
          typeof templateStore?.summarizeIncidents === 'function' &&
          typeof templateStore?.listIncidents === 'function';

        const [tenantConfig, templates, riskSummary, recentAuditEvents, incidentSummary, incidentOpen] =
          await Promise.all([
            tenantConfigStore.getTenantConfig(tenantId),
            templateStore.listTemplates({ tenantId }),
            templateStore.summarizeRisk({ tenantId, minRiskLevel }),
            authStore.listAuditEvents({ tenantId, limit: auditLimit }),
            supportsIncidents
              ? templateStore.summarizeIncidents({ tenantId })
              : Promise.resolve(null),
            supportsIncidents
              ? templateStore.listIncidents({ tenantId, status: 'open', limit: 10 })
              : Promise.resolve([]),
          ]);

        const byCategory = buildCategoryCounter();
        let templatesWithActiveVersion = 0;

        for (const template of templates) {
          if (byCategory[template.category] === undefined) byCategory[template.category] = 0;
          byCategory[template.category] += 1;
          if (template.currentActiveVersionId) templatesWithActiveVersion += 1;
        }

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'dashboard.owner.read',
          outcome: 'success',
          targetType: 'dashboard',
          targetId: tenantId,
        });

        return res.json({
          tenantId,
          role: req.auth.role,
          tenantConfig,
          templates: {
            total: templates.length,
            withActiveVersion: templatesWithActiveVersion,
            byCategory,
          },
          riskSummary,
          incidents: {
            summary: incidentSummary || {
              tenantId,
              totals: {
                incidents: Number(riskSummary?.totals?.highCriticalOpen || 0),
                openUnresolved: Number(riskSummary?.totals?.highCriticalOpen || 0),
                breachedOpen: 0,
              },
              generatedAt: new Date().toISOString(),
            },
            open: Array.isArray(incidentOpen)
              ? incidentOpen
              : Array.isArray(incidentSummary?.openTop)
                ? incidentSummary.openTop
                : [],
          },
          recentAuditEvents,
          generatedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa owner dashboard.' });
      }
    }
  );

  return router;
}

module.exports = {
  createDashboardRouter,
};
