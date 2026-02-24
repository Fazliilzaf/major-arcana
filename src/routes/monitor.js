const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');

const { evaluateGoldSetFile } = require('../risk/goldSet');
const { getPolicyFloorDefinition } = require('../policy/floor');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

const RISK_GOLD_SET_DEFAULT_PATH = path.join(process.cwd(), 'docs', 'risk', 'gold-set-v1.json');
const REQUIRED_SCHEDULER_JOBS = Object.freeze([
  'nightly_pilot_report',
  'backup_prune',
  'restore_drill_preview',
  'alert_probe',
]);
const READINESS_BANDS = Object.freeze({
  noGoMaxExclusive: 75,
  limitedBetaMaxExclusive: 85,
});

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
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

function toAgeHoursSince(isoTs, nowMs = Date.now()) {
  const ts = Date.parse(String(isoTs || ''));
  if (!Number.isFinite(ts)) return null;
  if (ts > nowMs) return 0;
  return Number(((nowMs - ts) / (60 * 60 * 1000)).toFixed(2));
}

function parseDays(value, fallback = 90) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(7, Math.min(3650, parsed));
}

function statusScore(status) {
  switch (status) {
    case 'green':
      return 100;
    case 'yellow':
      return 70;
    case 'red':
      return 0;
    case 'unknown':
      return 40;
    default:
      return 40;
  }
}

function normalizeStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['green', 'yellow', 'red', 'unknown'].includes(normalized)) {
    return normalized;
  }
  return 'unknown';
}

function buildCheck({
  id,
  label,
  status = 'unknown',
  required = true,
  value = null,
  target = '',
  evidence = '',
  inferred = false,
} = {}) {
  return {
    id: normalizeText(id),
    label: normalizeText(label),
    status: normalizeStatus(status),
    required: Boolean(required),
    score: statusScore(status),
    target: normalizeText(target) || null,
    value,
    evidence: normalizeText(evidence) || null,
    inferred: Boolean(inferred),
  };
}

function evaluateCategory({
  id,
  label,
  weight = 25,
  checks = [],
} = {}) {
  const safeChecks = Array.isArray(checks) ? checks : [];
  const hasRequiredRed = safeChecks.some((check) => check.required && check.status === 'red');
  const hasAnyRed = safeChecks.some((check) => check.status === 'red');
  const hasAnyYellow = safeChecks.some((check) => check.status === 'yellow');
  const hasRequiredUnknown = safeChecks.some((check) => check.required && check.status === 'unknown');
  const avgScore =
    safeChecks.length > 0
      ? safeChecks.reduce((sum, check) => sum + Number(check.score || 0), 0) / safeChecks.length
      : 0;

  let status = 'green';
  if (hasRequiredRed || avgScore < 60) {
    status = 'red';
  } else if (hasAnyRed || hasAnyYellow || hasRequiredUnknown || avgScore < 85) {
    status = 'yellow';
  }

  return {
    id,
    label,
    weight: Number(weight),
    status,
    score: Number(avgScore.toFixed(2)),
    checks: safeChecks,
  };
}

function pickReadinessBand(score) {
  if (score < READINESS_BANDS.noGoMaxExclusive) return 'no_go';
  if (score < READINESS_BANDS.limitedBetaMaxExclusive) return 'limited_beta';
  return 'controlled_go';
}

function isRecentWithinDays(isoTs, maxDays, nowMs = Date.now()) {
  const ageDays = toAgeDaysSince(isoTs, nowMs);
  return ageDays !== null && ageDays <= maxDays;
}

function findLatestAuditEvent(events = [], { action = '', outcome = '' } = {}) {
  const normalizedAction = normalizeText(action);
  const normalizedOutcome = normalizeText(outcome).toLowerCase();
  for (const item of Array.isArray(events) ? events : []) {
    if (normalizedAction && normalizeText(item?.action) !== normalizedAction) continue;
    if (normalizedOutcome && normalizeText(item?.outcome).toLowerCase() !== normalizedOutcome) continue;
    return item;
  }
  return null;
}

function buildRestoreDrillGate({
  schedulerStatus = null,
  latestRestoreDrillAudit = null,
  monitorRestoreDrillMaxAgeDays = 30,
  nowMs = Date.now(),
} = {}) {
  const schedulerJobs = Array.isArray(schedulerStatus?.jobs) ? schedulerStatus.jobs : [];
  const restoreDrillJob =
    schedulerJobs.find((item) => String(item?.id || '') === 'restore_drill_preview') || null;
  const lastSuccessAt = toIso(latestRestoreDrillAudit?.ts || restoreDrillJob?.lastSuccessAt);
  const ageDays = toAgeDaysSince(lastSuccessAt, nowMs);
  const maxAgeDays = Math.max(1, Math.min(365, Number(monitorRestoreDrillMaxAgeDays || 30)));
  const healthy = ageDays !== null && ageDays <= maxAgeDays;
  const noGo = !schedulerStatus?.enabled || !schedulerStatus?.started || !healthy;
  const healthy30d =
    Boolean(schedulerStatus?.enabled) &&
    Boolean(schedulerStatus?.started) &&
    ageDays !== null &&
    ageDays <= 30;
  return {
    maxAgeDays,
    lastSuccessAt,
    ageDays,
    healthy,
    noGo,
    healthy30d,
    restoreDrillJob,
  };
}

function buildSchedulerFreshnessCheck(job) {
  if (!job) {
    return buildCheck({
      id: 'scheduler_job_missing',
      label: 'Scheduler-job saknas',
      status: 'red',
      required: true,
      evidence: 'Jobdefinition hittades inte i scheduler status.',
    });
  }

  const intervalHours = Math.max(1, Number(job.intervalMs || 0) / (60 * 60 * 1000));
  const maxAgeHours = Math.max(2, Math.ceil(intervalHours * 2.5));
  const ageHours = toAgeHoursSince(job.lastSuccessAt);
  let status = 'green';
  if (!job.enabled || ageHours === null || ageHours > maxAgeHours) {
    status = 'red';
  } else if (ageHours > maxAgeHours * 0.75) {
    status = 'yellow';
  }

  return buildCheck({
    id: `scheduler_job_freshness_${normalizeText(job.id)}`,
    label: `Scheduler freshness ${job.name || job.id}`,
    status,
    required: true,
    target: `lastSuccess <= ${maxAgeHours}h`,
    value: {
      jobId: job.id,
      enabled: Boolean(job.enabled),
      intervalHours: Number(intervalHours.toFixed(2)),
      lastSuccessAt: toIso(job.lastSuccessAt),
      ageHours,
      lastStatus: normalizeText(job.lastStatus) || null,
    },
    evidence: ageHours === null ? 'Saknar lyckad körning.' : '',
  });
}

function createMonitorRouter({
  authStore,
  templateStore,
  tenantConfigStore,
  secretRotationStore = null,
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
          secretRotationFile,
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
            readFileMeta(config?.secretRotationStorePath),
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
        const restoreDrillGate = buildRestoreDrillGate({
          schedulerStatus,
          latestRestoreDrillAudit,
          monitorRestoreDrillMaxAgeDays: config?.monitorRestoreDrillMaxAgeDays,
          nowMs: now,
        });

        const secretRotationStatus =
          secretRotationStore && typeof secretRotationStore.getSecretsStatus === 'function'
            ? await secretRotationStore.getSecretsStatus({
                maxAgeDays: parseDays(config?.secretRotationMaxAgeDays, 90),
              })
            : null;

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
                    maxAgeDays: restoreDrillGate.maxAgeDays,
                    lastSuccessAt: restoreDrillGate.lastSuccessAt,
                    ageDays: restoreDrillGate.ageDays,
                    healthy: restoreDrillGate.healthy,
                    noGo: restoreDrillGate.noGo,
                  },
                }
              : {
                  enabled: false,
                  started: false,
                  startedAt: null,
                  jobsEnabled: 0,
                  restoreDrill: {
                    maxAgeDays: restoreDrillGate.maxAgeDays,
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
              riskMax: Number(config?.riskRateLimitMax || 0),
              orchestratorMax: Number(config?.orchestratorRateLimitMax || 0),
              publicWindowSec: Number(config?.publicRateLimitWindowSec || 0),
              publicClinicMax: Number(config?.publicClinicRateLimitMax || 0),
              publicChatMax: Number(config?.publicChatRateLimitMax || 0),
            },
            secrets: {
              trackingEnabled: Boolean(secretRotationStatus),
              maxAgeDays: parseDays(config?.secretRotationMaxAgeDays, 90),
              tracked: Number(secretRotationStatus?.totals?.tracked || 0),
              required: Number(secretRotationStatus?.totals?.required || 0),
              present: Number(secretRotationStatus?.totals?.present || 0),
              staleRequired: Number(secretRotationStatus?.totals?.staleRequired || 0),
              pendingRotation: Number(secretRotationStatus?.totals?.pendingRotation || 0),
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
            restoreDrillAgeDays: restoreDrillGate.ageDays,
            restoreDrillHealthy: restoreDrillGate.healthy,
            secretRotationStaleRequired: Number(secretRotationStatus?.totals?.staleRequired || 0),
            secretRotationPending: Number(secretRotationStatus?.totals?.pendingRotation || 0),
            staffActive: activeStaff,
            staffDisabled: disabledStaff,
            auditEvents24h: recentAuditCount,
          },
          gates: {
            restoreDrill: {
              maxAgeDays: restoreDrillGate.maxAgeDays,
              lastSuccessAt: restoreDrillGate.lastSuccessAt,
              ageDays: restoreDrillGate.ageDays,
              healthy: restoreDrillGate.healthy,
              noGo: restoreDrillGate.noGo,
            },
          },
          stores: {
            auth: authFile,
            templates: templateFile,
            tenantConfig: tenantFile,
            secretRotation: secretRotationFile,
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

  router.get(
    '/monitor/readiness',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const tenantId = req.auth.tenantId;
        const nowMs = Date.now();
        const supportsIncidents = typeof templateStore?.summarizeIncidents === 'function';
        const supportsListIncidents = typeof templateStore?.listIncidents === 'function';
        const schedulerStatus =
          scheduler && typeof scheduler.getStatus === 'function'
            ? scheduler.getStatus()
            : null;

        const [
          members,
          auditEvents,
          auditIntegrity,
          riskSummary,
          incidentSummary,
          openIncidents,
          latestRestoreDrillAudit,
          tenantConfig,
          secretRotationStatus,
        ] = await Promise.all([
          authStore.listTenantMembers(tenantId),
          authStore.listAuditEvents({ tenantId, limit: 500 }),
          authStore.verifyAuditIntegrity({ maxIssues: 25 }),
          templateStore.summarizeRisk({ tenantId, minRiskLevel: 1 }),
          supportsIncidents ? templateStore.summarizeIncidents({ tenantId }) : Promise.resolve(null),
          supportsIncidents && supportsListIncidents
            ? templateStore.listIncidents({ tenantId, status: 'open', limit: 300 })
            : Promise.resolve([]),
          typeof authStore.getLatestAuditEvent === 'function'
            ? authStore.getLatestAuditEvent({
                tenantId,
                action: 'scheduler.job.restore_drill_preview.run',
                outcome: 'success',
              })
            : Promise.resolve(null),
          tenantConfigStore.getTenantConfig(tenantId),
          secretRotationStore && typeof secretRotationStore.getSecretsStatus === 'function'
            ? secretRotationStore.getSecretsStatus({
                maxAgeDays: parseDays(config?.secretRotationMaxAgeDays, 90),
              })
            : Promise.resolve(null),
        ]);

        const restoreDrillGate = buildRestoreDrillGate({
          schedulerStatus,
          latestRestoreDrillAudit,
          monitorRestoreDrillMaxAgeDays: config?.monitorRestoreDrillMaxAgeDays,
          nowMs,
        });
        const schedulerJobs = Array.isArray(schedulerStatus?.jobs) ? schedulerStatus.jobs : [];
        const schedulerJobMap = new Map(
          schedulerJobs.map((job) => [normalizeText(job?.id), job])
        );
        const schedulerFreshnessChecks = REQUIRED_SCHEDULER_JOBS.map((jobId) =>
          buildSchedulerFreshnessCheck(schedulerJobMap.get(jobId))
        );

        const policyFloor = getPolicyFloorDefinition();
        const policyRules = Array.isArray(policyFloor?.rules) ? policyFloor.rules : [];

        let riskPrecision = null;
        let riskPrecisionError = '';
        try {
          riskPrecision = await evaluateGoldSetFile({
            filePath: RISK_GOLD_SET_DEFAULT_PATH,
            tenantRiskModifier: Number(tenantConfig?.riskSensitivityModifier || 0),
          });
        } catch (error) {
          riskPrecisionError = normalizeText(error?.message || 'okänd risk-precision error');
        }

        const activeOwners = (Array.isArray(members) ? members : []).filter(
          (item) =>
            normalizeText(item?.membership?.role).toUpperCase() === ROLE_OWNER &&
            normalizeText(item?.membership?.status).toLowerCase() === 'active'
        );
        const ownersWithoutMfa = activeOwners.filter(
          (item) => !item?.user?.mfaRequired || !item?.user?.mfaConfigured
        );

        const rateLimitValues = {
          loginMax: Number(config?.authLoginRateLimitMax || 0),
          selectTenantMax: Number(config?.authSelectTenantRateLimitMax || 0),
          apiReadMax: Number(config?.apiRateLimitReadMax || 0),
          apiWriteMax: Number(config?.apiRateLimitWriteMax || 0),
          riskMax: Number(config?.riskRateLimitMax || 0),
          orchestratorMax: Number(config?.orchestratorRateLimitMax || 0),
          publicClinicMax: Number(config?.publicClinicRateLimitMax || 0),
          publicChatMax: Number(config?.publicChatRateLimitMax || 0),
        };
        const allRateLimitsConfigured = Object.values(rateLimitValues).every((value) => value > 0);

        const openIncidentsList = Array.isArray(openIncidents) ? openIncidents : [];
        const unownedOpenIncidents = openIncidentsList.filter(
          (item) => !normalizeText(item?.owner?.userId)
        );
        const breachedOpenIncidents = Number(incidentSummary?.totals?.breachedOpen || 0);
        const incidentsOpenCount = Number(incidentSummary?.totals?.openUnresolved || 0);
        const highCriticalOpenCount = Number(riskSummary?.totals?.highCriticalOpen || 0);
        const incidentsTotal = Number(incidentSummary?.totals?.incidents || 0);

        const latestAutoEscalate = findLatestAuditEvent(auditEvents, {
          action: 'incidents.auto_escalate',
          outcome: 'success',
        });
        const latestAutoAssign = findLatestAuditEvent(auditEvents, {
          action: 'incidents.auto_assign_owner',
          outcome: 'success',
        });
        const latestTenantAccessCheck = findLatestAuditEvent(auditEvents, {
          action: 'tenants.access_check',
          outcome: 'success',
        });
        const tenantIsolationVerified = isRecentWithinDays(
          latestTenantAccessCheck?.ts,
          30,
          nowMs
        );

        const riskVersion = parsePositiveInt(tenantConfig?.riskThresholdVersion) || 0;
        const riskHistoryCount = Array.isArray(tenantConfig?.riskThresholdHistory)
          ? tenantConfig.riskThresholdHistory.length
          : 0;
        const riskChangeEvents = (Array.isArray(auditEvents) ? auditEvents : []).filter((item) =>
          ['risk.settings.update', 'risk.settings.rollback', 'risk.calibration.apply_suggestion'].includes(
            normalizeText(item?.action)
          )
        );
        const nonOwnerGovernedRiskChanges = riskChangeEvents.filter(
          (item) => !normalizeText(item?.actorUserId)
        );

        const riskDatasetCases = Number(riskPrecision?.dataset?.count || 0);
        const bandAccuracyPercent = Number(riskPrecision?.report?.totals?.bandAccuracyPercent || 0);
        const levelAccuracyPercent = Number(riskPrecision?.report?.totals?.levelAccuracyPercent || 0);

        const categoryA = evaluateCategory({
          id: 'A',
          label: 'Säkerhetshärdning',
          weight: 30,
          checks: [
            buildCheck({
              id: 'owner_mfa_enforced',
              label: 'OWNER MFA enforcement',
              status:
                activeOwners.length > 0 && ownersWithoutMfa.length === 0 ? 'green' : 'red',
              required: true,
              target: 'Alla aktiva OWNER har MFA required + configured',
              value: {
                activeOwners: activeOwners.length,
                ownersWithoutMfa: ownersWithoutMfa.length,
              },
            }),
            buildCheck({
              id: 'cors_strict',
              label: 'Strict CORS allowlist',
              status:
                config?.corsStrict &&
                !config?.corsAllowNoOrigin &&
                Array.isArray(config?.corsAllowedOrigins) &&
                config.corsAllowedOrigins.length > 0
                  ? 'green'
                  : config?.corsStrict
                    ? 'yellow'
                    : 'red',
              required: true,
              target: 'strict=true, allowNoOrigin=false, minst en origin',
              value: {
                strict: Boolean(config?.corsStrict),
                allowNoOrigin: Boolean(config?.corsAllowNoOrigin),
                allowedOrigins: Array.isArray(config?.corsAllowedOrigins)
                  ? config.corsAllowedOrigins.length
                  : 0,
              },
            }),
            buildCheck({
              id: 'rate_limits_configured',
              label: 'Rate limits konfigurerade',
              status: allRateLimitsConfigured ? 'green' : 'red',
              required: true,
              target: 'Alla limiter-värden > 0',
              value: rateLimitValues,
            }),
            buildCheck({
              id: 'audit_append_only',
              label: 'Audit append-only läge',
              status: config?.authAuditAppendOnly ? 'green' : 'red',
              required: true,
              target: 'AUTH_AUDIT_APPEND_ONLY=true',
              value: { appendOnly: Boolean(config?.authAuditAppendOnly) },
            }),
            buildCheck({
              id: 'audit_integrity',
              label: 'Audit hash-chain integrity',
              status: auditIntegrity?.ok ? 'green' : 'red',
              required: true,
              target: 'audit/integrity ok=true',
              value: {
                ok: Boolean(auditIntegrity?.ok),
                issues: Number(auditIntegrity?.issues?.length || 0),
                checkedEvents: Number(auditIntegrity?.checkedEvents || 0),
              },
            }),
            buildCheck({
              id: 'secrets_rotation',
              label: 'Secrets rotation freshness',
              status:
                !secretRotationStatus
                  ? 'unknown'
                  : Number(secretRotationStatus?.totals?.staleRequired || 0) > 0
                    ? 'red'
                    : Number(secretRotationStatus?.totals?.pendingRotation || 0) > 0
                      ? 'yellow'
                      : 'green',
              required: true,
              target: 'staleRequired=0',
              value: {
                tracked: Number(secretRotationStatus?.totals?.tracked || 0),
                required: Number(secretRotationStatus?.totals?.required || 0),
                staleRequired: Number(secretRotationStatus?.totals?.staleRequired || 0),
                pendingRotation: Number(secretRotationStatus?.totals?.pendingRotation || 0),
              },
              evidence: !secretRotationStatus ? 'Secret rotation store saknas.' : '',
            }),
          ],
        });

        const categoryB = evaluateCategory({
          id: 'B',
          label: 'Incident & SLA-operativ',
          weight: 25,
          checks: [
            buildCheck({
              id: 'incident_model_available',
              label: 'Incidentmodell tillgänglig',
              status: supportsIncidents ? 'green' : 'red',
              required: true,
              target: 'summarizeIncidents finns',
            }),
            buildCheck({
              id: 'high_critical_incident_link',
              label: 'High/Critical kopplar till incidents',
              status:
                highCriticalOpenCount > 0 && incidentsTotal === 0 ? 'red' : 'green',
              required: true,
              value: {
                highCriticalOpen: highCriticalOpenCount,
                incidentsTotal,
              },
            }),
            buildCheck({
              id: 'open_incidents_owned',
              label: 'Öppna incidents har owner',
              status: unownedOpenIncidents.length === 0 ? 'green' : 'red',
              required: true,
              target: 'unownedOpen=0',
              value: {
                openIncidents: incidentsOpenCount,
                unownedOpen: unownedOpenIncidents.length,
              },
            }),
            buildCheck({
              id: 'sla_breach_control',
              label: 'SLA breach-kontroll',
              status:
                breachedOpenIncidents === 0
                  ? 'green'
                  : breachedOpenIncidents <= 2
                    ? 'yellow'
                    : 'red',
              required: true,
              target: 'breachedOpen nära 0',
              value: { breachedOpen: breachedOpenIncidents },
            }),
            buildCheck({
              id: 'auto_escalation_evidence',
              label: 'Auto-eskalering verifierad',
              status:
                breachedOpenIncidents > 0 && !isRecentWithinDays(latestAutoEscalate?.ts, 30, nowMs)
                  ? 'red'
                  : isRecentWithinDays(latestAutoEscalate?.ts, 30, nowMs)
                    ? 'green'
                    : 'yellow',
              required: false,
              target: 'incidents.auto_escalate senaste 30 dagar',
              value: {
                latestSuccessAt: toIso(latestAutoEscalate?.ts),
              },
            }),
            buildCheck({
              id: 'auto_assignment_evidence',
              label: 'Auto owner-assignment verifierad',
              status:
                unownedOpenIncidents.length > 0 && !isRecentWithinDays(latestAutoAssign?.ts, 30, nowMs)
                  ? 'red'
                  : isRecentWithinDays(latestAutoAssign?.ts, 30, nowMs)
                    ? 'green'
                    : 'yellow',
              required: false,
              target: 'incidents.auto_assign_owner senaste 30 dagar',
              value: {
                latestSuccessAt: toIso(latestAutoAssign?.ts),
              },
            }),
          ],
        });

        const requiredJobsEnabled = REQUIRED_SCHEDULER_JOBS.every(
          (jobId) => schedulerJobMap.get(jobId)?.enabled === true
        );
        const staleSchedulerChecks = schedulerFreshnessChecks.filter((item) => item.status === 'red');
        const warnSchedulerChecks = schedulerFreshnessChecks.filter((item) => item.status === 'yellow');

        const categoryC = evaluateCategory({
          id: 'C',
          label: 'Scheduler & automation',
          weight: 25,
          checks: [
            buildCheck({
              id: 'scheduler_enabled_started',
              label: 'Scheduler enabled + started',
              status: schedulerStatus?.enabled && schedulerStatus?.started ? 'green' : 'red',
              required: true,
              value: {
                enabled: Boolean(schedulerStatus?.enabled),
                started: Boolean(schedulerStatus?.started),
              },
            }),
            buildCheck({
              id: 'scheduler_required_jobs_enabled',
              label: 'Obligatoriska jobb aktiva',
              status: requiredJobsEnabled ? 'green' : 'red',
              required: true,
              target: REQUIRED_SCHEDULER_JOBS.join(', '),
              value: REQUIRED_SCHEDULER_JOBS.map((jobId) => ({
                jobId,
                enabled: Boolean(schedulerJobMap.get(jobId)?.enabled),
              })),
            }),
            buildCheck({
              id: 'scheduler_job_freshness',
              label: 'Job-freshness inom intervall',
              status:
                staleSchedulerChecks.length > 0
                  ? 'red'
                  : warnSchedulerChecks.length > 0
                    ? 'yellow'
                    : 'green',
              required: true,
              target: 'Alla obligatoriska jobb har färsk success-run',
              value: {
                staleJobs: staleSchedulerChecks.map((item) => item.id),
                warnJobs: warnSchedulerChecks.map((item) => item.id),
                checks: schedulerFreshnessChecks,
              },
            }),
            buildCheck({
              id: 'restore_drill_30d',
              label: 'Restore drill verifierad senaste 30 dagar',
              status: restoreDrillGate.healthy30d ? 'green' : 'red',
              required: true,
              target: 'restore_drill_preview success <= 30 dagar',
              value: {
                lastSuccessAt: restoreDrillGate.lastSuccessAt,
                ageDays: restoreDrillGate.ageDays,
                healthy30d: restoreDrillGate.healthy30d,
              },
            }),
          ],
        });

        const categoryD = evaluateCategory({
          id: 'D',
          label: 'Risk precision',
          weight: 20,
          checks: [
            buildCheck({
              id: 'gold_set_coverage',
              label: 'Gold set storlek',
              status:
                riskPrecisionError
                  ? 'red'
                  : riskDatasetCases >= 150
                    ? 'green'
                    : riskDatasetCases >= 120
                      ? 'yellow'
                      : 'red',
              required: true,
              target: '>=150 cases',
              value: {
                cases: riskDatasetCases,
                datasetVersion: normalizeText(riskPrecision?.dataset?.version) || null,
              },
              evidence: riskPrecisionError || '',
            }),
            buildCheck({
              id: 'band_accuracy',
              label: 'Band accuracy',
              status:
                riskPrecisionError
                  ? 'red'
                  : bandAccuracyPercent >= 95
                    ? 'green'
                    : bandAccuracyPercent >= 90
                      ? 'yellow'
                      : 'red',
              required: true,
              target: '>=95%',
              value: {
                bandAccuracyPercent,
              },
            }),
            buildCheck({
              id: 'level_accuracy',
              label: 'Level accuracy',
              status:
                riskPrecisionError
                  ? 'red'
                  : levelAccuracyPercent >= 90
                    ? 'green'
                    : levelAccuracyPercent >= 80
                      ? 'yellow'
                      : 'red',
              required: true,
              target: '>=90%',
              value: {
                levelAccuracyPercent,
              },
            }),
            buildCheck({
              id: 'threshold_versioning',
              label: 'Threshold versionering aktiv',
              status: riskVersion >= 1 && riskHistoryCount >= 1 ? 'green' : 'red',
              required: true,
              target: 'riskThresholdVersion>=1 + history>=1',
              value: {
                riskThresholdVersion: riskVersion,
                historyCount: riskHistoryCount,
              },
            }),
            buildCheck({
              id: 'owner_governed_calibration',
              label: 'Owner-governed calibration',
              status:
                nonOwnerGovernedRiskChanges.length > 0
                  ? 'red'
                  : riskChangeEvents.length > 0
                    ? 'green'
                    : 'yellow',
              required: true,
              target: 'Ingen risk threshold-change utan actorUserId',
              value: {
                changeEvents: riskChangeEvents.length,
                nonOwnerGoverned: nonOwnerGovernedRiskChanges.length,
              },
            }),
            buildCheck({
              id: 'policy_floor_loaded',
              label: 'Policy floor regler laddade',
              status: policyRules.length > 0 ? 'green' : 'red',
              required: true,
              target: '>=1 policy floor regel',
              value: { ruleCount: policyRules.length },
            }),
          ],
        });

        const categories = [categoryA, categoryB, categoryC, categoryD];
        const totalWeight = categories.reduce((sum, item) => sum + Number(item.weight || 0), 0) || 1;
        const weightedScore = categories.reduce(
          (sum, item) => sum + Number(item.score || 0) * Number(item.weight || 0),
          0
        );
        const score = Number((weightedScore / totalWeight).toFixed(2));
        const band = pickReadinessBand(score);
        const blockersAllGreen = categories.every((item) => item.status === 'green');

        const noGoTriggers = [
          {
            id: 'output_without_risk_policy_gate',
            label: 'Output kan lämna systemet utan output risk + policy gate',
            status: 'unknown',
            inferred: true,
            evidence: 'Kräver aktivt bypass-test i release-gate.',
          },
          {
            id: 'policy_floor_bypass',
            label: 'Policy floor kan kringgås',
            status: policyRules.length > 0 ? 'unknown' : 'triggered',
            inferred: true,
            evidence:
              policyRules.length > 0
                ? 'Policy floor-regler finns, men bypass-test krävs för verifiering.'
                : 'Policy floor-regler saknas.',
          },
          {
            id: 'l5_without_manual_intervention',
            label: 'L5 kan gå live utan manuell intervention',
            status: 'unknown',
            inferred: true,
            evidence: 'Kräver explicit L5 activation-gate test.',
          },
          {
            id: 'restore_drill_unverified_30d',
            label: 'Restore-test ej verifierat senaste 30 dagar',
            status: restoreDrillGate.healthy30d ? 'clear' : 'triggered',
            inferred: false,
            evidence: restoreDrillGate.lastSuccessAt
              ? `Senaste restore_drill_preview success: ${restoreDrillGate.lastSuccessAt}`
              : 'Ingen lyckad restore_drill_preview hittad.',
          },
          {
            id: 'audit_chain_not_immutable',
            label: 'Auditkedjan är inte immutable',
            status:
              Boolean(config?.authAuditAppendOnly) && Boolean(auditIntegrity?.ok)
                ? 'clear'
                : 'triggered',
            inferred: false,
            evidence: `appendOnly=${Boolean(config?.authAuditAppendOnly)}, integrityOk=${Boolean(
              auditIntegrity?.ok
            )}`,
          },
          {
            id: 'tenant_isolation_unverified',
            label: 'Tenant-isolation saknar edge-case verifiering',
            status: tenantIsolationVerified ? 'clear' : 'triggered',
            inferred: false,
            evidence: latestTenantAccessCheck?.ts
              ? `Senaste tenants.access_check: ${toIso(latestTenantAccessCheck.ts)}`
              : 'Ingen tenants.access_check verifiering hittad senaste perioden.',
          },
        ];

        const triggeredNoGo = noGoTriggers.filter((item) => item.status === 'triggered');
        const goAllowed =
          band === 'controlled_go' && blockersAllGreen && triggeredNoGo.length === 0;

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'monitor.readiness.read',
          outcome: 'success',
          targetType: 'monitor_readiness',
          targetId: tenantId,
          metadata: {
            score,
            band,
            goAllowed,
            blockersAllGreen,
            triggeredNoGo: triggeredNoGo.length,
          },
        });

        return res.json({
          generatedAt: new Date().toISOString(),
          tenantId,
          phase: 'STABILISERA',
          score,
          band,
          thresholds: {
            noGoBelow: 75,
            limitedBetaMin: 75,
            controlledGoMin: 85,
          },
          goNoGo: {
            allowed: goAllowed,
            blockerCategoriesGreen: blockersAllGreen,
            triggeredNoGoCount: triggeredNoGo.length,
            triggeredNoGoIds: triggeredNoGo.map((item) => item.id),
          },
          categories,
          noGoTriggers,
          evidence: {
            restoreDrill: {
              maxAgeDays: restoreDrillGate.maxAgeDays,
              lastSuccessAt: restoreDrillGate.lastSuccessAt,
              ageDays: restoreDrillGate.ageDays,
              healthy: restoreDrillGate.healthy,
              healthy30d: restoreDrillGate.healthy30d,
            },
            incidents: {
              total: incidentsTotal,
              open: incidentsOpenCount,
              breachedOpen: breachedOpenIncidents,
              unownedOpen: unownedOpenIncidents.length,
              highCriticalOpen: highCriticalOpenCount,
            },
            riskPrecision: {
              datasetPath: RISK_GOLD_SET_DEFAULT_PATH,
              datasetCases: riskDatasetCases,
              bandAccuracyPercent,
              levelAccuracyPercent,
              error: riskPrecisionError || null,
            },
            audit: {
              appendOnly: Boolean(config?.authAuditAppendOnly),
              integrityOk: Boolean(auditIntegrity?.ok),
              issues: Number(auditIntegrity?.issues?.length || 0),
              latestTenantAccessCheckAt: toIso(latestTenantAccessCheck?.ts),
            },
          },
        });
      } catch (error) {
        if (error?.message) {
          return res.status(400).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte beräkna readiness.' });
      }
    }
  );

  return router;
}

module.exports = {
  createMonitorRouter,
};
