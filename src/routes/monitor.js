const fs = require('node:fs/promises');
const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function readFileMeta(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return {
      path: filePath,
      exists: true,
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  } catch {
    return {
      path: filePath,
      exists: false,
      sizeBytes: 0,
      updatedAt: null,
    };
  }
}

function mb(value) {
  return Number((Number(value || 0) / 1024 / 1024).toFixed(2));
}

function toAgeDaysSince(isoTs, nowMs = Date.now()) {
  const ts = Date.parse(String(isoTs || ''));
  if (!Number.isFinite(ts)) return null;
  if (ts > nowMs) return 0;
  return Number(((nowMs - ts) / (24 * 60 * 60 * 1000)).toFixed(2));
}

function createMonitorRouter({
  authStore,
  templateStore,
  tenantConfigStore,
  config,
  scheduler = null,
  requireAuth,
  requireRole,
  runtimeState,
}) {
  const router = express.Router();

  router.get(
    '/monitor/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const tenantId = req.auth.tenantId;
        const supportsIncidents = typeof templateStore?.summarizeIncidents === 'function';

        const [
          templates,
          summary,
          incidentSummary,
          members,
          auditEvents,
          latestRestoreDrillAudit,
          tenantConfig,
          authFile,
          templateFile,
          tenantFile,
        ] =
          await Promise.all([
            templateStore.listTemplates({ tenantId }),
            templateStore.summarizeRisk({ tenantId, minRiskLevel: 1 }),
            supportsIncidents
              ? templateStore.summarizeIncidents({ tenantId })
              : Promise.resolve(null),
            authStore.listTenantMembers(tenantId),
            authStore.listAuditEvents({ tenantId, limit: 300 }),
            typeof authStore.getLatestAuditEvent === 'function'
              ? authStore.getLatestAuditEvent({
                  tenantId,
                  action: 'scheduler.job.restore_drill_preview.run',
                  outcome: 'success',
                })
              : Promise.resolve(null),
            tenantConfigStore.getTenantConfig(tenantId),
            readFileMeta(authStore.filePath),
            readFileMeta(templateStore.filePath),
            readFileMeta(tenantConfigStore.filePath),
          ]);

        const now = Date.now();
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const recentAuditCount = auditEvents.filter((item) => {
          const ts = Date.parse(item.ts || '');
          return Number.isFinite(ts) && ts >= dayAgo;
        }).length;

        const activeStaff = members.filter(
          (item) => item?.membership?.role === 'STAFF' && item?.membership?.status === 'active'
        ).length;
        const disabledStaff = members.filter(
          (item) => item?.membership?.role === 'STAFF' && item?.membership?.status === 'disabled'
        ).length;

        const memoryUsage = process.memoryUsage();
        const activeTemplates = templates.filter((item) => item.currentActiveVersionId).length;
        const schedulerStatus =
          scheduler && typeof scheduler.getStatus === 'function'
            ? scheduler.getStatus()
            : null;
        const schedulerJobs = Array.isArray(schedulerStatus?.jobs) ? schedulerStatus.jobs : [];
        const restoreDrillJob =
          schedulerJobs.find((item) => String(item?.id || '') === 'restore_drill_preview') || null;
        const restoreDrillLastSuccessAt = toIso(
          latestRestoreDrillAudit?.ts || restoreDrillJob?.lastSuccessAt
        );
        const restoreDrillAgeDays = toAgeDaysSince(restoreDrillLastSuccessAt, now);
        const restoreDrillMaxAgeDays = Math.max(
          1,
          Math.min(365, Number(config?.monitorRestoreDrillMaxAgeDays || 30))
        );
        const restoreDrillHealthy =
          restoreDrillAgeDays !== null && restoreDrillAgeDays <= restoreDrillMaxAgeDays;
        const restoreDrillNoGo =
          !schedulerStatus?.enabled || !schedulerStatus?.started || !restoreDrillHealthy;

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'monitor.status.read',
          outcome: 'success',
          targetType: 'monitor_status',
          targetId: tenantId,
        });

        return res.json({
          generatedAt: new Date().toISOString(),
          runtime: {
            ready: runtimeState?.ready === true,
            startedAt: toIso(runtimeState?.startedAt),
            uptimeSec: Number(process.uptime().toFixed(1)),
            pid: process.pid,
            nodeVersion: process.version,
            platform: process.platform,
            aiProvider: config?.aiProvider || 'openai',
            aiModel: config?.openaiModel || '',
            memoryMb: {
              rss: mb(memoryUsage.rss),
              heapTotal: mb(memoryUsage.heapTotal),
              heapUsed: mb(memoryUsage.heapUsed),
              external: mb(memoryUsage.external),
            },
            scheduler: schedulerStatus
              ? {
                  enabled: Boolean(schedulerStatus.enabled),
                  started: Boolean(schedulerStatus.started),
                  startedAt: toIso(schedulerStatus.startedAt),
                  jobsEnabled: Array.isArray(schedulerStatus.jobs)
                    ? schedulerStatus.jobs.filter((item) => item?.enabled).length
                    : 0,
                  restoreDrill: {
                    maxAgeDays: restoreDrillMaxAgeDays,
                    lastSuccessAt: restoreDrillLastSuccessAt,
                    ageDays: restoreDrillAgeDays,
                    healthy: restoreDrillHealthy,
                    noGo: restoreDrillNoGo,
                  },
                }
              : {
                  enabled: false,
                  started: false,
                  startedAt: null,
                  jobsEnabled: 0,
                  restoreDrill: {
                    maxAgeDays: restoreDrillMaxAgeDays,
                    lastSuccessAt: null,
                    ageDays: null,
                    healthy: false,
                    noGo: true,
                  },
                },
          },
          security: {
            cors: {
              strict: Boolean(config?.corsStrict),
              allowNoOrigin: Boolean(config?.corsAllowNoOrigin),
              allowCredentials: Boolean(config?.corsAllowCredentials),
              allowedOrigins: Array.isArray(config?.corsAllowedOrigins)
                ? config.corsAllowedOrigins
                : [],
            },
            sessions: {
              ttlHours: Number(config?.authSessionTtlHours || 0),
              idleTimeoutMinutes: Number(config?.authSessionIdleMinutes || 0),
              loginRotationScope: config?.authLoginSessionRotationScope || 'none',
            },
            rateLimits: {
              loginMax: Number(config?.authLoginRateLimitMax || 0),
              selectTenantMax: Number(config?.authSelectTenantRateLimitMax || 0),
              apiReadMax: Number(config?.apiRateLimitReadMax || 0),
              apiWriteMax: Number(config?.apiRateLimitWriteMax || 0),
              windowSec: Number(config?.apiRateLimitWindowSec || 0),
            },
          },
          tenant: {
            tenantId,
            assistantName: tenantConfig.assistantName,
            toneStyle: tenantConfig.toneStyle,
            brandProfile: tenantConfig.brandProfile,
            riskSensitivityModifier: tenantConfig.riskSensitivityModifier,
          },
          kpis: {
            templatesTotal: templates.length,
            templatesActive: activeTemplates,
            evaluationsTotal: Number(summary?.totals?.evaluations || 0),
            highCriticalOpen: Number(summary?.totals?.highCriticalOpen || 0),
            incidentsTotal: Number(incidentSummary?.totals?.incidents || 0),
            incidentsOpen: Number(incidentSummary?.totals?.openUnresolved || 0),
            incidentsBreachedOpen: Number(incidentSummary?.totals?.breachedOpen || 0),
            restoreDrillAgeDays,
            restoreDrillHealthy,
            staffActive: activeStaff,
            staffDisabled: disabledStaff,
            auditEvents24h: recentAuditCount,
          },
          gates: {
            restoreDrill: {
              maxAgeDays: restoreDrillMaxAgeDays,
              lastSuccessAt: restoreDrillLastSuccessAt,
              ageDays: restoreDrillAgeDays,
              healthy: restoreDrillHealthy,
              noGo: restoreDrillNoGo,
            },
          },
          stores: {
            auth: authFile,
            templates: templateFile,
            tenantConfig: tenantFile,
          },
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa monitor-status.' });
      }
    }
  );

  return router;
}

module.exports = {
  createMonitorRouter,
};
