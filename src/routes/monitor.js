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

function createMonitorRouter({
  authStore,
  templateStore,
  tenantConfigStore,
  config,
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

        const [templates, summary, members, auditEvents, tenantConfig, authFile, templateFile, tenantFile] =
          await Promise.all([
            templateStore.listTemplates({ tenantId }),
            templateStore.summarizeRisk({ tenantId, minRiskLevel: 1 }),
            authStore.listTenantMembers(tenantId),
            authStore.listAuditEvents({ tenantId, limit: 300 }),
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
            staffActive: activeStaff,
            staffDisabled: disabledStaff,
            auditEvents24h: recentAuditCount,
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
