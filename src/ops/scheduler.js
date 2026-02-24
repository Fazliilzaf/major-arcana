const fs = require('node:fs/promises');
const path = require('node:path');

const { buildPilotReport } = require('../reports/pilotReport');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const {
  getStateFileMap,
  createStateBackup,
  listBackups,
  pruneBackups,
  inspectBackupRestore,
} = require('./stateBackup');

function nowIso() {
  return new Date().toISOString();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function randomJitterMs(maxSeconds) {
  const seconds = Math.max(0, Number(maxSeconds) || 0);
  if (seconds <= 0) return 0;
  return Math.floor(Math.random() * (seconds * 1000));
}

function formatUtcStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

function sanitizeError(error) {
  if (!error) return 'unknown_error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || error.name || 'error';
  return String(error);
}

function safeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function toHoursMs(value, fallbackHours) {
  const hours = safeInteger(value, fallbackHours);
  if (hours <= 0) return 0;
  return hours * 60 * 60 * 1000;
}

function toMinutesMs(value, fallbackMinutes) {
  const minutes = safeInteger(value, fallbackMinutes);
  if (minutes <= 0) return 0;
  return minutes * 60 * 1000;
}

function createScheduler({
  config,
  authStore,
  templateStore,
  alertNotifier = null,
  logger = console,
} = {}) {
  if (!config) throw new Error('config saknas för scheduler.');
  if (!authStore) throw new Error('authStore saknas för scheduler.');
  if (!templateStore) throw new Error('templateStore saknas för scheduler.');

  const timers = new Map();
  let started = false;
  const state = {
    enabled: Boolean(config.schedulerEnabled),
    startedAt: null,
    jobs: {},
  };

  async function addAudit({
    tenantId,
    actorUserId = null,
    action,
    outcome = 'success',
    targetType = 'scheduler_job',
    targetId = '',
    metadata = {},
  }) {
    try {
      await authStore.addAuditEvent({
        tenantId: tenantId || config.defaultTenantId,
        actorUserId,
        action,
        outcome,
        targetType,
        targetId,
        metadata,
      });
    } catch (error) {
      logger?.error?.('[scheduler] audit_event_failed', sanitizeError(error));
    }
  }

  function summarizeNotificationResult(result) {
    return {
      ok: Boolean(result?.ok),
      skipped: Boolean(result?.skipped),
      reason: result?.reason || null,
      status: Number.isFinite(Number(result?.status)) ? Number(result.status) : null,
      error: result?.error || null,
    };
  }

  async function sendAlertNotification({
    tenantId,
    actorUserId = null,
    eventType,
    severity = 'warn',
    payload = {},
  } = {}) {
    if (!alertNotifier || typeof alertNotifier.send !== 'function') {
      return {
        ok: false,
        skipped: true,
        reason: 'notifier_unavailable',
      };
    }

    const result = await alertNotifier.send({
      eventType,
      tenantId,
      severity,
      payload,
    });
    const summary = summarizeNotificationResult(result);

    await addAudit({
      tenantId,
      actorUserId,
      action: 'alerts.webhook.send',
      outcome: summary.ok ? 'success' : summary.skipped ? 'noop' : 'failure',
      targetType: 'alert',
      targetId: String(eventType || 'unknown'),
      metadata: {
        eventType: String(eventType || 'unknown'),
        severity,
        notification: summary,
      },
    });

    return result;
  }

  async function runNightlyPilotReport({ tenantId }) {
    const report = await buildPilotReport({
      templateStore,
      authStore,
      tenantId,
      days: config.schedulerReportWindowDays,
      evaluationLimit: 1000,
      auditLimit: 1000,
      generatedAt: new Date(),
    });

    const reportsDir = config.reportsDir;
    await fs.mkdir(reportsDir, { recursive: true });

    const fileName = `Pilot_Scheduler_${report.windowDays}d_${formatUtcStamp()}.json`;
    const filePath = path.join(reportsDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');

    return {
      tenantId: report.tenantId,
      fileName,
      filePath,
      windowDays: report.windowDays,
      templatesTotal: Number(report?.kpis?.templatesTotal || 0),
      evaluationsTotal: Number(report?.kpis?.evaluationsTotal || 0),
      highCriticalTotal: Number(report?.kpis?.highCriticalTotal || 0),
      ownerDecisionPending: Number(report?.kpis?.ownerDecisionPending || 0),
    };
  }

  async function runBackupAndPrune({ tenantId }) {
    const stateFileMap = getStateFileMap(config);
    const backup = await createStateBackup({
      stateFileMap,
      backupDir: config.backupDir,
      createdBy: 'scheduler',
    });
    const prune = await pruneBackups({
      backupDir: config.backupDir,
      maxFiles: config.backupRetentionMaxFiles,
      maxAgeDays: config.backupRetentionMaxAgeDays,
      dryRun: false,
    });

    return {
      tenantId,
      backupFileName: backup.fileName,
      backupSizeBytes: backup.sizeBytes,
      stores: backup.stores.length,
      pruneDeletedCount: prune.deletedCount,
      pruneScannedCount: prune.scannedCount,
      pruneKeptCount: prune.keptCount,
    };
  }

  async function runRestoreDrillPreview({ tenantId }) {
    const latest = await listBackups({
      backupDir: config.backupDir,
      limit: 1,
    });

    if (!Array.isArray(latest) || latest.length === 0) {
      return {
        tenantId,
        skipped: true,
        reason: 'no_backups_found',
      };
    }

    const fileName = latest[0].fileName;
    const backupFilePath = latest[0].filePath;
    const preview = await inspectBackupRestore({
      backupFilePath,
      stateFileMap: getStateFileMap(config),
    });

    const stores = Array.isArray(preview.stores) ? preview.stores : [];
    const willRestoreCount = stores.filter((item) => item?.willRestore === true).length;
    const missingCount = stores.filter((item) => item?.existsInBackup === false).length;
    const parseErrorCount = stores.filter((item) => Boolean(item?.parseError)).length;

    return {
      tenantId,
      backupFileName: fileName,
      willRestoreCount,
      missingCount,
      parseErrorCount,
      unknownStores: Array.isArray(preview.unknownStores) ? preview.unknownStores.length : 0,
    };
  }

  async function runAlertProbe({ tenantId, trigger = 'scheduled', actorUserId = null }) {
    const resolveIncidentOwnerUserId = async () => {
      if (typeof authStore?.listTenantMembers !== 'function') return '';
      const members = await authStore.listTenantMembers(tenantId);
      const activeMembers = Array.isArray(members)
        ? members.filter((item) => item?.membership?.status === 'active')
        : [];
      const ownerEntry =
        activeMembers.find((item) => item?.membership?.role === ROLE_OWNER) || null;
      if (ownerEntry?.user?.id) return String(ownerEntry.user.id);
      const staffEntry =
        activeMembers.find((item) => item?.membership?.role === ROLE_STAFF) || null;
      if (staffEntry?.user?.id) return String(staffEntry.user.id);
      return '';
    };

    const fallbackOwnerUserId = await resolveIncidentOwnerUserId();
    const effectiveActorUserId = actorUserId || fallbackOwnerUserId || 'scheduler';

    const autoOwnerAssignmentEnabled = Boolean(config.schedulerIncidentAutoAssignOwnerEnabled);
    const autoOwnerAssignmentLimit = Math.max(
      1,
      Math.min(500, Number(config.schedulerIncidentAutoAssignOwnerLimit) || 100)
    );
    let autoOwnerAssignment = null;
    let autoOwnerAssignmentNotification = {
      ok: false,
      skipped: true,
      reason: 'no_changes',
    };

    if (
      autoOwnerAssignmentEnabled &&
      fallbackOwnerUserId &&
      typeof templateStore?.autoAssignOpenIncidentOwners === 'function'
    ) {
      autoOwnerAssignment = await templateStore.autoAssignOpenIncidentOwners({
        tenantId,
        ownerUserId: fallbackOwnerUserId,
        actorUserId: effectiveActorUserId,
        limit: autoOwnerAssignmentLimit,
      });

      if (Number(autoOwnerAssignment?.assignedCount || 0) > 0) {
        const assignedIncidents = Array.isArray(autoOwnerAssignment?.assigned)
          ? autoOwnerAssignment.assigned
              .slice(0, 25)
              .map((item) => ({
                incidentId: item?.incidentId || null,
                evaluationId: item?.evaluationId || null,
                severity: item?.severity || null,
                assignedOwnerUserId: item?.assignedOwnerUserId || null,
              }))
          : [];

        await addAudit({
          tenantId,
          actorUserId: effectiveActorUserId,
          action: 'incidents.auto_assign_owner',
          outcome: 'success',
          targetType: 'incident_collection',
          targetId: 'open_unowned',
          metadata: {
            trigger,
            sourceJob: 'alert_probe',
            assignedOwnerUserId: fallbackOwnerUserId,
            eligibleOpenUnowned: Number(autoOwnerAssignment?.eligibleOpenUnowned || 0),
            autoAssignedCount: Number(autoOwnerAssignment?.assignedCount || 0),
            truncated: Boolean(autoOwnerAssignment?.truncated),
            incidents: assignedIncidents,
          },
        });

        autoOwnerAssignmentNotification = await sendAlertNotification({
          tenantId,
          actorUserId: effectiveActorUserId,
          eventType: 'incidents.auto_assign_owner',
          severity: 'warn',
          payload: {
            trigger,
            sourceJob: 'alert_probe',
            assignedOwnerUserId: fallbackOwnerUserId,
            eligibleOpenUnowned: Number(autoOwnerAssignment?.eligibleOpenUnowned || 0),
            autoAssignedCount: Number(autoOwnerAssignment?.assignedCount || 0),
            truncated: Boolean(autoOwnerAssignment?.truncated),
            incidents: assignedIncidents,
          },
        });
      }
    }

    const autoEscalationEnabled = Boolean(config.schedulerIncidentAutoEscalationEnabled);
    const autoEscalationLimit = Math.max(
      1,
      Math.min(500, Number(config.schedulerIncidentAutoEscalationLimit) || 25)
    );
    let autoEscalation = null;
    let autoEscalationNotification = {
      ok: false,
      skipped: true,
      reason: 'no_changes',
    };

    if (
      autoEscalationEnabled &&
      typeof templateStore?.autoEscalateBreachedIncidents === 'function'
    ) {
      autoEscalation = await templateStore.autoEscalateBreachedIncidents({
        tenantId,
        actorUserId: effectiveActorUserId,
        limit: autoEscalationLimit,
      });

      if (Number(autoEscalation?.escalatedCount || 0) > 0) {
        const escalatedIncidents = Array.isArray(autoEscalation?.escalated)
          ? autoEscalation.escalated
              .slice(0, 25)
              .map((item) => ({
                incidentId: item?.incidentId || null,
                evaluationId: item?.evaluationId || null,
                severity: item?.severity || null,
                slaDeadline: item?.slaDeadline || null,
              }))
          : [];

        await addAudit({
          tenantId,
          actorUserId: effectiveActorUserId,
          action: 'incidents.auto_escalate',
          outcome: 'success',
          targetType: 'incident_collection',
          targetId: 'breached_open',
          metadata: {
            trigger,
            sourceJob: 'alert_probe',
            eligibleBreachedOpen: Number(autoEscalation?.eligibleBreachedOpen || 0),
            autoEscalatedCount: Number(autoEscalation?.escalatedCount || 0),
            truncated: Boolean(autoEscalation?.truncated),
            incidents: escalatedIncidents,
          },
        });

        autoEscalationNotification = await sendAlertNotification({
          tenantId,
          actorUserId: effectiveActorUserId,
          eventType: 'incidents.auto_escalate',
          severity: 'critical',
          payload: {
            trigger,
            sourceJob: 'alert_probe',
            eligibleBreachedOpen: Number(autoEscalation?.eligibleBreachedOpen || 0),
            autoEscalatedCount: Number(autoEscalation?.escalatedCount || 0),
            truncated: Boolean(autoEscalation?.truncated),
            incidents: escalatedIncidents,
          },
        });
      }
    }

    const riskSummary = await templateStore.summarizeRisk({
      tenantId,
      minRiskLevel: 4,
    });

    const highCriticalOpen = Array.isArray(riskSummary?.highCriticalOpen)
      ? riskSummary.highCriticalOpen
      : [];
    const topReasonCodes = Array.isArray(riskSummary?.topReasonCodes)
      ? riskSummary.topReasonCodes.slice(0, 5)
      : [];
    const incidentSummary =
      typeof templateStore?.summarizeIncidents === 'function'
        ? await templateStore.summarizeIncidents({ tenantId })
        : null;

    return {
      tenantId,
      highCriticalOpenCount: highCriticalOpen.length,
      hasOpenHighCritical: highCriticalOpen.length > 0,
      incidentsOpenCount: Number(incidentSummary?.totals?.openUnresolved || 0),
      incidentsBreachedOpenCount: Number(incidentSummary?.totals?.breachedOpen || 0),
      autoOwnerAssignmentEnabled,
      autoAssignedOwnerCount: Number(autoOwnerAssignment?.assignedCount || 0),
      autoOwnerAssignmentTruncated: Boolean(autoOwnerAssignment?.truncated),
      autoEscalationEnabled,
      autoEscalatedCount: Number(autoEscalation?.escalatedCount || 0),
      autoEscalationTruncated: Boolean(autoEscalation?.truncated),
      notifications: {
        webhookEnabled: Boolean(alertNotifier?.enabled),
        autoAssignOwner: summarizeNotificationResult(autoOwnerAssignmentNotification),
        autoEscalate: summarizeNotificationResult(autoEscalationNotification),
      },
      topReasonCodes,
    };
  }

  const jobDefinitions = [
    {
      id: 'nightly_pilot_report',
      name: 'Nightly pilot report',
      intervalMs: toHoursMs(config.schedulerReportIntervalHours, 24),
      run: runNightlyPilotReport,
    },
    {
      id: 'backup_prune',
      name: 'State backup + prune',
      intervalMs: toHoursMs(config.schedulerBackupIntervalHours, 24),
      run: runBackupAndPrune,
    },
    {
      id: 'restore_drill_preview',
      name: 'Restore drill preview',
      intervalMs: toHoursMs(config.schedulerRestoreDrillIntervalHours, 168),
      run: runRestoreDrillPreview,
    },
    {
      id: 'alert_probe',
      name: 'High/Critical alert probe',
      intervalMs: toMinutesMs(config.schedulerAlertProbeIntervalMinutes, 15),
      run: runAlertProbe,
    },
  ];

  for (const job of jobDefinitions) {
    state.jobs[job.id] = {
      id: job.id,
      name: job.name,
      enabled: state.enabled && job.intervalMs > 0,
      intervalMs: job.intervalMs,
      running: false,
      runCount: 0,
      lastRunAt: null,
      lastSuccessAt: null,
      lastDurationMs: 0,
      lastStatus: 'idle',
      lastError: null,
      lastTrigger: null,
      lastResult: null,
      nextRunAt: null,
    };
  }

  function getStatus() {
    return {
      enabled: state.enabled,
      started: started,
      startedAt: state.startedAt,
      defaultTenantId: config.defaultTenantId,
      jobs: Object.values(state.jobs).map((job) => ({ ...job })),
    };
  }

  function clearJobTimer(jobId) {
    const existing = timers.get(jobId);
    if (existing) {
      clearTimeout(existing);
      timers.delete(jobId);
    }
  }

  function scheduleNext(job) {
    const runtime = state.jobs[job.id];
    if (!runtime?.enabled || !started) return;
    const nextRunAt = new Date(Date.now() + job.intervalMs).toISOString();
    runtime.nextRunAt = nextRunAt;
    clearJobTimer(job.id);
    const timer = setTimeout(async () => {
      await runJob(job.id, { trigger: 'scheduled' });
    }, job.intervalMs);
    timers.set(job.id, timer);
  }

  async function runJob(jobId, { trigger = 'manual', actorUserId = null, tenantId } = {}) {
    const job = jobDefinitions.find((item) => item.id === jobId);
    if (!job) {
      return { ok: false, error: 'unknown_job', message: 'Okänd scheduler-jobb.' };
    }

    const runtime = state.jobs[job.id];
    if (!runtime.enabled) {
      return { ok: false, error: 'disabled_job', message: 'Jobbet är inaktiverat.' };
    }

    if (runtime.running) {
      return { ok: false, error: 'job_running', message: 'Jobbet kör redan.' };
    }

    const resolvedTenantId = tenantId || config.defaultTenantId;
    runtime.running = true;
    runtime.lastRunAt = nowIso();
    runtime.lastTrigger = trigger;
    runtime.lastStatus = 'running';
    runtime.lastError = null;

    const startedAtMs = Date.now();
    try {
      const result = await job.run({
        tenantId: resolvedTenantId,
        trigger,
        actorUserId,
      });
      const durationMs = Date.now() - startedAtMs;
      runtime.running = false;
      runtime.runCount += 1;
      runtime.lastDurationMs = durationMs;
      runtime.lastStatus = 'success';
      runtime.lastSuccessAt = nowIso();
      runtime.lastResult = result || null;
      runtime.nextRunAt = null;

      await addAudit({
        tenantId: resolvedTenantId,
        actorUserId,
        action: `scheduler.job.${job.id}.run`,
        outcome: 'success',
        targetId: job.id,
        metadata: {
          trigger,
          durationMs,
          result,
        },
      });

      scheduleNext(job);

      return {
        ok: true,
        jobId: job.id,
        trigger,
        durationMs,
        result,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAtMs;
      const message = sanitizeError(error);
      runtime.running = false;
      runtime.runCount += 1;
      runtime.lastDurationMs = durationMs;
      runtime.lastStatus = 'error';
      runtime.lastError = message;
      runtime.lastResult = null;
      runtime.nextRunAt = null;

      await addAudit({
        tenantId: resolvedTenantId,
        actorUserId,
        action: `scheduler.job.${job.id}.run`,
        outcome: 'failure',
        targetId: job.id,
        metadata: {
          trigger,
          durationMs,
          error: message,
        },
      });

      scheduleNext(job);

      return {
        ok: false,
        jobId: job.id,
        trigger,
        durationMs,
        error: message,
      };
    }
  }

  async function start() {
    if (started || !state.enabled) return getStatus();
    started = true;
    state.startedAt = nowIso();

    const startupDelayMs = Math.max(0, safeInteger(config.schedulerStartupDelaySec, 8) * 1000);
    const jitterSeconds = Math.max(0, safeInteger(config.schedulerJitterSec, 4));
    const runOnStartup = Boolean(config.schedulerRunOnStartup);

    for (const [index, job] of jobDefinitions.entries()) {
      const runtime = state.jobs[job.id];
      if (!runtime.enabled) continue;
      const staggerMs = index * 600;
      const jitterMs = randomJitterMs(jitterSeconds);
      const initialDelayMs = runOnStartup
        ? startupDelayMs + staggerMs + jitterMs
        : startupDelayMs + job.intervalMs + staggerMs + jitterMs;
      runtime.nextRunAt = new Date(Date.now() + initialDelayMs).toISOString();
      clearJobTimer(job.id);
      const timer = setTimeout(async () => {
        await runJob(job.id, { trigger: 'scheduled_startup' });
      }, initialDelayMs);
      timers.set(job.id, timer);
      await wait(5);
    }

    logger?.log?.(
      `[scheduler] started (jobs=${jobDefinitions.filter((job) => state.jobs[job.id].enabled).length})`
    );
    return getStatus();
  }

  async function stop() {
    started = false;
    for (const jobId of timers.keys()) {
      clearJobTimer(jobId);
    }
    for (const runtime of Object.values(state.jobs)) {
      runtime.nextRunAt = null;
      if (!runtime.running && runtime.lastStatus === 'running') {
        runtime.lastStatus = 'idle';
      }
    }
    return getStatus();
  }

  return {
    start,
    stop,
    runJob,
    getStatus,
    listJobs: () => jobDefinitions.map((job) => ({ ...job })),
  };
}

module.exports = {
  createScheduler,
};
