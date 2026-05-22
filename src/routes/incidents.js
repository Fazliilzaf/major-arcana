const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

function parseIntSafe(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createIncidentsRouter({
  templateStore,
  authStore,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  function ensureIncidentMethods() {
    return (
      templateStore &&
      typeof templateStore.listIncidents === 'function' &&
      typeof templateStore.getIncident === 'function' &&
      typeof templateStore.summarizeIncidents === 'function'
    );
  }

  router.get('/incidents', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      if (!ensureIncidentMethods()) {
        return res.status(500).json({ error: 'Incident API ar inte tillganglig.' });
      }

      const status = normalizeText(req.query?.status || 'open');
      const severity = normalizeText(req.query?.severity || '');
      const limit = Math.max(1, Math.min(500, parseIntSafe(req.query?.limit, 100)));
      const sinceDays = Math.max(0, Math.min(365, parseIntSafe(req.query?.sinceDays, 0)));
      const search = normalizeText(req.query?.search || '');
      const ownerUserId = normalizeText(req.query?.ownerUserId || '');
      const tenantId = req.auth.tenantId;

      const incidents = await templateStore.listIncidents({
        tenantId,
        status,
        severity,
        limit,
        sinceDays,
        search,
        ownerUserId,
      });

      await authStore.addAuditEvent({
        tenantId,
        actorUserId: req.auth.userId,
        action: 'incidents.list.read',
        outcome: 'success',
        targetType: 'incident_collection',
        targetId: tenantId,
        metadata: {
          status: status || 'open',
          severity: severity || null,
          limit,
          sinceDays,
          count: incidents.length,
        },
      });

      return res.json({
        tenantId,
        status: status || 'open',
        severity: severity || null,
        count: incidents.length,
        incidents,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte lasa incidenter.' });
    }
  });

  router.get(
    '/incidents/summary',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (!ensureIncidentMethods()) {
          return res.status(500).json({ error: 'Incident API ar inte tillganglig.' });
        }

        const tenantId = req.auth.tenantId;
        const summary = await templateStore.summarizeIncidents({ tenantId });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'incidents.summary.read',
          outcome: 'success',
          targetType: 'incident_summary',
          targetId: tenantId,
          metadata: {
            incidents: Number(summary?.totals?.incidents || 0),
            openUnresolved: Number(summary?.totals?.openUnresolved || 0),
            breachedOpen: Number(summary?.totals?.breachedOpen || 0),
          },
        });

        return res.json(summary);
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte lasa incidentsammanfattning.' });
      }
    }
  );

  router.get(
    '/incidents/:incidentId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        if (!ensureIncidentMethods()) {
          return res.status(500).json({ error: 'Incident API ar inte tillganglig.' });
        }

        const incidentId = normalizeText(req.params.incidentId);
        if (!incidentId) {
          return res.status(400).json({ error: 'incidentId saknas.' });
        }

        const tenantId = req.auth.tenantId;
        const incident = await templateStore.getIncident({
          tenantId,
          incidentId,
        });
        if (!incident) {
          return res.status(404).json({ error: 'Incidenten hittades inte.' });
        }

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'incidents.detail.read',
          outcome: 'success',
          targetType: 'incident',
          targetId: incidentId,
          metadata: {
            severity: incident.severity,
            status: incident.status,
            sourceEvaluationId: incident.sourceEvaluationId,
          },
        });

        return res.json({
          incident,
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte lasa incident.' });
      }
    }
  );

  return router;
}

module.exports = {
  createIncidentsRouter,
};
