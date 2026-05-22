const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { TEMPLATE_CATEGORIES } = require('../templates/constants');
const { subscribeRuntimeEvent } = require('../observability/eventBus');

function parseIntSafe(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildCategoryCounter() {
  const counter = {};
  for (const category of TEMPLATE_CATEGORIES) counter[category] = 0;
  return counter;
}

function writeSseEvent(res, { event = 'message', id = '', data = {} } = {}) {
  const eventName = typeof event === 'string' && event.trim() ? event.trim() : 'message';
  const eventId = typeof id === 'string' ? id.trim() : '';
  if (eventId) {
    res.write(`id: ${eventId}\n`);
  }
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function createDashboardRouter({
  templateStore,
  tenantConfigStore,
  authStore,
  runtimeMetricsStore = null,
  scheduler = null,
  sloTicketStore = null,
  releaseGovernanceStore = null,
  config = {},
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  async function buildStreamStatusSnapshot({ tenantId }) {
    const runtimeMetrics =
      runtimeMetricsStore && typeof runtimeMetricsStore.getSnapshot === 'function'
        ? runtimeMetricsStore.getSnapshot({ areaLimit: 6 })
        : null;
    const totalRequests = Number(runtimeMetrics?.totals?.requests || 0);
    const sampledRequests = Number(runtimeMetrics?.totals?.sampledRequests || 0);
    const serverErrors = Number(runtimeMetrics?.totals?.statusBuckets?.['5xx'] || 0);
    const errorRateDenom = totalRequests > 0 ? totalRequests : sampledRequests;
    const errorRatePct =
      errorRateDenom > 0
        ? Number(((serverErrors / Math.max(1, errorRateDenom)) * 100).toFixed(3))
        : 0;
    const incidents =
      typeof templateStore?.summarizeIncidents === 'function'
        ? await templateStore.summarizeIncidents({ tenantId })
        : null;
    const sloTickets =
      sloTicketStore && typeof sloTicketStore.summarize === 'function'
        ? await sloTicketStore.summarize({ tenantId })
        : null;
    const schedulerStatus =
      scheduler && typeof scheduler.getStatus === 'function' ? scheduler.getStatus() : null;
    const releaseGovernance =
      releaseGovernanceStore && typeof releaseGovernanceStore.evaluateCycle === 'function'
        ? await releaseGovernanceStore.evaluateCycle({
            tenantId,
            requiredNoGoFreeDays: Number(config?.releaseNoGoFreeDays || 14),
            requirePentestEvidence: Boolean(config?.releaseRequirePentestEvidence),
            pentestMaxAgeDays: Number(config?.releasePentestMaxAgeDays || 120),
            postLaunchReviewWindowDays: Number(config?.releasePostLaunchReviewWindowDays || 30),
            postLaunchStabilizationDays: Number(config?.releasePostLaunchStabilizationDays || 14),
            enforcePostLaunchStabilization: Boolean(config?.releaseEnforcePostLaunchStabilization),
            requireDistinctSignoffUsers: Boolean(config?.releaseRequireDistinctSignoffUsers),
            realityAuditIntervalDays: Number(config?.releaseRealityAuditIntervalDays || 90),
            requireFinalLiveSignoff: Boolean(config?.releaseRequireFinalLiveSignoff),
          })
        : null;

    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      latency: {
        p95Ms: Number(runtimeMetrics?.latency?.p95Ms || 0),
        p99Ms: Number(runtimeMetrics?.latency?.p99Ms || 0),
      },
      availability: {
        totalRequests,
        sampledRequests,
        serverErrors,
        errorRatePct,
      },
      incidents: {
        open: Number(incidents?.totals?.openUnresolved || 0),
        breachedOpen: Number(incidents?.totals?.breachedOpen || 0),
      },
      sloTickets: {
        open: Number(sloTickets?.totals?.open || 0),
        openBreaches: Number(sloTickets?.totals?.openBreaches || 0),
      },
      scheduler: {
        enabled: Boolean(schedulerStatus?.enabled),
        started: Boolean(schedulerStatus?.started),
        runningJobs: Array.isArray(schedulerStatus?.jobs)
          ? schedulerStatus.jobs.filter((item) => item?.running).map((item) => item.id)
          : [],
      },
      releaseGovernance: {
        cycleId: releaseGovernance?.cycle?.id || null,
        status: releaseGovernance?.cycle?.status || null,
        releaseGatePassed: releaseGovernance?.evaluation?.releaseGatePassed === true,
        blockers: Number(releaseGovernance?.evaluation?.blockers?.length || 0),
      },
    };
  }

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

  router.get(
    '/dashboard/owner/stream',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const tenantId = req.auth.tenantId;
      let closed = false;
      res.status(200);
      res.setHeader('content-type', 'text/event-stream');
      res.setHeader('cache-control', 'no-cache, no-transform');
      res.setHeader('connection', 'keep-alive');
      res.setHeader('x-accel-buffering', 'no');
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      res.write('retry: 5000\n\n');
      writeSseEvent(res, {
        event: 'connected',
        id: `${Date.now()}`,
        data: {
          tenantId,
          connectedAt: new Date().toISOString(),
        },
      });

      try {
        const recentAuditEvents = await authStore.listAuditEvents({ tenantId, limit: 10 });
        writeSseEvent(res, {
          event: 'snapshot',
          id: `${Date.now()}-snapshot`,
          data: {
            tenantId,
            events: recentAuditEvents,
          },
        });
      } catch {
        // Ignore snapshot errors for stream startup.
      }

      try {
        const statusSnapshot = await buildStreamStatusSnapshot({ tenantId });
        writeSseEvent(res, {
          event: 'status',
          id: `${Date.now()}-status`,
          data: statusSnapshot,
        });
      } catch {
        // Ignore status snapshot errors for stream startup.
      }

      const unsubscribe = subscribeRuntimeEvent('audit.event', (envelope) => {
        if (closed) return;
        const event = envelope?.payload;
        if (!event || event.tenantId !== tenantId) return;
        try {
          writeSseEvent(res, {
            event: 'audit',
            id: String(event.id || Date.now()),
            data: {
              id: event.id || null,
              tenantId,
              action: event.action,
              outcome: event.outcome,
              targetType: event.targetType,
              targetId: event.targetId,
              metadata: event.metadata || {},
              ts: event.ts || new Date().toISOString(),
            },
          });
        } catch {
          // Ignore write errors after disconnect.
        }
      });

      const keepAlive = setInterval(() => {
        if (closed) return;
        try {
          res.write(`: keepalive ${Date.now()}\n\n`);
        } catch {
          // Ignore keepalive write errors after disconnect.
        }
      }, 20000);

      const statusPulse = setInterval(async () => {
        if (closed) return;
        try {
          const statusSnapshot = await buildStreamStatusSnapshot({ tenantId });
          writeSseEvent(res, {
            event: 'status',
            id: `${Date.now()}-status`,
            data: statusSnapshot,
          });
        } catch {
          // Ignore transient status pulse errors.
        }
      }, 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepAlive);
        clearInterval(statusPulse);
        unsubscribe();
      };

      req.on('close', cleanup);
      req.on('error', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);
    }
  );

  return router;
}

module.exports = {
  createDashboardRouter,
};
