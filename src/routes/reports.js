const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { parsePilotReportDays, buildPilotReport } = require('../reports/pilotReport');

function createReportsRouter({
  templateStore,
  authStore,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get('/reports/pilot', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const days = parsePilotReportDays(req.query?.days, 14);
      const tenantId = req.auth.tenantId;
      const report = await buildPilotReport({
        templateStore,
        authStore,
        tenantId,
        days,
        evaluationLimit: 500,
        auditLimit: 500,
        generatedAt: new Date(),
      });

      await authStore.addAuditEvent({
        tenantId,
        actorUserId: req.auth.userId,
        action: 'reports.pilot.read',
        outcome: 'success',
        targetType: 'report',
        targetId: tenantId,
        metadata: {
          days,
          evaluations: Number(report?.kpis?.evaluationsTotal || 0),
          auditEvents: Number(report?.kpis?.auditEventsCount || 0),
        },
      });

      return res.json(report);
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
