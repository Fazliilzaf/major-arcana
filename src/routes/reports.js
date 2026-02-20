const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

function parseDays(value, fallback = 14) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(90, parsed));
}

function parseIso(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isSince(value, sinceDate) {
  const parsed = parseIso(value);
  if (!parsed) return false;
  return parsed >= sinceDate;
}

function countBy(items, getKey) {
  const result = {};
  for (const item of items) {
    const key = String(getKey(item) || 'unknown');
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function createReportsRouter({
  templateStore,
  authStore,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get('/reports/pilot', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const days = parseDays(req.query?.days, 14);
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const tenantId = req.auth.tenantId;

      const [templates, evaluations, riskSummary, members, auditEvents] = await Promise.all([
        templateStore.listTemplates({ tenantId, includeVersions: true }),
        templateStore.listEvaluations({ tenantId, minRiskLevel: 1, limit: 500 }),
        templateStore.summarizeRisk({ tenantId, minRiskLevel: 1 }),
        authStore.listTenantMembers(tenantId),
        authStore.listAuditEvents({ tenantId, limit: 500 }),
      ]);

      const windowEvaluations = evaluations.filter((item) => isSince(item.evaluatedAt, sinceDate));
      const windowAuditEvents = auditEvents.filter((item) => isSince(item.ts, sinceDate));

      let draftsCount = 0;
      let archivedCount = 0;
      for (const template of templates) {
        for (const version of Array.isArray(template.versions) ? template.versions : []) {
          if (version.state === 'draft') draftsCount += 1;
          if (version.state === 'archived') archivedCount += 1;
        }
      }

      const highCriticalWindow = windowEvaluations.filter(
        (item) => Number(item.riskLevel || 0) >= 4
      );
      const ownerPendingWindow = windowEvaluations.filter(
        (item) => String(item.ownerDecision || 'pending') === 'pending'
      );

      const staffActive = members.filter(
        (item) => item?.membership?.role === 'STAFF' && item?.membership?.status === 'active'
      ).length;
      const staffDisabled = members.filter(
        (item) => item?.membership?.role === 'STAFF' && item?.membership?.status === 'disabled'
      ).length;

      const ownerActionCoveragePct =
        windowEvaluations.length > 0
          ? Number(
              (((windowEvaluations.length - ownerPendingWindow.length) / windowEvaluations.length) * 100).toFixed(2)
            )
          : 0;

      const activationEvents = windowAuditEvents.filter(
        (item) => item.action === 'templates.activate_version'
      ).length;

      await authStore.addAuditEvent({
        tenantId,
        actorUserId: req.auth.userId,
        action: 'reports.pilot.read',
        outcome: 'success',
        targetType: 'report',
        targetId: tenantId,
        metadata: {
          days,
          evaluations: windowEvaluations.length,
          auditEvents: windowAuditEvents.length,
        },
      });

      return res.json({
        tenantId,
        windowDays: days,
        since: sinceDate.toISOString(),
        generatedAt: new Date().toISOString(),
        kpis: {
          templatesTotal: templates.length,
          templatesWithActiveVersion: templates.filter((item) => item.currentActiveVersionId).length,
          draftsCount,
          archivedCount,
          evaluationsTotal: windowEvaluations.length,
          highCriticalTotal: highCriticalWindow.length,
          ownerDecisionPending: ownerPendingWindow.length,
          staffActive,
          staffDisabled,
          auditEventsCount: windowAuditEvents.length,
          activationEvents,
        },
        risk: {
          byLevel: countBy(windowEvaluations, (item) => item.riskLevel),
          byDecision: countBy(windowEvaluations, (item) => item.decision),
          byOwnerDecision: countBy(windowEvaluations, (item) => item.ownerDecision || 'pending'),
          highCriticalOpen: riskSummary?.highCriticalOpen || [],
        },
        quality: {
          ownerActionCoveragePct,
          policyAdjustedCount: windowEvaluations.filter(
            (item) => Array.isArray(item.policyAdjustments) && item.policyAdjustments.length > 0
          ).length,
        },
        operational: {
          recentAuditEvents: windowAuditEvents.slice(0, 50),
        },
      });
    } catch (error) {
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte skapa pilotrapport.' });
    }
  });

  return router;
}

module.exports = {
  createReportsRouter,
};
