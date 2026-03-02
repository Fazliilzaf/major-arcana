const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { buildPilotReport } = require('../reports/pilotReport');
const { composeWeeklyBrief } = require('../intelligence/weeklyBriefComposer');
const { analyzeMonthlyRisk } = require('../intelligence/monthlyRiskAnalyzer');
const { simulateScenarios } = require('../intelligence/scenarioEngine');
const { analyzeBusinessThreats } = require('../intelligence/businessThreatAnalyzer');
const { computeForwardOutlook } = require('../intelligence/forwardOutlookEngine');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { pruneSchedulerPilotReports } = require('./pilotReports');
const {
  getStateFileMap,
  createStateBackup,
  listBackups,
  pruneBackups,
  inspectBackupRestore,
  restoreFromBackup,
} = require('./stateBackup');

function nowIso() {
  return new Date().toISOString();
}

const MAX_TIMEOUT_MS = 2_147_483_647;

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

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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

function toAgeHours(isoTs, nowMs = Date.now()) {
  const ts = Date.parse(String(isoTs || ''));
  if (!Number.isFinite(ts)) return null;
  if (ts > nowMs) return 0;
  return Number(((nowMs - ts) / (60 * 60 * 1000)).toFixed(2));
}

function toAgeDays(isoTs, nowMs = Date.now()) {
  const ts = Date.parse(String(isoTs || ''));
  if (!Number.isFinite(ts)) return null;
  if (ts > nowMs) return 0;
  return Number(((nowMs - ts) / (24 * 60 * 60 * 1000)).toFixed(2));
}

function toUtcDateKey(value = null) {
  const ts = value ? Date.parse(String(value)) : Date.now();
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toISOString().slice(0, 10);
}

function clamp(value, min, max, fallback = min) {
  const parsed = Number(value);
  const numeric = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, numeric));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, precision = 2) {
  const factor = 10 ** Math.max(0, toNumber(precision, 2));
  return Math.round(toNumber(value, 0) * factor) / factor;
}

function buildStrategicDailySignals(entries = [], nowIsoValue = null, windowDays = 60) {
  const resolvedNowIso = normalizeText(nowIsoValue) || nowIso();
  const nowMs = Date.parse(String(resolvedNowIso || '')) || Date.now();
  const fromMs = nowMs - Math.max(7, Math.min(180, Number(windowDays) || 60)) * 24 * 60 * 60 * 1000;
  const byDay = new Map();
  const sorted = asArray(entries)
    .slice()
    .sort((left, right) => String(left?.ts || '').localeCompare(String(right?.ts || '')));

  for (const entry of sorted) {
    const ts = String(entry?.ts || '');
    const tsMs = Date.parse(ts);
    if (!Number.isFinite(tsMs) || tsMs < fromMs) continue;
    const data = safeObject(entry?.output?.data);
    const worklist = asArray(data.conversationWorklist);
    const unresolved = worklist.filter(
      (row) => normalizeText(row?.needsReplyStatus).toLowerCase() !== 'handled'
    );
    const complaintCount = unresolved.filter(
      (row) => normalizeText(row?.intent).toLowerCase() === 'complaint'
    ).length;
    const bookingCount = unresolved.filter(
      (row) => normalizeText(row?.intent).toLowerCase() === 'booking_request'
    ).length;
    const slaBreachCount = unresolved.filter(
      (row) => normalizeText(row?.slaStatus).toLowerCase() === 'breach'
    ).length;
    const unresolvedCount = Math.max(1, unresolved.length);
    const usageAnalytics = safeObject(data.usageAnalytics);
    const key = toUtcDateKey(ts);
    if (!key) continue;
    byDay.set(key, {
      ts: new Date(tsMs).toISOString(),
      complaintCount,
      bookingCount,
      unresolvedCount,
      complaintRate: round(complaintCount / unresolvedCount, 4),
      bookingPressure: round(bookingCount / unresolvedCount, 4),
      slaBreachRate: round(slaBreachCount / unresolvedCount, 4),
      healthScore: clamp(usageAnalytics.healthScore, 0, 100, 100),
      volatilityIndex: clamp(usageAnalytics.volatilityIndex, 0, 1, 0),
    });
  }

  return Array.from(byDay.values()).sort((left, right) => String(left.ts).localeCompare(String(right.ts)));
}

function buildStrategicBaseline({ latestData = {}, conversationWorklist = [] } = {}) {
  const usage = safeObject(latestData.usageAnalytics);
  const unresolved = asArray(conversationWorklist).filter(
    (row) => normalizeText(row?.needsReplyStatus).toLowerCase() !== 'handled'
  );
  const breachCount = unresolved.filter(
    (row) => normalizeText(row?.slaStatus).toLowerCase() === 'breach'
  ).length;
  const complaintCount = unresolved.filter(
    (row) => normalizeText(row?.intent).toLowerCase() === 'complaint'
  ).length;
  const bookingCount = unresolved.filter(
    (row) => normalizeText(row?.intent).toLowerCase() === 'booking_request'
  ).length;
  const unresolvedCount = Math.max(1, unresolved.length);

  return {
    healthScore: clamp(usage.healthScore, 0, 100, 100),
    slaBreachRate: clamp(
      usage.slaBreachRate !== undefined ? usage.slaBreachRate : breachCount / unresolvedCount,
      0,
      1,
      0
    ),
    complaintRate: clamp(
      usage.complaintRate !== undefined ? usage.complaintRate : complaintCount / unresolvedCount,
      0,
      1,
      0
    ),
    conversionSignal: clamp(usage.conversionSignal, 0, 1, 0.5),
    workloadMinutes: Math.max(
      0,
      Math.round(
        unresolved
          .slice(0, 3)
          .reduce((sum, row) => sum + Math.max(0, toNumber(row?.estimatedWorkMinutes, 0)), 0)
      )
    ),
    volatilityIndex: clamp(usage.volatilityIndex, 0, 1, 0),
    bookingPressure: round(bookingCount / unresolvedCount, 4),
  };
}

function createScheduler({
  config,
  authStore,
  templateStore,
  capabilityAnalysisStore = null,
  runtimeMetricsStore = null,
  secretRotationStore = null,
  sloTicketStore = null,
  releaseGovernanceStore = null,
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
    const fileStat = await fs.stat(filePath);

    const prune = await pruneSchedulerPilotReports({
      reportsDir,
      maxFiles: config.reportRetentionMaxFiles,
      maxAgeDays: config.reportRetentionMaxAgeDays,
      dryRun: false,
    });

    return {
      tenantId: report.tenantId,
      fileName,
      filePath,
      fileSizeBytes: fileStat.size,
      windowDays: report.windowDays,
      templatesTotal: Number(report?.kpis?.templatesTotal || 0),
      evaluationsTotal: Number(report?.kpis?.evaluationsTotal || 0),
      highCriticalTotal: Number(report?.kpis?.highCriticalTotal || 0),
      ownerDecisionPending: Number(report?.kpis?.ownerDecisionPending || 0),
      pruneDeletedCount: Number(prune?.deletedCount || 0),
      pruneKeptCount: Number(prune?.keptCount || 0),
      pruneScannedCount: Number(prune?.scannedCount || 0),
      retentionMaxFiles: Number(prune?.settings?.maxFiles || 0),
      retentionMaxAgeDays: Number(prune?.settings?.maxAgeDays || 0),
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

  async function runRestoreDrillFull({ tenantId, trigger = 'scheduled', actorUserId = null }) {
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

    const backupFile = latest[0];
    const backupFileName = backupFile?.fileName || null;
    const backupFilePath = backupFile?.filePath || '';
    if (!normalizeText(backupFilePath)) {
      return {
        tenantId,
        skipped: true,
        reason: 'backup_file_path_missing',
      };
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-restore-drill-full-'));
    try {
      const sourceMap = getStateFileMap(config);
      const tempStateFileMap = {};
      for (const [storeName] of Object.entries(sourceMap || {})) {
        tempStateFileMap[storeName] = path.join(tempDir, `${storeName}.json`);
      }

      const restore = await restoreFromBackup({
        backupFilePath,
        stateFileMap: tempStateFileMap,
      });

      let restoredCount = 0;
      let missingCount = 0;
      let parseErrorCount = 0;
      const stores = [];

      for (const item of Array.isArray(restore?.stores) ? restore.stores : []) {
        const restored = item?.restored === true;
        if (!restored) {
          missingCount += 1;
          stores.push({
            name: normalizeText(item?.name) || null,
            restored: false,
            reason: normalizeText(item?.reason) || 'missing_in_backup',
            validated: false,
          });
          continue;
        }

        restoredCount += 1;
        let parseOk = false;
        try {
          const restoredRaw = await fs.readFile(item.filePath, 'utf8');
          JSON.parse(restoredRaw);
          parseOk = true;
        } catch (error) {
          parseErrorCount += 1;
          parseOk = false;
          stores.push({
            name: normalizeText(item?.name) || null,
            restored: true,
            reason: 'restore_parse_error',
            validated: false,
            error: sanitizeError(error),
          });
        }

        if (parseOk) {
          stores.push({
            name: normalizeText(item?.name) || null,
            restored: true,
            reason: null,
            validated: true,
          });
        }
      }

      const hasFailures = parseErrorCount > 0;
      if (hasFailures) {
        await addAudit({
          tenantId,
          actorUserId: actorUserId || 'scheduler',
          action: 'backup.restore_drill_full.failure',
          outcome: 'failure',
          targetType: 'backup',
          targetId: backupFileName || 'unknown',
          metadata: {
            trigger,
            backupFileName,
            restoredCount,
            missingCount,
            parseErrorCount,
          },
        });

        await sendAlertNotification({
          tenantId,
          actorUserId: actorUserId || 'scheduler',
          eventType: 'backup.restore_drill_full.failure',
          severity: 'critical',
          payload: {
            trigger,
            backupFileName,
            restoredCount,
            missingCount,
            parseErrorCount,
          },
        });
      }

      return {
        tenantId,
        backupFileName,
        restoredCount,
        missingCount,
        parseErrorCount,
        ok: !hasFailures,
        stores: stores.slice(0, 25),
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  async function runAuditIntegrityCheck({ tenantId, trigger = 'scheduled', actorUserId = null }) {
    if (typeof authStore?.verifyAuditIntegrity !== 'function') {
      return {
        tenantId,
        skipped: true,
        reason: 'auth_store_verify_integrity_unavailable',
      };
    }

    const integrity = await authStore.verifyAuditIntegrity({ maxIssues: 100 });
    const issues = Array.isArray(integrity?.issues) ? integrity.issues : [];
    const ok = integrity?.ok === true;
    const result = {
      tenantId,
      ok,
      checkedEvents: Number(integrity?.checkedEvents || 0),
      issues: issues.length,
      issuesPreview: issues.slice(0, 10),
    };

    if (!ok) {
      await addAudit({
        tenantId,
        actorUserId: actorUserId || 'scheduler',
        action: 'audit.integrity.failure',
        outcome: 'failure',
        targetType: 'audit',
        targetId: 'integrity',
        metadata: {
          trigger,
          checkedEvents: result.checkedEvents,
          issues: result.issues,
        },
      });

      await sendAlertNotification({
        tenantId,
        actorUserId: actorUserId || 'scheduler',
        eventType: 'audit.integrity.failure',
        severity: 'critical',
        payload: {
          trigger,
          checkedEvents: result.checkedEvents,
          issues: result.issues,
          issuesPreview: result.issuesPreview,
        },
      });
    }

    return result;
  }

  async function runSecretRotationSnapshot({ tenantId, trigger = 'scheduled', actorUserId = null }) {
    if (!secretRotationStore || typeof secretRotationStore.captureSnapshot !== 'function') {
      return {
        tenantId,
        skipped: true,
        reason: 'secret_rotation_store_unavailable',
      };
    }

    const dryRun = Boolean(config.schedulerSecretRotationDryRun);
    const source = dryRun ? 'scheduler_secret_rotation_preview' : 'scheduler_secret_rotation_commit';
    const snapshot = await secretRotationStore.captureSnapshot({
      actorUserId: actorUserId || 'scheduler',
      source,
      note:
        normalizeText(config.schedulerSecretRotationNote) ||
        'Scheduled secret rotation snapshot',
      dryRun,
      force: false,
    });
    const staleRequired = Number(snapshot?.totals?.staleRequired || 0);
    const pendingRotation = Number(snapshot?.totals?.pendingRotation || 0);
    const tracked = Number(snapshot?.totals?.tracked || 0);
    const required = Number(snapshot?.totals?.required || 0);
    const changedCount = Number(snapshot?.totals?.changedCount || 0);

    let notification = {
      ok: false,
      skipped: true,
      reason: 'no_alert_required',
    };

    if (staleRequired > 0 || pendingRotation > 0) {
      notification = summarizeNotificationResult(
        await sendAlertNotification({
          tenantId,
          actorUserId: actorUserId || 'scheduler',
          eventType: staleRequired > 0 ? 'secrets.rotation.stale_required' : 'secrets.rotation.pending',
          severity: staleRequired > 0 ? 'critical' : 'warn',
          payload: {
            trigger,
            dryRun,
            tracked,
            required,
            staleRequired,
            pendingRotation,
            changedCount,
          },
        })
      );
    }

    return {
      tenantId,
      dryRun,
      tracked,
      required,
      staleRequired,
      pendingRotation,
      changedCount,
      notification,
    };
  }

  async function runReleaseGovernanceReview({
    tenantId,
    trigger = 'scheduled',
    actorUserId = null,
  }) {
    if (
      !releaseGovernanceStore ||
      typeof releaseGovernanceStore.evaluateCycle !== 'function'
    ) {
      return {
        tenantId,
        skipped: true,
        reason: 'release_governance_store_unavailable',
      };
    }

    const evaluateReleaseCycle = () =>
      releaseGovernanceStore.evaluateCycle({
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
      });

    let payload = await evaluateReleaseCycle();

    if (!payload?.cycle) {
      return {
        tenantId,
        skipped: true,
        reason: 'no_release_cycle',
      };
    }

    let evaluation = payload?.evaluation && typeof payload.evaluation === 'object'
      ? payload.evaluation
      : null;
    let status = normalizeText(payload?.cycle?.status || '').toLowerCase();
    const autoReviewEnabled = Boolean(config?.schedulerReleaseGovernanceAutoReviewEnabled);
    let autoReview = {
      enabled: autoReviewEnabled,
      created: false,
      skipped: true,
      reason: status === 'launched' ? 'not_needed' : 'cycle_not_launched',
      reviewId: null,
      status: null,
      openIncidents: 0,
      breachedIncidents: 0,
      highCriticalOpenCount: 0,
      triggeredNoGoCount: 0,
    };

    if (status === 'launched' && autoReviewEnabled) {
      if (typeof releaseGovernanceStore.addPostLaunchReview !== 'function') {
        autoReview.reason = 'auto_review_api_unavailable';
      } else {
        const todayKey = toUtcDateKey();
        const reviews = Array.isArray(payload?.cycle?.postLaunchReviews)
          ? payload.cycle.postLaunchReviews
          : [];
        const alreadyReviewedToday = reviews.some((item) => toUtcDateKey(item?.ts) === todayKey);

        if (alreadyReviewedToday) {
          autoReview.reason = 'already_reviewed_today';
        } else {
          const incidentsSummary =
            typeof templateStore?.summarizeIncidents === 'function'
              ? await templateStore.summarizeIncidents({ tenantId })
              : null;
          const riskSummary =
            typeof templateStore?.summarizeRisk === 'function'
              ? await templateStore.summarizeRisk({ tenantId })
              : null;

          const openIncidents = Math.max(
            0,
            Number(incidentsSummary?.totals?.openUnresolved || 0)
          );
          const breachedIncidents = Math.max(
            0,
            Number(incidentsSummary?.totals?.breachedOpen || 0)
          );
          const highCriticalOpenCount = Array.isArray(riskSummary?.highCriticalOpen)
            ? riskSummary.highCriticalOpen.length
            : Math.max(0, Number(riskSummary?.highCriticalOpenCount || 0));
          const triggeredNoGoCount = highCriticalOpenCount > 0 ? 1 : 0;

          let reviewStatus = 'ok';
          if (breachedIncidents > 0 || highCriticalOpenCount > 0) reviewStatus = 'incident';
          else if (openIncidents > 0) reviewStatus = 'risk';

          const noteParts = [`Auto post-launch review via scheduler (${trigger})`];
          if (highCriticalOpenCount > 0) {
            noteParts.push(`highCriticalOpen=${highCriticalOpenCount}`);
          }

          const reviewResult = await releaseGovernanceStore.addPostLaunchReview({
            tenantId,
            cycleId: payload?.cycle?.id || null,
            reviewerUserId: actorUserId || 'scheduler',
            status: reviewStatus,
            note: noteParts.join(' | '),
            openIncidents,
            breachedIncidents,
            triggeredNoGoCount,
          });

          autoReview = {
            enabled: true,
            created: true,
            skipped: false,
            reason: null,
            reviewId: reviewResult?.review?.id || null,
            status: reviewResult?.review?.status || reviewStatus,
            openIncidents,
            breachedIncidents,
            highCriticalOpenCount,
            triggeredNoGoCount,
          };

          await addAudit({
            tenantId,
            actorUserId: actorUserId || 'scheduler',
            action: 'release.governance.post_launch_review.auto',
            outcome: 'success',
            targetType: 'release_cycle',
            targetId: payload?.cycle?.id || 'latest',
            metadata: {
              trigger,
              cycleId: payload?.cycle?.id || null,
              reviewId: autoReview.reviewId,
              status: autoReview.status,
              openIncidents,
              breachedIncidents,
              highCriticalOpenCount,
              triggeredNoGoCount,
            },
          });

          if (reviewStatus !== 'ok') {
            await sendAlertNotification({
              tenantId,
              actorUserId: actorUserId || 'scheduler',
              eventType: 'release.governance.post_launch_review_auto',
              severity: reviewStatus === 'incident' ? 'critical' : 'warn',
              payload: {
                trigger,
                cycleId: payload?.cycle?.id || null,
                reviewId: autoReview.reviewId,
                status: autoReview.status,
                openIncidents,
                breachedIncidents,
                highCriticalOpenCount,
                triggeredNoGoCount,
              },
            });
          }

          payload = await evaluateReleaseCycle();
          evaluation = payload?.evaluation && typeof payload.evaluation === 'object'
            ? payload.evaluation
            : null;
          status = normalizeText(payload?.cycle?.status || '').toLowerCase();
        }
      }
    } else if (status === 'launched' && !autoReviewEnabled) {
      autoReview.reason = 'auto_review_disabled';
    }

    const blockerCount = Number(evaluation?.blockers?.length || 0);
    let notification = {
      ok: false,
      skipped: true,
      reason: 'no_alert_required',
    };

    if (status !== 'launched' && blockerCount > 0) {
      notification = summarizeNotificationResult(
        await sendAlertNotification({
          tenantId,
          actorUserId: actorUserId || 'scheduler',
          eventType: 'release.governance.blocked',
          severity: blockerCount >= 2 ? 'critical' : 'warn',
          payload: {
            trigger,
            cycleId: payload?.cycle?.id || null,
            status,
            releaseGatePassed: evaluation?.releaseGatePassed === true,
            blockerCount,
            blockers: Array.isArray(evaluation?.blockers)
              ? evaluation.blockers.slice(0, 12)
              : [],
          },
        })
      );
    } else if (status === 'launched' && evaluation?.postLaunchReview?.healthy !== true) {
      notification = summarizeNotificationResult(
        await sendAlertNotification({
          tenantId,
          actorUserId: actorUserId || 'scheduler',
          eventType: 'release.governance.post_launch_review_missing',
          severity: 'warn',
          payload: {
            trigger,
            cycleId: payload?.cycle?.id || null,
            expectedReviews: Number(evaluation?.postLaunchReview?.expectedReviews || 0),
            actualReviews: Number(evaluation?.postLaunchReview?.actualReviews || 0),
            coveragePercent: Number(evaluation?.postLaunchReview?.coveragePercent || 0),
          },
        })
      );
    } else if (evaluation?.realityAudit?.healthy === false) {
      notification = summarizeNotificationResult(
        await sendAlertNotification({
          tenantId,
          actorUserId: actorUserId || 'scheduler',
          eventType: 'release.governance.reality_audit_overdue',
          severity: 'warn',
          payload: {
            trigger,
            cycleId: payload?.cycle?.id || null,
            dueAt: evaluation?.realityAudit?.dueAt || null,
            lastRealityAuditAt: evaluation?.realityAudit?.lastRealityAuditAt || null,
          },
        })
      );
    } else if (
      status === 'launched' &&
      evaluation?.postLaunchStabilization?.enforced === true &&
      evaluation?.postLaunchStabilization?.healthy === false
    ) {
      notification = summarizeNotificationResult(
        await sendAlertNotification({
          tenantId,
          actorUserId: actorUserId || 'scheduler',
          eventType: 'release.governance.post_launch_stabilization_incomplete',
          severity: 'warn',
          payload: {
            trigger,
            cycleId: payload?.cycle?.id || null,
            requiredDays: Number(evaluation?.postLaunchStabilization?.requiredDays || 0),
            daysSinceLaunch: Number(evaluation?.postLaunchStabilization?.daysSinceLaunch || 0),
            actualReviews: Number(evaluation?.postLaunchStabilization?.actualReviews || 0),
            hasNoGoTrigger: evaluation?.postLaunchStabilization?.hasNoGoTrigger === true,
          },
        })
      );
    } else if (
      status === 'launched' &&
      evaluation?.releaseGatePassed === true &&
      evaluation?.postLaunchStabilization?.completed === true &&
      evaluation?.postLaunchStabilization?.hasNoGoTrigger !== true &&
      Number(evaluation?.postLaunchStabilization?.actualReviews || 0) >=
        Number(evaluation?.postLaunchStabilization?.requiredDays || 0) &&
      evaluation?.finalLiveSignoff?.locked !== true
    ) {
      notification = summarizeNotificationResult(
        await sendAlertNotification({
          tenantId,
          actorUserId: actorUserId || 'scheduler',
          eventType: 'release.governance.final_live_signoff_required',
          severity: 'warn',
          payload: {
            trigger,
            cycleId: payload?.cycle?.id || null,
            requiredDays: Number(evaluation?.postLaunchStabilization?.requiredDays || 0),
            actualReviews: Number(evaluation?.postLaunchStabilization?.actualReviews || 0),
            locked: evaluation?.finalLiveSignoff?.locked === true,
          },
        })
      );
    }

    return {
      tenantId,
      cycleId: payload?.cycle?.id || null,
      status: payload?.cycle?.status || null,
      releaseGatePassed: evaluation?.releaseGatePassed === true,
      blockerCount,
      blockers: Array.isArray(evaluation?.blockers) ? evaluation.blockers.slice(0, 12) : [],
      postLaunchReview: evaluation?.postLaunchReview || null,
      postLaunchStabilization: evaluation?.postLaunchStabilization || null,
      realityAudit: evaluation?.realityAudit || null,
      autoReview,
      notification,
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
    const incidentsOpenCount = Number(incidentSummary?.totals?.openUnresolved || 0);
    const incidentsBreachedOpenCount = Number(incidentSummary?.totals?.breachedOpen || 0);

    const sloAutoTicketingEnabled =
      Boolean(config.schedulerSloAutoTicketingEnabled) &&
      Boolean(sloTicketStore && typeof sloTicketStore.upsertBreach === 'function');
    const sloTicketMaxPerRun = Math.max(
      1,
      Math.min(25, Number(config.schedulerSloTicketMaxPerRun) || 8)
    );
    const runtimeMetrics =
      runtimeMetricsStore && typeof runtimeMetricsStore.getSnapshot === 'function'
        ? runtimeMetricsStore.getSnapshot({ areaLimit: 8 })
        : null;
    const sampledRequests = Number(runtimeMetrics?.totals?.sampledRequests || 0);
    const serverErrors = Number(runtimeMetrics?.totals?.statusBuckets?.['5xx'] || 0);
    const p95Ms = Number(runtimeMetrics?.latency?.p95Ms || 0);
    const slowRequests = Number(runtimeMetrics?.totals?.slowRequests || 0);
    const errorRatePct =
      sampledRequests > 0
        ? Number(((serverErrors / Math.max(1, sampledRequests)) * 100).toFixed(3))
        : 0;
    const maxErrorRatePct = Number(config?.observabilityAlertMaxErrorRatePct || 2.5);
    const maxP95Ms = Number(config?.observabilityAlertMaxP95Ms || config?.metricsSlowRequestMs || 1800);
    const maxSlowRequests = Math.max(1, Number(config?.observabilityAlertMaxSlowRequests || 25));
    const restoreMaxAgeDays = Math.max(1, Number(config?.monitorRestoreDrillMaxAgeDays || 30));
    const pilotMaxAgeHours = Math.max(1, Number(config?.monitorPilotReportMaxAgeHours || 36));
    const restoreLastSuccessAt = normalizeText(state?.jobs?.restore_drill_preview?.lastSuccessAt);
    const restoreFullLastSuccessAt = normalizeText(state?.jobs?.restore_drill_full?.lastSuccessAt);
    const pilotLastSuccessAt = normalizeText(state?.jobs?.nightly_pilot_report?.lastSuccessAt);
    const restoreAgeDays = toAgeDays(restoreLastSuccessAt);
    const restoreFullAgeDays = toAgeDays(restoreFullLastSuccessAt);
    const pilotAgeHours = toAgeHours(pilotLastSuccessAt);

    const sloBreachCandidates = [];
    if (incidentsOpenCount > 0 && incidentsBreachedOpenCount > 0) {
      const breachRatePct = Number(
        ((incidentsBreachedOpenCount / Math.max(1, incidentsOpenCount)) * 100).toFixed(3)
      );
      sloBreachCandidates.push({
        signature: 'incident_response_breach',
        severity: incidentsBreachedOpenCount >= 2 ? 'critical' : 'high',
        summary: 'SLO breach: open incidents med SLA-breach',
        details: `${incidentsBreachedOpenCount}/${incidentsOpenCount} öppna incidents är breachade (${breachRatePct}%).`,
        metadata: {
          trigger,
          incidentsOpenCount,
          incidentsBreachedOpenCount,
          breachRatePct,
        },
      });
    }
    if (sampledRequests > 0 && errorRatePct > maxErrorRatePct) {
      sloBreachCandidates.push({
        signature: 'availability_http_breach',
        severity: errorRatePct > maxErrorRatePct * 1.5 ? 'critical' : 'high',
        summary: 'SLO breach: HTTP availability',
        details: `5xx rate ${errorRatePct}% över tröskel ${maxErrorRatePct}%.`,
        metadata: {
          trigger,
          sampledRequests,
          serverErrors,
          errorRatePct,
          thresholdPct: maxErrorRatePct,
        },
      });
    }
    if (sampledRequests > 0 && p95Ms > maxP95Ms) {
      sloBreachCandidates.push({
        signature: 'latency_p95_breach',
        severity: p95Ms > maxP95Ms * 1.5 ? 'critical' : 'high',
        summary: 'SLO breach: latency p95',
        details: `p95 ${p95Ms}ms över tröskel ${maxP95Ms}ms.`,
        metadata: {
          trigger,
          sampledRequests,
          p95Ms,
          thresholdMs: maxP95Ms,
        },
      });
    }
    if (sampledRequests > 0 && slowRequests > maxSlowRequests) {
      sloBreachCandidates.push({
        signature: 'slow_requests_breach',
        severity: slowRequests > maxSlowRequests * 2 ? 'critical' : 'high',
        summary: 'SLO breach: slow requests',
        details: `${slowRequests} slow requests över tröskel ${maxSlowRequests}.`,
        metadata: {
          trigger,
          sampledRequests,
          slowRequests,
          threshold: maxSlowRequests,
          slowRequestMs: Number(config?.metricsSlowRequestMs || 1500),
        },
      });
    }
    if (restoreAgeDays === null || restoreAgeDays > restoreMaxAgeDays) {
      sloBreachCandidates.push({
        signature: 'restore_drill_recency_breach',
        severity: 'critical',
        summary: 'SLO breach: restore drill recency',
        details:
          restoreAgeDays === null
            ? 'Saknar restore drill success-evidens.'
            : `Restore drill är ${restoreAgeDays} dagar gammal (mål <= ${restoreMaxAgeDays} dagar).`,
        metadata: {
          trigger,
          restoreAgeDays,
          thresholdDays: restoreMaxAgeDays,
          lastSuccessAt: restoreLastSuccessAt || null,
        },
      });
    }
    if (restoreFullAgeDays === null || restoreFullAgeDays > restoreMaxAgeDays) {
      sloBreachCandidates.push({
        signature: 'restore_drill_full_recency_breach',
        severity: 'critical',
        summary: 'SLO breach: full restore drill recency',
        details:
          restoreFullAgeDays === null
            ? 'Saknar full restore drill success-evidens.'
            : `Full restore drill är ${restoreFullAgeDays} dagar gammal (mål <= ${restoreMaxAgeDays} dagar).`,
        metadata: {
          trigger,
          restoreFullAgeDays,
          thresholdDays: restoreMaxAgeDays,
          lastSuccessAt: restoreFullLastSuccessAt || null,
        },
      });
    }
    if (pilotAgeHours === null || pilotAgeHours > pilotMaxAgeHours) {
      sloBreachCandidates.push({
        signature: 'pilot_report_recency_breach',
        severity: pilotAgeHours === null ? 'high' : 'critical',
        summary: 'SLO breach: nightly pilot report recency',
        details:
          pilotAgeHours === null
            ? 'Saknar nightly pilot report success-evidens.'
            : `Nightly pilot report är ${pilotAgeHours}h gammal (mål <= ${pilotMaxAgeHours}h).`,
        metadata: {
          trigger,
          pilotAgeHours,
          thresholdHours: pilotMaxAgeHours,
          lastSuccessAt: pilotLastSuccessAt || null,
        },
      });
    }

    const sloTicketResult = {
      enabled: sloAutoTicketingEnabled,
      maxPerRun: sloTicketMaxPerRun,
      breachesDetected: sloBreachCandidates.length,
      processed: 0,
      created: 0,
      updated: 0,
      autoResolved: 0,
      autoResolvedIds: [],
      details: [],
      summary: null,
    };

    if (sloAutoTicketingEnabled) {
      const activeSignatures = new Set(
        sloBreachCandidates
          .map((item) => normalizeText(item?.signature).toLowerCase())
          .filter(Boolean)
      );
      if (
        typeof sloTicketStore.listTickets === 'function' &&
        typeof sloTicketStore.resolveTicket === 'function'
      ) {
        const openTickets = await sloTicketStore.listTickets({
          tenantId,
          status: 'open',
          limit: 500,
        });
        const candidatesToResolve = Array.isArray(openTickets?.tickets)
          ? openTickets.tickets.filter((ticket) => {
              const signature = normalizeText(ticket?.signature).toLowerCase();
              const source = normalizeText(ticket?.source);
              if (!signature) return false;
              if (activeSignatures.has(signature)) return false;
              return source === 'scheduler.alert_probe';
            })
          : [];

        for (const ticket of candidatesToResolve) {
          const resolved = await sloTicketStore.resolveTicket({
            tenantId,
            ticketId: ticket.id,
            resolvedBy: effectiveActorUserId,
            note: `auto_resolved:${trigger}`,
          });
          if (!resolved) continue;
          sloTicketResult.autoResolved += 1;
          if (resolved.id) sloTicketResult.autoResolvedIds.push(resolved.id);
          await addAudit({
            tenantId,
            actorUserId: effectiveActorUserId,
            action: 'slo.ticket.auto_resolved',
            outcome: 'success',
            targetType: 'slo_ticket',
            targetId: resolved.id,
            metadata: {
              trigger,
              signature: normalizeText(resolved.signature).toLowerCase() || null,
              source: normalizeText(resolved.source) || null,
            },
          });
        }
      }

      const candidates = sloBreachCandidates.slice(0, sloTicketMaxPerRun);
      for (const breach of candidates) {
        const upsert = await sloTicketStore.upsertBreach({
          tenantId,
          signature: breach.signature,
          severity: breach.severity,
          summary: breach.summary,
          details: breach.details,
          metadata: breach.metadata,
          source: 'scheduler.alert_probe',
        });
        const ticket = upsert?.ticket || null;
        if (!ticket) continue;
        sloTicketResult.processed += 1;
        if (upsert.created) sloTicketResult.created += 1;
        else sloTicketResult.updated += 1;
        sloTicketResult.details.push({
          signature: breach.signature,
          severity: breach.severity,
          ticketId: ticket.id,
          created: upsert.created === true,
        });

        if (upsert.created) {
          await addAudit({
            tenantId,
            actorUserId: effectiveActorUserId,
            action: 'slo.ticket.created',
            outcome: 'success',
            targetType: 'slo_ticket',
            targetId: ticket.id,
            metadata: {
              trigger,
              signature: breach.signature,
              severity: breach.severity,
              summary: breach.summary,
            },
          });
          await sendAlertNotification({
            tenantId,
            actorUserId: effectiveActorUserId,
            eventType: 'slo.breach.ticket',
            severity: breach.severity === 'critical' ? 'critical' : 'warn',
            payload: {
              trigger,
              signature: breach.signature,
              summary: breach.summary,
              details: breach.details,
              ticketId: ticket.id,
            },
          });
        }
      }
      if (typeof sloTicketStore.summarize === 'function') {
        sloTicketResult.summary = await sloTicketStore.summarize({ tenantId });
      }
    }

    return {
      tenantId,
      highCriticalOpenCount: highCriticalOpen.length,
      hasOpenHighCritical: highCriticalOpen.length > 0,
      incidentsOpenCount,
      incidentsBreachedOpenCount,
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
      sloAutoTicketing: sloTicketResult,
    };
  }

  async function runStrategicIntelligenceSnapshot({
    tenantId,
    trigger = 'scheduled',
    mode = 'weekly',
    actorUserId = null,
  }) {
    if (
      !capabilityAnalysisStore ||
      typeof capabilityAnalysisStore.list !== 'function' ||
      typeof capabilityAnalysisStore.append !== 'function'
    ) {
      return {
        tenantId,
        mode,
        skipped: true,
        reason: 'analysis_store_unavailable',
      };
    }

    const ccoEntries = await capabilityAnalysisStore.list({
      tenantId,
      capabilityName: 'CCO.InboxAnalysis',
      limit: 240,
    });
    const latestCcoEntry = asArray(ccoEntries)[0] || null;
    if (!latestCcoEntry) {
      return {
        tenantId,
        mode,
        skipped: true,
        reason: 'cco_inbox_analysis_missing',
      };
    }

    const latestData = safeObject(latestCcoEntry?.output?.data);
    const conversationWorklist = asArray(latestData.conversationWorklist);
    const strategicGeneratedAt = nowIso();
    const dailySignals = buildStrategicDailySignals(ccoEntries, strategicGeneratedAt, 60);
    const baseline = buildStrategicBaseline({
      latestData,
      conversationWorklist,
    });
    const monthlyRisk = analyzeMonthlyRisk({
      dailySnapshots: dailySignals,
      windowDays: 30,
      nowIso: strategicGeneratedAt,
    });
    const strategicFlags = asArray(latestData.strategicFlags).slice(0, 8);
    const businessThreats = analyzeBusinessThreats({
      conversationWorklist,
      usageMetrics: safeObject(latestData.usageAnalytics),
      strategicFlags,
      monthlyRisk,
      nowIso: strategicGeneratedAt,
    });
    const scenarioSimulation = simulateScenarios({
      baseline,
      scenarios: asArray(safeObject(latestData.scenarioSimulation).scenarios)
        .map((item) => normalizeText(item?.id))
        .filter(Boolean),
      nowIso: strategicGeneratedAt,
    });
    const forwardOutlook = computeForwardOutlook({
      dailySignals,
      windowDays: 14,
      forecastDays: 7,
      nowIso: strategicGeneratedAt,
    });
    const weeklyBrief = composeWeeklyBrief({
      focusContext: safeObject(latestData.focusContext),
      usageMetrics: safeObject(latestData.usageAnalytics),
      strategicFlags,
      systemImprovementProposal: safeObject(latestData.systemImprovementProposal),
      initiativeSummaries: asArray(latestData.initiativeSummaries),
      windowDays: 7,
      nowIso: strategicGeneratedAt,
    });

    const strategicOutput = {
      mode: normalizeText(mode) || 'weekly',
      weeklyBrief,
      monthlyRisk,
      scenarioSimulation,
      businessThreats,
      forwardOutlook,
      dailySignals: dailySignals.slice(-30),
      sourceCapabilityRunId: normalizeText(latestCcoEntry?.capabilityRunId) || null,
      generatedAt: strategicGeneratedAt,
    };

    const persisted = await capabilityAnalysisStore.append({
      tenantId,
      capability: {
        name: 'Strategic.IntelligenceSnapshot',
        version: '1.0.0',
        persistStrategy: 'snapshot',
      },
      decision: 'allow',
      runId: `scheduler-strategic-${normalizeText(mode) || 'weekly'}-${Date.now()}`,
      capabilityRunId: normalizeText(latestCcoEntry?.capabilityRunId) || null,
      actor: {
        id: actorUserId || 'scheduler',
        role: ROLE_OWNER,
      },
      input: {
        trigger,
        mode,
        sourceCapability: 'CCO.InboxAnalysis',
      },
      output: {
        metadata: {
          source: 'scheduler',
          mode,
          generatedAt: strategicGeneratedAt,
          sourceCapabilityRunId: normalizeText(latestCcoEntry?.capabilityRunId) || null,
        },
        data: strategicOutput,
      },
      metadata: {
        source: 'scheduler',
        trigger,
        mode,
        snapshotWindowDays: 60,
      },
    });

    return {
      tenantId,
      mode,
      generatedAt: strategicGeneratedAt,
      sourceCapabilityRunId: normalizeText(latestCcoEntry?.capabilityRunId) || null,
      entryId: normalizeText(persisted?.id) || null,
      dailySignalPoints: dailySignals.length,
      monthlyRiskBand: normalizeText(monthlyRisk?.riskBand) || 'low',
      topThreatSeverity: normalizeText(businessThreats?.highestSeverity) || 'none',
      forwardConfidence: toNumber(forwardOutlook?.confidenceScore, 0),
      weeklyMode: normalizeText(weeklyBrief?.mode) || 'normal',
      skipped: false,
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
      id: 'restore_drill_full',
      name: 'Restore drill full (sandbox)',
      intervalMs: toHoursMs(config.schedulerRestoreDrillFullIntervalHours, 720),
      run: runRestoreDrillFull,
    },
    {
      id: 'audit_integrity_check',
      name: 'Audit integrity check',
      intervalMs: toHoursMs(config.schedulerAuditIntegrityIntervalHours, 24),
      run: runAuditIntegrityCheck,
    },
    {
      id: 'secrets_rotation_snapshot',
      name: 'Secrets rotation snapshot',
      intervalMs: toHoursMs(config.schedulerSecretRotationIntervalHours, 24),
      run: runSecretRotationSnapshot,
    },
    {
      id: 'release_governance_review',
      name: 'Release governance review',
      intervalMs: toHoursMs(config.schedulerReleaseGovernanceIntervalHours, 24),
      run: runReleaseGovernanceReview,
    },
    {
      id: 'alert_probe',
      name: 'High/Critical alert probe',
      intervalMs: toMinutesMs(config.schedulerAlertProbeIntervalMinutes, 15),
      run: runAlertProbe,
    },
    {
      id: 'strategic_weekly_brief',
      name: 'Strategic weekly brief snapshot',
      intervalMs: toHoursMs(config.schedulerStrategicWeeklyIntervalHours, 168),
      run: async ({ tenantId, trigger, actorUserId }) =>
        runStrategicIntelligenceSnapshot({
          tenantId,
          trigger,
          actorUserId,
          mode: 'weekly',
        }),
    },
    {
      id: 'strategic_monthly_risk',
      name: 'Strategic monthly risk snapshot',
      intervalMs: toHoursMs(config.schedulerStrategicMonthlyIntervalHours, 720),
      run: async ({ tenantId, trigger, actorUserId }) =>
        runStrategicIntelligenceSnapshot({
          tenantId,
          trigger,
          actorUserId,
          mode: 'monthly',
        }),
    },
    {
      id: 'strategic_forward_outlook',
      name: 'Strategic forward outlook snapshot',
      intervalMs: toHoursMs(config.schedulerStrategicForwardIntervalHours, 24),
      run: async ({ tenantId, trigger, actorUserId }) =>
        runStrategicIntelligenceSnapshot({
          tenantId,
          trigger,
          actorUserId,
          mode: 'forward',
        }),
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
      sloAutoTicketingEnabled: Boolean(config.schedulerSloAutoTicketingEnabled),
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

  function setLongTimeout(jobId, delayMs, onElapsed) {
    const safeDelay = Math.max(0, Number(delayMs) || 0);
    if (safeDelay <= MAX_TIMEOUT_MS) {
      const timer = setTimeout(onElapsed, safeDelay);
      timers.set(jobId, timer);
      return;
    }
    const timer = setTimeout(() => {
      if (!started) return;
      setLongTimeout(jobId, safeDelay - MAX_TIMEOUT_MS, onElapsed);
    }, MAX_TIMEOUT_MS);
    timers.set(jobId, timer);
  }

  function scheduleNext(job) {
    const runtime = state.jobs[job.id];
    if (!runtime?.enabled || !started) return;
    const nextRunAt = new Date(Date.now() + job.intervalMs).toISOString();
    runtime.nextRunAt = nextRunAt;
    clearJobTimer(job.id);
    setLongTimeout(job.id, job.intervalMs, async () => {
      await runJob(job.id, { trigger: 'scheduled' });
    });
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
      setLongTimeout(job.id, initialDelayMs, async () => {
        await runJob(job.id, { trigger: 'scheduled_startup' });
      });
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
