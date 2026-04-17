const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const { AnalyzeInboxCapability } = require('../capabilities/analyzeInbox');
const { buildPilotReport } = require('../reports/pilotReport');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { buildShadowRunOutput, summarizeShadowReview } = require('./ccoShadowRun');
const { hydrateAnalyzeInboxInput, materializeCustomerReplyActions } = require('../routes/capabilities');
const { pruneSchedulerPilotReports } = require('./pilotReports');
const {
  getStateFileMap,
  createStateBackup,
  listBackups,
  pruneBackups,
  inspectBackupRestore,
  restoreFromBackup,
} = require('./stateBackup');
const {
  computeUsageAnalytics,
  computeWorklistSnapshotMetrics,
  computeHealthScore,
} = require('../intelligence/usageAnalyticsEngine');
const { evaluateRedFlag } = require('../intelligence/redFlagEngine');
const { resolveAdaptiveFocusState } = require('../intelligence/adaptiveFocusController');
const { evaluateRecovery } = require('../intelligence/recoveryEngine');
const { evaluateStrategicInsights } = require('../intelligence/strategicInsightsEngine');
const { runClientoBackfill } = require('../../scripts/run-cliento-backfill');
const { createMicrosoftGraphMailboxTruthDelta } = require('../infra/microsoftGraphMailboxTruthDelta');
const { createCcoMailboxTruthStore } = require('./ccoMailboxTruthStore');
const { config: defaultSchedulerConfig } = require('../config');

function nowIso() {
  return new Date().toISOString();
}

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
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

function safeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function normalizeMailboxId(value, fallback = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized) return normalized;
  return normalizeText(fallback).toLowerCase();
}

function toLookbackWindowBounds(lookbackDays, endMs = Date.now()) {
  const safeEndMs = Number.isFinite(Number(endMs)) ? Number(endMs) : Date.now();
  const safeLookbackDays = Math.max(1, Math.min(3650, Number(lookbackDays) || 1));
  return {
    startIso: new Date(safeEndMs - safeLookbackDays * 24 * 60 * 60 * 1000).toISOString(),
    endIso: new Date(safeEndMs).toISOString(),
  };
}

function collectCcoHistoryMessages(snapshot = {}) {
  const conversations = Array.isArray(snapshot?.conversations) ? snapshot.conversations : [];
  const messages = [];
  for (const conversation of conversations) {
    const conversationId = normalizeText(conversation?.conversationId);
    const subject = normalizeText(conversation?.subject) || '(utan ämne)';
    const customerEmail = normalizeMailboxId(conversation?.customerEmail) || null;
    const conversationMessages = Array.isArray(conversation?.messages) ? conversation.messages : [];
    for (const message of conversationMessages) {
      const messageId = normalizeText(message?.messageId);
      if (!messageId) continue;
      messages.push({
        messageId,
        conversationId: normalizeText(message?.conversationId) || conversationId,
        subject: normalizeText(message?.subject) || subject,
        customerEmail,
        sentAt: toIso(message?.sentAt) || null,
        direction: normalizeText(message?.direction).toLowerCase() === 'outbound' ? 'outbound' : 'inbound',
        bodyPreview: normalizeText(message?.bodyPreview) || '',
        senderEmail: normalizeMailboxId(message?.senderEmail) || null,
        senderName: normalizeText(message?.senderName) || null,
        recipients: (Array.isArray(message?.recipients) ? message.recipients : [])
          .map((item) => normalizeMailboxId(item))
          .filter(Boolean),
        replyToRecipients: (Array.isArray(message?.replyToRecipients) ? message.replyToRecipients : [])
          .map((item) => normalizeMailboxId(item))
          .filter(Boolean),
        mailboxId:
          normalizeMailboxId(message?.mailboxId || conversation?.mailboxId) || null,
        mailboxAddress:
          normalizeMailboxId(message?.mailboxAddress || conversation?.mailboxAddress) || null,
        userPrincipalName:
          normalizeMailboxId(message?.userPrincipalName || conversation?.userPrincipalName) || null,
      });
    }
  }
  return messages;
}

async function fetchCcoHistoryWindowMessagesFromGraph({
  graphReadConnector,
  mailboxId,
  windowStartIso,
  windowEndIso,
}) {
  const snapshot = await graphReadConnector.fetchInboxSnapshot({
    includeRead: true,
    fullTenant: true,
    userScope: 'all',
    maxUsers: 1,
    maxMessages: 200,
    maxInboxMessages: 200,
    maxSentMessages: 200,
    maxMessagesPerUser: 200,
    maxInboxMessagesPerUser: 200,
    maxSentMessagesPerUser: 200,
    mailboxIds: [mailboxId],
    sinceIso: windowStartIso,
    untilIso: windowEndIso,
  });
  return collectCcoHistoryMessages(snapshot);
}

function selectNextCcoHistoryBackfillWindow({
  missingWindows = [],
  chunkDays = 30,
}) {
  const safeChunkDays = Math.max(1, Math.min(90, Number(chunkDays) || 30));
  const chunkMs = safeChunkDays * 24 * 60 * 60 * 1000;
  const windows = Array.isArray(missingWindows) ? missingWindows : [];
  if (windows.length === 0) return null;
  const newestGap = windows[windows.length - 1];
  const startMs = Date.parse(String(newestGap?.startIso || ''));
  const endMs = Date.parse(String(newestGap?.endIso || ''));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const chunkStartMs = Math.max(startMs, endMs - chunkMs);
  return {
    startIso: new Date(chunkStartMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function resolveCcoHistoryMailboxIds(config = {}) {
  const configuredList = Array.isArray(config?.schedulerCcoHistoryMailboxIds)
    ? config.schedulerCcoHistoryMailboxIds
    : [];
  const normalized = [];
  const seen = new Set();

  for (const rawMailboxId of configuredList) {
    const mailboxId = normalizeMailboxId(rawMailboxId);
    if (!mailboxId || seen.has(mailboxId)) continue;
    seen.add(mailboxId);
    normalized.push(mailboxId);
  }

  if (normalized.length > 0) return normalized;

  const fallbackMailboxId = normalizeMailboxId(
    config?.schedulerCcoHistoryMailboxId,
    'kons@hairtpclinic.com'
  );
  return fallbackMailboxId ? [fallbackMailboxId] : [];
}

function resolveCcoShadowMailboxIds(config = {}) {
  const configuredList = Array.isArray(config?.schedulerCcoShadowMailboxIds)
    ? config.schedulerCcoShadowMailboxIds
    : [];
  const normalized = [];
  const seen = new Set();
  for (const rawMailboxId of configuredList) {
    const mailboxId = normalizeMailboxId(rawMailboxId);
    if (!mailboxId || seen.has(mailboxId)) continue;
    seen.add(mailboxId);
    normalized.push(mailboxId);
  }
  if (normalized.length > 0) return normalized;
  return resolveCcoHistoryMailboxIds(config).slice(0, 1);
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

function createScheduler({
  config: incomingConfig,
  authStore,
  templateStore,
  capabilityAnalysisStore = null,
  runtimeMetricsStore = null,
  ccoHistoryStore = null,
  ccoCustomerStore = null,
  graphReadConnector = null,
  secretRotationStore = null,
  sloTicketStore = null,
  releaseGovernanceStore = null,
  alertNotifier = null,
  logger = console,
} = {}) {
  if (!incomingConfig) throw new Error('config saknas för scheduler.');
  if (!authStore) throw new Error('authStore saknas för scheduler.');
  if (!templateStore) throw new Error('templateStore saknas för scheduler.');
  const config = { ...defaultSchedulerConfig, ...incomingConfig };

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

  function toEventTimestampMs(event = {}) {
    const candidates = [event?.ts, event?.createdAt, event?.metadata?.timestamp];
    for (const candidate of candidates) {
      const iso = toIso(candidate);
      if (!iso) continue;
      const parsed = Date.parse(iso);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  function toSprintSlaAgeHours(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) return null;
    const match = normalized.match(/^(\d+(?:\.\d+)?)\s*h$/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toAverage(values = [], precision = 2) {
    const list = (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (!list.length) return 0;
    const sum = list.reduce((acc, value) => acc + value, 0);
    const factor = 10 ** Math.max(0, Number(precision) || 0);
    return Math.round((sum / list.length) * factor) / factor;
  }

  async function buildCcoStrategicPayload({
    tenantId,
    windowDays = 14,
  } = {}) {
    if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.list !== 'function') {
      return {
        skipped: true,
        reason: 'capability_analysis_store_unavailable',
      };
    }

    const safeWindowDays = Math.max(1, Math.min(90, Number(windowDays) || 14));
    const windowStartMs = Date.now() - safeWindowDays * 24 * 60 * 60 * 1000;

    const analysisEntries = await capabilityAnalysisStore.list({
      tenantId,
      capabilityName: 'CCO.InboxAnalysis',
      limit: 450,
    });
    if (!Array.isArray(analysisEntries) || analysisEntries.length === 0) {
      return {
        skipped: true,
        reason: 'no_cco_analysis_entries',
      };
    }

    const recentEntries = analysisEntries.filter((entry) => {
      const tsMs = toEventTimestampMs(entry);
      return Number.isFinite(tsMs) && tsMs >= windowStartMs;
    });

    const sourceEntries = recentEntries.length > 0 ? recentEntries : analysisEntries;
    const latestEntry = sourceEntries[0] || null;
    const conversationWorklist = Array.isArray(latestEntry?.output?.data?.conversationWorklist)
      ? latestEntry.output.data.conversationWorklist
      : [];
    const previousEntry =
      analysisEntries
        .filter((entry) => {
          const tsMs = toEventTimestampMs(entry);
          return Number.isFinite(tsMs) && tsMs < windowStartMs;
        })
        .sort((left, right) => String(right?.ts || '').localeCompare(String(left?.ts || '')))[0] ||
      sourceEntries[1] ||
      null;
    const previousConversationWorklist = Array.isArray(previousEntry?.output?.data?.conversationWorklist)
      ? previousEntry.output.data.conversationWorklist
      : [];

    const auditEvents =
      authStore && typeof authStore.listAuditEvents === 'function'
        ? await authStore.listAuditEvents({ tenantId, limit: 1000 })
        : [];
    const recentAuditEvents = (Array.isArray(auditEvents) ? auditEvents : []).filter((event) => {
      const tsMs = toEventTimestampMs(event);
      return Number.isFinite(tsMs) && tsMs >= windowStartMs;
    });

    const sprintStartEvents = recentAuditEvents.filter(
      (event) => normalizeText(event?.action) === 'cco.sprint.start'
    );
    const sprintItemCompletedEvents = recentAuditEvents.filter(
      (event) => normalizeText(event?.action) === 'cco.sprint.item_completed'
    );
    const sprintCompleteEvents = recentAuditEvents.filter(
      (event) => normalizeText(event?.action) === 'cco.sprint.complete'
    );
    const itemSlaAgeHours = sprintItemCompletedEvents
      .map((event) => toSprintSlaAgeHours(event?.metadata?.slaAgeHours ?? event?.metadata?.slaAge))
      .filter((value) => Number.isFinite(value));
    const avgResponseTimeHours = toAverage(itemSlaAgeHours, 2);
    const sprintCompletionRate = sprintStartEvents.length
      ? Number(((sprintCompleteEvents.length / sprintStartEvents.length) * 100).toFixed(1))
      : 0;

    const followRateSeed = (() => {
      const modeEvents = recentAuditEvents.filter(
        (event) => normalizeText(event?.action).toLowerCase() === 'cco.draft.mode_selected'
      );
      if (!modeEvents.length) return 0;
      const followed = modeEvents.filter((event) => event?.metadata?.ignoredRecommended !== true).length;
      return Math.max(0, Math.min(1, followed / modeEvents.length));
    })();

    const activeDaySeed = new Set();
    recentAuditEvents.forEach((event) => {
      const action = normalizeText(event?.action).toLowerCase();
      if (!action.startsWith('cco.')) return;
      const tsMs = toEventTimestampMs(event);
      if (!Number.isFinite(tsMs)) return;
      activeDaySeed.add(new Date(tsMs).toISOString().slice(0, 10));
    });
    recentEntries.forEach((entry) => {
      const tsMs = toEventTimestampMs(entry);
      if (!Number.isFinite(tsMs)) return;
      activeDaySeed.add(new Date(tsMs).toISOString().slice(0, 10));
    });
    const ccoUsageRateSeed = Math.max(0, Math.min(1, activeDaySeed.size / safeWindowDays));
    const sprintCompletionRateSeed = sprintCompletionRate / 100;

    const sortedAnalysisEntries = analysisEntries
      .slice()
      .sort((left, right) => String(left?.ts || '').localeCompare(String(right?.ts || '')));
    const healthHistory = sortedAnalysisEntries
      .map((entry) => {
        const ts = toIso(entry?.ts);
        if (!ts) return null;
        const snapshotMetrics = computeWorklistSnapshotMetrics(
          Array.isArray(entry?.output?.data?.conversationWorklist)
            ? entry.output.data.conversationWorklist
            : []
        );
        const score = computeHealthScore({
          snapshotMetrics,
          avgResponseTimeHours,
          recommendationFollowRate: followRateSeed,
          ccoUsageRate: ccoUsageRateSeed,
          sprintCompletionRate: sprintCompletionRateSeed,
        });
        return {
          ts,
          score,
          slaBreachRate: snapshotMetrics.slaBreachRate,
        };
      })
      .filter(Boolean)
      .slice(-30);

    const usageAnalytics = computeUsageAnalytics({
      windowDays: safeWindowDays,
      auditEvents: recentAuditEvents,
      analysisEntries: recentEntries,
      currentConversationWorklist: conversationWorklist,
      previousConversationWorklist,
      healthHistory,
    });
    const clusterSignals = {
      slaBreachRateUp: usageAnalytics.slaBreachTrendPercent > 0,
      complaintSpike: usageAnalytics.complaintTrendPercent > 0,
      conversionDrop: usageAnalytics.conversionTrendPercent < 0,
      volatilityIndex: usageAnalytics.volatilityIndex,
    };
    const redFlagState = evaluateRedFlag({
      healthHistory,
      currentHealthScore: usageAnalytics.healthScore,
      clusterSignals,
      usageMetrics: usageAnalytics,
    });
    const volatilityHistory = healthHistory.map((point, index, list) => {
      if (index === 0) return { ts: point.ts, index: 0 };
      const previous = list[index - 1];
      const delta = Math.abs(toNumber(point.score, 0) - toNumber(previous?.score, 0));
      return {
        ts: point.ts,
        index: Number((Math.min(1, delta / 20)).toFixed(3)),
      };
    });
    const recoveryState = evaluateRecovery({
      redFlagState,
      healthHistory,
      slaBreachHistory: healthHistory.map((point) => ({
        ts: point.ts,
        rate: point.slaBreachRate,
      })),
      volatilityHistory,
      driverDeltas: {
        health_drop: redFlagState.delta,
        sla_breach: usageAnalytics.slaBreachTrendPercent,
        complaint_spike: usageAnalytics.complaintTrendPercent,
        conversion_drop: usageAnalytics.conversionTrendPercent,
        volatility: usageAnalytics.volatilityIndex - 0.6,
        health_threshold: usageAnalytics.healthScore - 60,
      },
    });
    const adaptiveFocusState = resolveAdaptiveFocusState({
      redFlagState,
      recoveryState,
      nowMs: Date.now(),
      durationHours: 48,
    });
    const generatedAt = new Date().toISOString();
    const strategicInsights = evaluateStrategicInsights({
      analysisEntries,
      usageAnalytics,
      redFlagState,
      adaptiveFocusState,
      recoveryState,
      generatedAt,
    });

    return {
      skipped: false,
      generatedAt,
      usageAnalytics,
      redFlagState,
      adaptiveFocusState,
      recoveryState,
      strategicInsights,
      analysisEntryCount: analysisEntries.length,
      recentEntryCount: recentEntries.length,
      worklistCount: conversationWorklist.length,
      healthHistoryPoints: healthHistory.length,
    };
  }

  async function appendStrategicAnalysisEntry({
    tenantId,
    actorUserId,
    capabilityName,
    outputData,
    metadata = {},
  } = {}) {
    if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') return null;
    if (!normalizeText(capabilityName)) return null;
    return capabilityAnalysisStore.append({
      tenantId,
      capabilityName,
      capabilityVersion: 'v1',
      persistStrategy: 'analysis_only',
      decision: 'allow',
      actor: {
        id: normalizeText(actorUserId) || 'scheduler',
        role: 'SYSTEM',
      },
      input: {},
      output: {
        data: outputData && typeof outputData === 'object' ? outputData : {},
      },
      metadata,
      riskSummary: {},
      policySummary: {},
    });
  }

  async function runCcoWeeklyBrief({ tenantId, trigger = 'scheduled', actorUserId = null }) {
    const payload = await buildCcoStrategicPayload({ tenantId, windowDays: 14 });
    if (payload.skipped) return payload;

    const outputData = {
      weeklyBrief: payload.strategicInsights.weeklyBrief,
      healthScore: payload.usageAnalytics.healthScore,
      redFlagState: payload.redFlagState,
      adaptiveFocusState: payload.adaptiveFocusState,
    };
    await appendStrategicAnalysisEntry({
      tenantId,
      actorUserId,
      capabilityName: 'CCO.WeeklyBriefComposer',
      outputData,
      metadata: {
        trigger,
        generatedAt: payload.generatedAt,
      },
    });

    return {
      tenantId,
      generatedAt: payload.generatedAt,
      mode: payload.strategicInsights.weeklyBrief?.mode || 'normal',
      recommendations: Array.isArray(payload.strategicInsights.weeklyBrief?.recommendations)
        ? payload.strategicInsights.weeklyBrief.recommendations.slice(0, 3)
        : [],
    };
  }

  async function runCcoMonthlyRisk({ tenantId, trigger = 'scheduled', actorUserId = null }) {
    const payload = await buildCcoStrategicPayload({ tenantId, windowDays: 35 });
    if (payload.skipped) return payload;

    await appendStrategicAnalysisEntry({
      tenantId,
      actorUserId,
      capabilityName: 'CCO.MonthlyRiskAnalyzer',
      outputData: {
        monthlyRisk: payload.strategicInsights.monthlyRisk,
      },
      metadata: {
        trigger,
        generatedAt: payload.generatedAt,
      },
    });
    await appendStrategicAnalysisEntry({
      tenantId,
      actorUserId,
      capabilityName: 'CCO.BusinessThreatAnalyzer',
      outputData: {
        businessThreats: payload.strategicInsights.businessThreats,
      },
      metadata: {
        trigger,
        generatedAt: payload.generatedAt,
      },
    });

    return {
      tenantId,
      generatedAt: payload.generatedAt,
      riskLevel: payload.strategicInsights.monthlyRisk?.riskLevel || 'low',
      strategicFlag: payload.strategicInsights.businessThreats?.strategicFlag === true,
    };
  }

  async function runCcoForwardOutlook({ tenantId, trigger = 'scheduled', actorUserId = null }) {
    const payload = await buildCcoStrategicPayload({ tenantId, windowDays: 21 });
    if (payload.skipped) return payload;

    await appendStrategicAnalysisEntry({
      tenantId,
      actorUserId,
      capabilityName: 'CCO.ForwardOutlookEngine',
      outputData: {
        forwardOutlook: payload.strategicInsights.forwardOutlook,
      },
      metadata: {
        trigger,
        generatedAt: payload.generatedAt,
      },
    });
    await appendStrategicAnalysisEntry({
      tenantId,
      actorUserId,
      capabilityName: 'CCO.ScenarioEngine',
      outputData: {
        scenarioAnalysis: payload.strategicInsights.scenarioAnalysis,
      },
      metadata: {
        trigger,
        generatedAt: payload.generatedAt,
      },
    });
    await appendStrategicAnalysisEntry({
      tenantId,
      actorUserId,
      capabilityName: 'CCO.StrategicInsights',
      outputData: payload.strategicInsights,
      metadata: {
        trigger,
        generatedAt: payload.generatedAt,
      },
    });

    return {
      tenantId,
      generatedAt: payload.generatedAt,
      volatilityIndex: payload.strategicInsights.forwardOutlook?.volatilityIndex ?? 0,
      confidence: payload.strategicInsights.forwardOutlook?.confidence ?? 0,
      recommendedScenario:
        payload.strategicInsights.scenarioAnalysis?.recommendedScenario?.id || null,
    };
  }

  async function runSingleCcoHistorySync({ tenantId, mailboxId }) {
    if (!mailboxId) {
      return {
        tenantId,
        skipped: true,
        reason: 'mailbox_id_missing',
      };
    }
    if (
      !ccoHistoryStore ||
      typeof ccoHistoryStore.upsertMailboxWindow !== 'function' ||
      typeof ccoHistoryStore.getMailboxSummary !== 'function' ||
      typeof ccoHistoryStore.getMissingMailboxWindows !== 'function'
    ) {
      return {
        tenantId,
        mailboxId,
        skipped: true,
        reason: 'cco_history_store_unavailable',
      };
    }
    if (!graphReadConnector || typeof graphReadConnector.fetchInboxSnapshot !== 'function') {
      return {
        tenantId,
        mailboxId,
        skipped: true,
        reason: 'graph_read_unavailable',
      };
    }

    const recentWindowDays = Math.max(
      1,
      Math.min(90, Number(config?.schedulerCcoHistoryRecentWindowDays) || 30)
    );
    const lookbackDays = Math.max(
      recentWindowDays,
      Math.min(1825, Number(config?.schedulerCcoHistoryBackfillLookbackDays) || 1095)
    );
    const chunkDays = Math.max(
      1,
      Math.min(90, Number(config?.schedulerCcoHistoryBackfillChunkDays) || 30)
    );
    const nowMs = Date.now();
    const recentWindow = toLookbackWindowBounds(recentWindowDays, nowMs);
    const fullWindow = toLookbackWindowBounds(lookbackDays, nowMs);

    const recentMessages = await fetchCcoHistoryWindowMessagesFromGraph({
      graphReadConnector,
      mailboxId,
      windowStartIso: recentWindow.startIso,
      windowEndIso: recentWindow.endIso,
    });
    const recentUpsert = await ccoHistoryStore.upsertMailboxWindow({
      tenantId,
      mailboxId,
      messages: recentMessages,
      windowStartIso: recentWindow.startIso,
      windowEndIso: recentWindow.endIso,
      source: 'scheduler_cco_history_recent',
    });

    let mailbox = ccoHistoryStore.getMailboxSummary({
      tenantId,
      mailboxId,
    });
    let missingWindows = ccoHistoryStore.getMissingMailboxWindows({
      tenantId,
      mailboxId,
      startIso: fullWindow.startIso,
      endIso: fullWindow.endIso,
    });
    let backfill = {
      performed: false,
      insertedCount: 0,
      updatedCount: 0,
      messageCount: 0,
      window: null,
    };

    const nextBackfillWindow = selectNextCcoHistoryBackfillWindow({
      missingWindows,
      chunkDays,
    });
    if (nextBackfillWindow) {
      const backfillMessages = await fetchCcoHistoryWindowMessagesFromGraph({
        graphReadConnector,
        mailboxId,
        windowStartIso: nextBackfillWindow.startIso,
        windowEndIso: nextBackfillWindow.endIso,
      });
      const backfillUpsert = await ccoHistoryStore.upsertMailboxWindow({
        tenantId,
        mailboxId,
        messages: backfillMessages,
        windowStartIso: nextBackfillWindow.startIso,
        windowEndIso: nextBackfillWindow.endIso,
        source: 'scheduler_cco_history_backfill',
      });
      mailbox = ccoHistoryStore.getMailboxSummary({
        tenantId,
        mailboxId,
      });
      missingWindows = ccoHistoryStore.getMissingMailboxWindows({
        tenantId,
        mailboxId,
        startIso: fullWindow.startIso,
        endIso: fullWindow.endIso,
      });
      backfill = {
        performed: true,
        insertedCount: Number(backfillUpsert?.insertedCount || 0),
        updatedCount: Number(backfillUpsert?.updatedCount || 0),
        messageCount: backfillMessages.length,
        window: nextBackfillWindow,
      };
    }

    return {
      tenantId,
      mailboxId,
      recentWindowDays,
      lookbackDays,
      chunkDays,
      recentSync: {
        window: recentWindow,
        messageCount: recentMessages.length,
        insertedCount: Number(recentUpsert?.insertedCount || 0),
        updatedCount: Number(recentUpsert?.updatedCount || 0),
      },
      backfill,
      coverageStartIso: mailbox?.coverageStartIso || null,
      coverageEndIso: mailbox?.coverageEndIso || null,
      messageCount: Number(mailbox?.messageCount || 0),
      missingWindowCount: Array.isArray(missingWindows) ? missingWindows.length : 0,
      complete: Array.isArray(missingWindows) ? missingWindows.length === 0 : false,
    };
  }

  async function runCcoHistorySync({ tenantId }) {
    const mailboxIds = resolveCcoHistoryMailboxIds(config);
    if (mailboxIds.length === 0) {
      return {
        tenantId,
        skipped: true,
        reason: 'mailbox_ids_missing',
      };
    }

    const mailboxes = [];
    for (const mailboxId of mailboxIds) {
      mailboxes.push(await runSingleCcoHistorySync({ tenantId, mailboxId }));
    }

    const actionableMailboxes = mailboxes.filter((item) => item?.skipped !== true);
    const skippedMailboxes = mailboxes.filter((item) => item?.skipped === true);
    const missingWindowCount = actionableMailboxes.reduce(
      (sum, item) => sum + Number(item?.missingWindowCount || 0),
      0
    );
    const totalMessageCount = actionableMailboxes.reduce(
      (sum, item) => sum + Number(item?.messageCount || 0),
      0
    );
    const backfillPerformedCount = actionableMailboxes.filter(
      (item) => item?.backfill?.performed === true
    ).length;
    const completeMailboxCount = actionableMailboxes.filter(
      (item) => item?.complete === true
    ).length;
    const recentWindowDays = Math.max(
      1,
      Math.min(90, Number(config?.schedulerCcoHistoryRecentWindowDays) || 30)
    );
    const lookbackDays = Math.max(
      recentWindowDays,
      Math.min(1825, Number(config?.schedulerCcoHistoryBackfillLookbackDays) || 1095)
    );
    const chunkDays = Math.max(
      1,
      Math.min(90, Number(config?.schedulerCcoHistoryBackfillChunkDays) || 30)
    );
    let customerReplyMaterializedCount = 0;
    if (
      ccoHistoryStore &&
      typeof ccoHistoryStore.listMailboxMessages === 'function' &&
      typeof materializeCustomerReplyActions === 'function'
    ) {
      const recentWindow = toLookbackWindowBounds(recentWindowDays, Date.now());
      const recentMessages = (
        await Promise.all(
          mailboxIds.map((mailboxId) =>
            ccoHistoryStore.listMailboxMessages({
              tenantId,
              mailboxId,
              sinceIso: recentWindow.startIso,
              untilIso: recentWindow.endIso,
            })
          )
        )
      ).flat();
      customerReplyMaterializedCount = await materializeCustomerReplyActions({
        tenantId,
        messages: recentMessages,
        ccoHistoryStore,
      });
    }

    const historySyncSucceeded =
      actionableMailboxes.length > 0 &&
      skippedMailboxes.length === 0 &&
      actionableMailboxes.every((item) => item?.complete === true);
    let customerStateWriteBack = {
      attempted: false,
      persisted: false,
      changed: false,
      reason: 'history_sync_incomplete',
    };
    if (
      historySyncSucceeded &&
      ccoCustomerStore &&
      typeof ccoCustomerStore.peekTenantCustomerState === 'function' &&
      typeof ccoCustomerStore.getTenantCustomerState === 'function' &&
      typeof ccoCustomerStore.saveTenantCustomerState === 'function'
    ) {
      const persistedCustomerState = await ccoCustomerStore.peekTenantCustomerState({
        tenantId,
      });
      const materializedCustomerState = await ccoCustomerStore.getTenantCustomerState({
        tenantId,
      });
      const changed = !isDeepStrictEqual(persistedCustomerState, materializedCustomerState);
      if (changed) {
        const savedCustomerState = await ccoCustomerStore.saveTenantCustomerState({
          tenantId,
          customerState: materializedCustomerState,
        });
        customerStateWriteBack = {
          attempted: true,
          persisted: true,
          changed: true,
          reason: 'history_sync_complete',
          identityCount: Object.keys(savedCustomerState?.identityByKey || {}).length,
          primaryEmailCount: Object.keys(savedCustomerState?.primaryEmailByKey || {}).length,
        };
      } else {
        customerStateWriteBack = {
          attempted: true,
          persisted: false,
          changed: false,
          reason: 'history_sync_no_change',
          identityCount: Object.keys(materializedCustomerState?.identityByKey || {}).length,
          primaryEmailCount: Object.keys(materializedCustomerState?.primaryEmailByKey || {}).length,
        };
      }
    }

    return {
      tenantId,
      mailboxId: mailboxIds[0] || null,
      mailboxIds,
      mailboxes,
      syncedMailboxCount: actionableMailboxes.length,
      skippedMailboxCount: skippedMailboxes.length,
      completeMailboxCount,
      backfillPerformedCount,
      recentWindowDays,
      lookbackDays,
      chunkDays,
      totalMessageCount,
      missingWindowCount,
      customerReplyMaterializedCount,
      customerStateWriteBack,
      complete: historySyncSucceeded,
    };
  }

  async function runCcoClientoBackfill({ tenantId, trigger = 'scheduled' }) {
    if (!ccoCustomerStore || typeof ccoCustomerStore.getTenantCustomerImportCoverageReadout !== 'function') {
      return {
        tenantId,
        skipped: true,
        reason: 'cco_customer_store_unavailable',
      };
    }
    const hasHistoryStore =
      ccoHistoryStore &&
      (typeof ccoHistoryStore.listMailboxMessages === 'function' ||
        typeof ccoHistoryStore.listMessages === 'function');
    if (!hasHistoryStore) {
      return {
        tenantId,
        skipped: true,
        reason: 'cco_history_store_unavailable',
      };
    }
    const configuredCsvPath = normalizeText(config?.schedulerCcoClientoBackfillCsvPath);
    if (!configuredCsvPath) {
      return {
        tenantId,
        skipped: true,
        reason: 'cliento_backfill_csv_path_missing',
      };
    }

    const report = await runClientoBackfill({
      tenantId,
      csvPath: configuredCsvPath,
      customerStorePath: config?.ccoCustomerStorePath || undefined,
      truthStorePath: config?.ccoMailboxTruthStorePath || undefined,
      allowEmpty: true,
    });

    return {
      tenantId,
      trigger,
      selectedRowCount: Number(report?.selectedRowCount || 0),
      before: report?.before || null,
      after: report?.after || null,
      truth: report?.truth || null,
      consumer: report?.consumer || null,
      shadow: report?.shadow || null,
      sourceCounts: report?.sourceCounts || {},
      coverageReadout: report?.afterCoverageReadout || report?.coverageReadout || null,
      importSummary: report?.importSummary || null,
    };
  }

  async function runCcoShadowRun({ tenantId, trigger = 'scheduled', actorUserId = null }) {
    if (!graphReadConnector || typeof graphReadConnector.fetchInboxSnapshot !== 'function') {
      return {
        tenantId,
        skipped: true,
        reason: 'graph_read_connector_unavailable',
      };
    }
    if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') {
      return {
        tenantId,
        skipped: true,
        reason: 'capability_analysis_store_unavailable',
      };
    }

    const mailboxIds = resolveCcoShadowMailboxIds(config);
    if (mailboxIds.length === 0) {
      return {
        tenantId,
        skipped: true,
        reason: 'mailbox_ids_missing',
      };
    }

    const lookbackDays = Math.max(
      7,
      Math.min(30, Number(config?.schedulerCcoShadowLookbackDays) || 14)
    );
    const correlationId = `cco-shadow-run:${crypto.randomUUID()}`;
    const requestId = `scheduler-shadow-run:${crypto.randomUUID()}`;
    const { input, systemStateSnapshot } = await hydrateAnalyzeInboxInput({
      tenantId,
      input: {
        includeClosed: false,
        maxDrafts: 5,
      },
      systemStateSnapshot: {},
      graphReadConnector,
      capabilityAnalysisStore,
      ccoHistoryStore,
      authStore,
      actorUserId: actorUserId || 'scheduler',
      correlationId,
      graphReadOptionsOverride: {
        days: lookbackDays,
        mailboxIds,
        includeRead: true,
        fullTenant: true,
        userScope: 'all',
        maxUsers: Math.max(1, mailboxIds.length),
      },
    });
    const capability = new AnalyzeInboxCapability();
    const analyzeResult = await capability.execute({
      input,
      systemStateSnapshot,
      tenantId,
      channel: 'admin',
      requestId,
      correlationId,
    });
    const shadowOutput = buildShadowRunOutput({
      analyzeResult,
      systemStateSnapshot,
      mailboxIds,
      lookbackDays,
      generatedAt: nowIso(),
    });
    const entry = await capabilityAnalysisStore.append({
      tenantId,
      capabilityName: 'CCO.ShadowRun',
      capabilityVersion: 'v1',
      persistStrategy: 'analysis_only',
      decision: 'allow',
      actor: {
        id: normalizeText(actorUserId) || 'scheduler',
        role: 'SYSTEM',
      },
      runId: requestId,
      correlationId,
      input: {
        mailboxIds,
        lookbackDays,
        trigger,
      },
      output: {
        data: shadowOutput,
      },
      metadata: {
        source: 'scheduler_shadow_run',
        mailboxIds,
        lookbackDays,
        trigger,
      },
      riskSummary: {},
      policySummary: {},
    });

    return {
      tenantId,
      mailboxIds,
      lookbackDays,
      recommendationCount: Number(shadowOutput?.summary?.recommendationCount || 0),
      followUpCount: Number(shadowOutput?.summary?.followUpCount || 0),
      highPriorityCount: Number(shadowOutput?.summary?.highPriorityCount || 0),
      entryId: entry?.id || null,
      capturedAt: entry?.ts || null,
    };
  }

  async function runCcoShadowReview({ tenantId, trigger = 'scheduled', actorUserId = null }) {
    if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.list !== 'function') {
      return {
        tenantId,
        skipped: true,
        reason: 'capability_analysis_store_unavailable',
      };
    }
    if (!ccoHistoryStore) {
      return {
        tenantId,
        skipped: true,
        reason: 'cco_history_store_unavailable',
      };
    }

    const mailboxIds = resolveCcoShadowMailboxIds(config);
    const lookbackDays = Math.max(
      7,
      Math.min(30, Number(config?.schedulerCcoShadowReviewLookbackDays) || 14)
    );
    const shadowEntries = await capabilityAnalysisStore.list({
      tenantId,
      capabilityName: 'CCO.ShadowRun',
      limit: 500,
    });
    // History store treats untilIso as exclusive. Nudge the shadow-review
    // window forward slightly so actions/outcomes recorded immediately before
    // the review run are still included deterministically.
    const window = toLookbackWindowBounds(lookbackDays, Date.now() + 1000);
    let customerReplyMaterializedCount = 0;
    if (
      typeof ccoHistoryStore.listMailboxMessages === 'function' &&
      typeof materializeCustomerReplyActions === 'function'
    ) {
      const recentMessages = (
        await Promise.all(
          mailboxIds.map((mailboxId) =>
            ccoHistoryStore.listMailboxMessages({
              tenantId,
              mailboxId,
              sinceIso: window.startIso,
              untilIso: window.endIso,
            })
          )
        )
      ).flat();
      customerReplyMaterializedCount = await materializeCustomerReplyActions({
        tenantId,
        messages: recentMessages,
        ccoHistoryStore,
      });
    }
    const [actions, outcomes] = await Promise.all([
      typeof ccoHistoryStore.listActions === 'function'
        ? ccoHistoryStore.listActions({
            tenantId,
            mailboxIds,
            sinceIso: window.startIso,
            untilIso: window.endIso,
          })
        : [],
      typeof ccoHistoryStore.listOutcomes === 'function'
        ? ccoHistoryStore.listOutcomes({
            tenantId,
            mailboxIds,
            sinceIso: window.startIso,
            untilIso: window.endIso,
          })
        : [],
    ]);
    const summary = summarizeShadowReview({
      shadowEntries,
      actions,
      outcomes,
      mailboxIds,
      lookbackDays,
      limit: 24,
    });
    const entry = await appendStrategicAnalysisEntry({
      tenantId,
      actorUserId: actorUserId || 'scheduler',
      capabilityName: 'CCO.ShadowReview',
      outputData: summary,
      metadata: {
        source: 'scheduler_shadow_review',
        mailboxIds,
        lookbackDays,
        trigger,
      },
    });

    return {
      tenantId,
      mailboxIds,
      lookbackDays,
      recommendationCount: Number(summary?.totals?.recommendationCount || 0),
      positiveCount: Number(summary?.totals?.positiveCount || 0),
      negativeCount: Number(summary?.totals?.negativeCount || 0),
      pendingCount: Number(summary?.totals?.pendingCount || 0),
      suspectCounts: summary?.suspectCounts || {},
      customerReplyMaterializedCount,
      entryId: entry?.id || null,
      generatedAt: summary?.generatedAt || null,
    };
  }

  async function runCcoTruthDeltaSync({ tenantId }) {
    if (!config.graphReadEnabled) {
      logger?.log?.('[scheduler] cco_truth_delta_sync skipped: graph_read_disabled');
      return {
        tenantId,
        skipped: true,
        reason: 'graph_read_disabled',
      };
    }
    if (
      !graphReadConnector ||
      typeof graphReadConnector.fetchMailboxTruthFolderDeltaPage !== 'function'
    ) {
      logger?.log?.('[scheduler] cco_truth_delta_sync skipped: graph_read_unavailable');
      return {
        tenantId,
        skipped: true,
        reason: 'graph_read_unavailable',
      };
    }
    const mailboxIds = resolveCcoHistoryMailboxIds(config);
    if (mailboxIds.length === 0) {
      logger?.log?.('[scheduler] cco_truth_delta_sync skipped: mailbox_ids_missing');
      return {
        tenantId,
        skipped: true,
        reason: 'mailbox_ids_missing',
      };
    }
    const truthPath = normalizeText(config.ccoMailboxTruthStorePath);
    if (!truthPath) {
      logger?.log?.('[scheduler] cco_truth_delta_sync skipped: truth_store_path_missing');
      return {
        tenantId,
        skipped: true,
        reason: 'truth_store_path_missing',
      };
    }

    let truthStore;
    try {
      truthStore = await createCcoMailboxTruthStore({
        filePath: truthPath,
      });
    } catch (error) {
      logger?.log?.(
        `[scheduler] cco_truth_delta_sync skipped: truth_store_open_failed (${sanitizeError(error)})`
      );
      return {
        tenantId,
        skipped: true,
        reason: 'truth_store_open_failed',
        error: sanitizeError(error),
      };
    }

    const delta = createMicrosoftGraphMailboxTruthDelta({
      connectorFactory: () => graphReadConnector,
      store: truthStore,
    });

    try {
      const result = await delta.runDeltaSync({
        mailboxIds,
        folderTypes: ['inbox', 'sent', 'drafts', 'deleted'],
      });
      logger?.log?.(
        `[scheduler] cco_truth_delta_sync ok runId=${result?.runId || ''} mailboxes=${mailboxIds.length} elapsedMs=${result?.elapsedMs ?? ''}`
      );
      return {
        tenantId,
        skipped: false,
        ...result,
      };
    } catch (error) {
      logger?.error?.('[scheduler] cco_truth_delta_sync failed', sanitizeError(error));
      throw error;
    }
  }

  const jobDefinitions = [
    {
      id: 'cco_weekly_brief',
      name: 'CCO weekly brief snapshot',
      intervalMs: toHoursMs(config.schedulerCcoWeeklyBriefIntervalHours, 24),
      run: runCcoWeeklyBrief,
    },
    {
      id: 'cco_monthly_risk',
      name: 'CCO monthly risk + threats snapshot',
      intervalMs: toHoursMs(config.schedulerCcoMonthlyRiskIntervalHours, 24),
      run: runCcoMonthlyRisk,
    },
    {
      id: 'cco_forward_outlook',
      name: 'CCO forward outlook + scenario snapshot',
      intervalMs: toHoursMs(config.schedulerCcoForwardOutlookIntervalHours, 6),
      run: runCcoForwardOutlook,
    },
    {
      id: 'cco_history_sync',
      name: 'CCO kons history sync',
      intervalMs: toHoursMs(config.schedulerCcoHistorySyncIntervalHours, 6),
      run: runCcoHistorySync,
    },
    {
      id: 'cco_truth_delta_sync',
      name: 'CCO mailbox truth delta sync',
      intervalMs: config.graphReadEnabled
        ? toMinutesMs(config.schedulerCcoTruthDeltaIntervalMinutes, 5)
        : 0,
      run: runCcoTruthDeltaSync,
    },
    {
      id: 'cco_cliento_backfill',
      name: 'CCO Cliento backfill',
      intervalMs: toHoursMs(config.schedulerCcoClientoBackfillIntervalHours, 24),
      run: runCcoClientoBackfill,
    },
    {
      id: 'cco_shadow_run',
      name: 'CCO kons shadow run',
      intervalMs: toHoursMs(config.schedulerCcoShadowRunIntervalHours, 6),
      run: runCcoShadowRun,
    },
    {
      id: 'cco_shadow_review',
      name: 'CCO kons daily shadow review',
      intervalMs: toHoursMs(config.schedulerCcoShadowReviewIntervalHours, 24),
      run: runCcoShadowReview,
    },
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
