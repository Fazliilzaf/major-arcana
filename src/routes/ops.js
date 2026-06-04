// @ts-nocheck
const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const {
  getStateFileMap,
  buildStateManifest,
  createStateBackup,
  listBackups,
  pruneBackups,
  resolveBackupFilePath,
  inspectBackupRestore,
  restoreFromBackup,
} = require('../ops/stateBackup');
const { listSchedulerPilotReports, pruneSchedulerPilotReports } = require('../ops/pilotReports');
const { validateTemplateVariables, applyChannelSignature } = require('../templates/variables');
const { evaluateTemplateRisk } = require('../risk/templateRisk');
const { buildDigest } = require('../ops/dailyDigest');
const { runDigestForTenant, runDailyDigestForAllTenants } = require('../ops/dailyDigestRunner');
const { runEnrichment } = require('../ops/messageEnrichmentRunner');
const { seedFromMailboxTruth: seedClientoMockBookings } = require('../ops/clientoMockSeeder');
const {
  aggregateByCustomer,
  findCrossMailboxCustomers,
  summarizeAggregation,
} = require('../ops/crossMailboxAggregator');
const { getBootstrapStatus, isEnabled: isBootstrapEnabled } = require('../ops/bootstrapRunner');
const { computeCcoInboxEnrichmentCoverage } = require('../ops/ccoInboxEnrichmentCoverage');
const { analyzeCcoInboxEnrichmentGaps } = require('../ops/ccoInboxEnrichmentGapAnalysis');
const {
  loadDenominatorExclusions,
  saveDenominatorExclusions,
  buildDenominatorExclusionsFromGapDetails,
  applyDenominatorExclusionsToCoverage,
} = require('../ops/ccoInboxEnrichmentDenominatorExclusions');
const { buildGraphMessageIdRepairPlan } = require('../ops/ccoGraphMessageIdRepairPlan');
const {
  applyGraphMessageIdRepairCanary,
  saveConversationAliases,
  reconcileRepairRegistryFromGapDetails,
} = require('../ops/ccoGraphMessageIdRepairApply');
const { loadRepairRegistry } = require('../ops/ccoGraphMessageIdRepairRegistry');
const {
  buildParserEmptyFallbackPlan,
  applyParserEmptyFallbackBatch,
} = require('../ops/ccoParserEmptyFallback');
const {
  loadAmbiguousReviewSummary,
  listAmbiguousReviewQueue,
  getAmbiguousReviewItem,
  decideAmbiguousReviewItem,
  MIN_APPROVE_MATCH_FIELDS,
  DETERMINISTIC_MATCH_FIELDS,
} = require('../ops/ccoAmbiguousMailEnrichmentReviewService');
const { createCcoConversationStateStore } = require('../ops/ccoConversationStateStore');
const {
  buildCcoInboxEnrichmentBackfillPlan,
  summarizeWorklistSignals,
} = require('../ops/ccoInboxEnrichmentBackfillPlan');
const { diagnoseEnrichmentBaselineRecovery } = require('../ops/ccoInboxEnrichmentBaselineDiagnose');
const { resolveCheckpointPath } = require('../ops/ccoInboxEnrichmentCheckpoint');
const { clearWorklistConsumerResponseCache } = require('../routes/capabilities');
const {
  applyApprovedDraftProposal,
  buildCustomerReminderQueue,
  buildJournalDraftProposals,
  buildMissingFormsReport,
  promoteApprovedDraftToJournalEntry,
  resolveMaintenanceWindow,
} = require('../ops/ccoPatientCareOps');
const { sendPatientOutreach, OUTREACH_TYPES } = require('../ops/ccoPatientOutreach');
const { createTransactionalMailer } = require('../infra/transactionalMailer');
const { resolveResendFrom } = require('../infra/resendConfig');
const {
  inspectMailboxTruthLayout,
  restoreMailboxTruthShards,
} = require('../ops/ccoMailboxTruthRestore');
const { decodeMailboxIdFromShardFileName } = require('../ops/ccoMailboxTruthShardedStore');
const { runMailTruthHydration } = require('../ops/mailTruthHydrationFromIngestion');
const { createCcoAuditLog } = require('../security/ccoAuditLog');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const mailTruthHydrationJobs = new Map();
const MAIL_TRUTH_HYDRATION_JOB_TTL_MS = 6 * 60 * 60 * 1000;
const enrichmentBackfillJobs = new Map();
const ENRICHMENT_BACKFILL_JOB_TTL_MS = 12 * 60 * 60 * 1000;

function summarizeEnrichmentCoverage(coverage = null) {
  if (!coverage || typeof coverage !== 'object') return coverage;
  const safeCoverage = { ...coverage };
  delete safeCoverage.gapConversationIds;
  safeCoverage.gapConversationIdsCount = Array.isArray(coverage.gapConversationIds)
    ? coverage.gapConversationIds.length
    : Number(coverage.gapCount || 0);
  safeCoverage.sampleUnenrichedIds = Array.isArray(coverage.sampleUnenrichedIds)
    ? coverage.sampleUnenrichedIds.slice(0, 5)
    : [];
  return safeCoverage;
}

function summarizeEnrichmentBackfillResult(result = null) {
  if (!result || typeof result !== 'object') return result;
  const safeResult = { ...result };
  if (safeResult.result && typeof safeResult.result === 'object') {
    const inner = { ...safeResult.result };
    for (const key of ['coverageBefore', 'coverage', 'coverageAfterBootstrap']) {
      if (inner[key]) inner[key] = summarizeEnrichmentCoverage(inner[key]);
    }
    if (Array.isArray(inner.batchRuns) && inner.batchRuns.length > 24) {
      inner.batchRunCount = inner.batchRuns.length;
      inner.batchRuns = inner.batchRuns.slice(0, 8).concat(inner.batchRuns.slice(-8));
    }
    safeResult.result = inner;
  }
  return safeResult;
}

function pruneEnrichmentBackfillJobs() {
  const now = Date.now();
  for (const [runId, job] of enrichmentBackfillJobs.entries()) {
    const ageMs = now - Number(job.startedAtMs || 0);
    if (ageMs > ENRICHMENT_BACKFILL_JOB_TTL_MS) {
      enrichmentBackfillJobs.delete(runId);
    }
  }
}

function pruneMailTruthHydrationJobs() {
  const now = Date.now();
  for (const [runId, job] of mailTruthHydrationJobs.entries()) {
    const anchor = Date.parse(job.updatedAt || job.startedAt || 0);
    if (!Number.isFinite(anchor) || now - anchor > MAIL_TRUTH_HYDRATION_JOB_TTL_MS) {
      mailTruthHydrationJobs.delete(runId);
    }
  }
}

function parseLimit(value, fallback = 20) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, parsed));
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseDays(value, fallback = 90) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(7, Math.min(3650, parsed));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseReleaseStatus(value, fallback = 'ok') {
  const normalized = normalizeText(value).toLowerCase();
  if (['ok', 'risk', 'incident'].includes(normalized)) return normalized;
  return fallback;
}

function parseNoGoWindowFromAuditEvents(events = [], minDays = 14) {
  const safeDays = Math.max(1, Number(minDays) || 14);
  const nowMs = Date.now();
  const cutoffMs = nowMs - safeDays * 24 * 60 * 60 * 1000;
  const relevant = (Array.isArray(events) ? events : []).filter((item) => {
    if (normalizeText(item?.action) !== 'monitor.readiness.read') return false;
    if (normalizeText(item?.outcome) && normalizeText(item?.outcome) !== 'success') return false;
    const ts = Date.parse(String(item?.ts || ''));
    return Number.isFinite(ts) && ts >= cutoffMs && ts <= nowMs;
  });
  let clean = relevant.length > 0;
  let maxTriggeredNoGo = 0;
  for (const event of relevant) {
    const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    const triggeredNoGo = Number(metadata?.triggeredNoGo || 0);
    if (triggeredNoGo > 0) clean = false;
    if (Number.isFinite(triggeredNoGo) && triggeredNoGo > maxTriggeredNoGo) {
      maxTriggeredNoGo = triggeredNoGo;
    }
  }
  return {
    days: safeDays,
    evidenceCount: relevant.length,
    clean,
    maxTriggeredNoGo,
    latestTs: relevant.length > 0 ? relevant[relevant.length - 1].ts || null : null,
  };
}

function buildReleaseEvaluationOptions(config = {}) {
  return {
    requiredNoGoFreeDays: Number(config?.releaseNoGoFreeDays || 14),
    requirePentestEvidence: Boolean(config?.releaseRequirePentestEvidence),
    pentestMaxAgeDays: Number(config?.releasePentestMaxAgeDays || 120),
    postLaunchReviewWindowDays: Number(config?.releasePostLaunchReviewWindowDays || 30),
    postLaunchStabilizationDays: Number(config?.releasePostLaunchStabilizationDays || 14),
    enforcePostLaunchStabilization: Boolean(config?.releaseEnforcePostLaunchStabilization),
    requireDistinctSignoffUsers: Boolean(config?.releaseRequireDistinctSignoffUsers),
    realityAuditIntervalDays: Number(config?.releaseRealityAuditIntervalDays || 90),
    requireFinalLiveSignoff: Boolean(config?.releaseRequireFinalLiveSignoff),
  };
}

async function getTenantTemplateRuntime(tenantConfigStore, tenantId) {
  if (!tenantConfigStore || typeof tenantConfigStore.getTenantConfig !== 'function') {
    return {
      riskSensitivityModifier: 0,
      riskThresholdVersion: 1,
      templateVariableAllowlistByCategory: {},
      templateRequiredVariablesByCategory: {},
      templateSignaturesByChannel: {},
    };
  }
  try {
    const tenantConfig = await tenantConfigStore.getTenantConfig(tenantId);
    const modifier = Number(tenantConfig?.riskSensitivityModifier ?? 0);
    const thresholdVersion = Number.parseInt(String(tenantConfig?.riskThresholdVersion ?? 1), 10);
    return {
      riskSensitivityModifier: Number.isFinite(modifier)
        ? Math.max(-10, Math.min(10, modifier))
        : 0,
      riskThresholdVersion:
        Number.isFinite(thresholdVersion) && thresholdVersion > 0 ? thresholdVersion : 1,
      templateVariableAllowlistByCategory: tenantConfig?.templateVariableAllowlistByCategory || {},
      templateRequiredVariablesByCategory: tenantConfig?.templateRequiredVariablesByCategory || {},
      templateSignaturesByChannel: tenantConfig?.templateSignaturesByChannel || {},
    };
  } catch {
    return {
      riskSensitivityModifier: 0,
      riskThresholdVersion: 1,
      templateVariableAllowlistByCategory: {},
      templateRequiredVariablesByCategory: {},
      templateSignaturesByChannel: {},
    };
  }
}

function analyzeOutputGate(snapshot = null) {
  const risk = snapshot?.risk && typeof snapshot.risk === 'object' ? snapshot.risk : null;
  const decision = normalizeText(risk?.decision).toLowerCase();
  const ownerDecision = normalizeText(risk?.ownerDecision).toLowerCase();
  const outputEvaluation = risk?.output && typeof risk.output === 'object' ? risk.output : null;
  const hasOutputEvaluation =
    Boolean(outputEvaluation) && normalizeText(outputEvaluation?.scope).toLowerCase() === 'output';
  const hasPolicyMetadata =
    hasOutputEvaluation &&
    Array.isArray(outputEvaluation?.policyHits) &&
    Array.isArray(outputEvaluation?.policyAdjustments);
  const requiresOwnerOverride = decision === 'review_required' || decision === 'blocked';
  const hasOwnerOverride =
    ownerDecision === 'approved_exception' || ownerDecision === 'false_positive';

  const issues = [];
  if (!risk) issues.push('risk_missing');
  if (!hasOutputEvaluation) issues.push('output_evaluation_missing');
  if (hasOutputEvaluation && !hasPolicyMetadata) issues.push('policy_metadata_missing');
  if (!decision) issues.push('decision_missing');
  if (requiresOwnerOverride && !hasOwnerOverride) issues.push('owner_override_missing');

  return {
    decision: decision || null,
    ownerDecision: ownerDecision || null,
    hasOutputEvaluation,
    hasPolicyMetadata,
    issues,
    fixableIssues: issues.filter((item) => item !== 'owner_override_missing'),
  };
}

function classifyOwnerMfaMembers(members = [], { currentMembershipId = '' } = {}) {
  const normalizedCurrentMembershipId = normalizeText(currentMembershipId);
  const activeOwners = (Array.isArray(members) ? members : [])
    .filter((item) => {
      const role = normalizeText(item?.membership?.role).toUpperCase();
      const status = normalizeText(item?.membership?.status).toLowerCase();
      return role === 'OWNER' && status === 'active';
    })
    .map((item) => ({
      email: normalizeText(item?.user?.email) || '-',
      userId: normalizeText(item?.user?.id) || null,
      membershipId: normalizeText(item?.membership?.id) || null,
      mfaRequired: item?.user?.mfaRequired === true,
      mfaConfigured: item?.user?.mfaConfigured === true,
      status: normalizeText(item?.membership?.status).toLowerCase() || 'active',
      role: normalizeText(item?.membership?.role).toUpperCase() || 'OWNER',
    }))
    .sort((a, b) => String(a.email || '').localeCompare(String(b.email || '')));

  const compliantOwners = activeOwners.filter((item) => item.mfaRequired && item.mfaConfigured);
  const nonCompliantOwners = activeOwners.filter(
    (item) => !item.mfaRequired || !item.mfaConfigured
  );
  const canDisableNonCompliant = compliantOwners.length >= 1;
  const protectedCurrentOwnerCandidates = [];
  const disableCandidates = [];

  if (canDisableNonCompliant) {
    for (const item of nonCompliantOwners) {
      if (!item.membershipId) continue;
      if (normalizedCurrentMembershipId && item.membershipId === normalizedCurrentMembershipId) {
        protectedCurrentOwnerCandidates.push(item);
        continue;
      }
      disableCandidates.push(item);
    }
  }

  return {
    activeOwners,
    compliantOwners,
    nonCompliantOwners,
    canDisableNonCompliant,
    disableCandidates,
    protectedCurrentOwnerCandidates,
  };
}

function resolveCcoHistoryMailboxIds(config = {}) {
  const configuredList = Array.isArray(config?.schedulerCcoHistoryMailboxIds)
    ? config.schedulerCcoHistoryMailboxIds
    : [];
  const normalized = [];
  const seen = new Set();
  for (const rawMailboxId of configuredList) {
    const mailboxId = normalizeText(rawMailboxId).toLowerCase();
    if (!mailboxId || seen.has(mailboxId)) continue;
    seen.add(mailboxId);
    normalized.push(mailboxId);
  }
  if (normalized.length > 0) return normalized;
  const fallback = normalizeText(config?.schedulerCcoHistoryMailboxId).toLowerCase();
  return fallback ? [fallback] : [];
}

function createOpsRouter({
  config,
  authStore,
  secretRotationStore = null,
  scheduler = null,
  templateStore = null,
  tenantConfigStore = null,
  sloTicketStore = null,
  releaseGovernanceStore = null,
  ccoMailboxTruthStore = null,
  capabilityAnalysisStore = null,
  ccoCustomerStore = null,
  messageIntelligenceStore = null,
  customerPreferenceStore = null,
  ccoHistoryStore = null,
  graphSendConnector = null,
  runtimeMetricsStore = null,
  clientoBookingStore = null,
  journalStore = null,
  patientMasterStore = null,
  bookingEngineStore = null,
  treatmentAgreementStore = null,
  patientCareStateStore = null,
  ccoSettingsStore = null,
  ccoMailIngestionStore = null,
  requireAuth,
  requireRole,
}) {
  const DEFAULT_PREFERRED_MAILBOX = String(
    process.env.CCO_DEFAULT_PREFERRED_MAILBOX || 'contact@hairtpclinic.com'
  ).toLowerCase();
  const router = express.Router();
  const REQUIRED_SCHEDULER_SUITE_JOB_IDS = Object.freeze([
    'nightly_pilot_report',
    'backup_prune',
    'journal_photos_backup',
    'restore_drill_preview',
    'restore_drill_full',
    'audit_integrity_check',
    'secrets_rotation_snapshot',
    'release_governance_review',
    'alert_probe',
  ]);

  router.get('/ops/maintenance-window', (_req, res) => {
    const window = resolveMaintenanceWindow(config || {});
    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      maintenance: window,
    });
  });

  router.post(
    '/ops/mail/transactional-probe',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const to =
        normalizeText(req.body?.to) ||
        normalizeText(process.env.OPERATOR_NOTIFY_TO) ||
        'contact@hairtpclinic.com';
      const mailer = createTransactionalMailer({ graphSendConnector });
      const result = await mailer.sendEmail({
        to,
        from: resolveResendFrom(),
        subject: '[Arcana] transactional mail probe',
        html: '<p>Prod transactional mail probe — Resend eller Graph fallback.</p>',
        text: 'Prod transactional mail probe — Resend eller Graph fallback.',
        idempotencyKey: `ops-mail-probe-${new Date().toISOString().slice(0, 13)}`,
      });
      return res.json({
        ok: result.ok !== false,
        generatedAt: new Date().toISOString(),
        to,
        email: result,
      });
    }
  );

  router.get(
    '/ops/cco-care/missing-forms-report',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!journalStore || !patientMasterStore) {
        return res.status(503).json({ error: 'Journal- eller patientstore saknas.' });
      }
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      try {
        const live = await buildMissingFormsReport({
          journalStore,
          patientMasterStore,
          treatmentAgreementStore,
          tenantId,
        });
        const cached = patientCareStateStore
          ? await patientCareStateStore.getLastReport({
              tenantId,
              reportType: 'missing_forms',
            })
          : null;
        return res.json({
          ok: true,
          generatedAt: new Date().toISOString(),
          tenantId,
          report: live,
          lastScheduledRun: cached,
        });
      } catch (error) {
        console.error('[ops/cco-care/missing-forms-report]', error);
        return res.status(500).json({ error: 'Kunde inte bygga missing-forms-rapport.' });
      }
    }
  );

  router.get(
    '/ops/cco-care/draft-proposals',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      const status = normalizeText(req.query?.status) || 'pending';
      const patientId = normalizeText(req.query?.patientId);
      const limit = parseLimit(req.query?.limit, 50);
      try {
        const stored = patientCareStateStore
          ? await patientCareStateStore.listDraftProposals({ tenantId, status, patientId, limit })
          : [];
        let live = null;
        const includeLivePreview = !patientId && normalizeText(req.query?.livePreview) !== '0';
        if (includeLivePreview && journalStore && patientMasterStore && patientCareStateStore) {
          live = await buildJournalDraftProposals({
            journalStore,
            patientMasterStore,
            treatmentAgreementStore,
            patientCareStateStore,
            tenantId,
            patientLimit: limit,
            persist: false,
          });
        }
        return res.json({
          ok: true,
          generatedAt: new Date().toISOString(),
          tenantId,
          proposals: stored,
          livePreview: live
            ? {
                proposalCount: live.proposalCount,
                reportSummary: live.reportSummary,
              }
            : null,
        });
      } catch (error) {
        console.error('[ops/cco-care/draft-proposals]', error);
        return res.status(500).json({ error: 'Kunde inte läsa journalutkast.' });
      }
    }
  );

  router.get(
    '/ops/cco-care/reminders',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!bookingEngineStore) {
        return res.status(503).json({ error: 'Booking engine store saknas.' });
      }
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      try {
        const queue = await buildCustomerReminderQueue({
          bookingEngineStore,
          journalStore,
          patientMasterStore,
          patientCareStateStore,
          settingsStore: ccoSettingsStore,
          tenantId,
        });
        const cached = patientCareStateStore
          ? await patientCareStateStore.getLastReport({
              tenantId,
              reportType: 'customer_reminders',
            })
          : null;
        return res.json({
          ok: true,
          generatedAt: new Date().toISOString(),
          tenantId,
          queue,
          lastScheduledRun: cached,
        });
      } catch (error) {
        console.error('[ops/cco-care/reminders]', error);
        return res.status(500).json({ error: 'Kunde inte bygga påminnelskö.' });
      }
    }
  );

  router.post(
    '/ops/cco-care/run-missing-forms',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!scheduler || typeof scheduler.runJob !== 'function') {
        return res.status(503).json({ error: 'Scheduler är inte tillgänglig.' });
      }
      const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
      try {
        const result = await scheduler.runJob('cco_daily_missing_forms_report', {
          trigger: 'manual_api',
          actorUserId: req.auth.userId,
          tenantId,
        });
        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco_care.run_missing_forms',
          outcome: result?.ok ? 'success' : 'failed',
          targetType: 'scheduler_job',
          targetId: 'cco_daily_missing_forms_report',
          metadata: { result },
        });
        const statusCode = result?.ok ? 200 : 409;
        return res.status(statusCode).json({ ok: Boolean(result?.ok), result });
      } catch (error) {
        console.error('[ops/cco-care/run-missing-forms]', error);
        return res.status(500).json({ error: 'Kunde inte köra missing-forms-jobb.' });
      }
    }
  );

  async function runCareSchedulerJob(req, res, jobId, auditAction) {
    if (!scheduler || typeof scheduler.runJob !== 'function') {
      return res.status(503).json({ error: 'Scheduler är inte tillgänglig.' });
    }
    const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
    try {
      const result = await scheduler.runJob(jobId, {
        trigger: 'manual_api',
        actorUserId: req.auth.userId,
        tenantId,
      });
      await authStore.addAuditEvent({
        tenantId,
        actorUserId: req.auth.userId,
        action: auditAction,
        outcome: result?.ok ? 'success' : 'failed',
        targetType: 'scheduler_job',
        targetId: jobId,
        metadata: { result },
      });
      const statusCode = result?.ok ? 200 : 409;
      return res.status(statusCode).json({ ok: Boolean(result?.ok), result });
    } catch (error) {
      console.error(`[ops/${auditAction}]`, error);
      return res.status(500).json({ error: `Kunde inte köra ${jobId}.` });
    }
  }

  router.post(
    '/ops/cco-care/run-journal-drafts',
    requireAuth,
    requireRole(ROLE_OWNER),
    (req, res) =>
      runCareSchedulerJob(
        req,
        res,
        'cco_journal_draft_proposals',
        'ops.cco_care.run_journal_drafts'
      )
  );

  router.post('/ops/cco-care/run-reminders', requireAuth, requireRole(ROLE_OWNER), (req, res) =>
    runCareSchedulerJob(req, res, 'cco_customer_reminders', 'ops.cco_care.run_reminders')
  );

  router.post(
    '/ops/cco-care/run-journal-photos-backup',
    requireAuth,
    requireRole(ROLE_OWNER),
    (req, res) =>
      runCareSchedulerJob(
        req,
        res,
        'journal_photos_backup',
        'ops.cco_care.run_journal_photos_backup'
      )
  );

  router.patch(
    '/ops/cco-care/draft-proposals/:proposalId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const __reqStart = process.hrtime.bigint();
      const __ms = (from) => Number(process.hrtime.bigint() - from) / 1e6;
      const __timing = { reviewMs: 0, applyMs: 0, promoteMs: 0, auditMs: 0 };
      res.on('finish', () => {
        const totalMs = __ms(__reqStart);
        console.warn(
          `[draft-proposal-review-timing] total=${totalMs.toFixed(0)}ms ` +
            `review=${__timing.reviewMs.toFixed(0)}ms apply=${__timing.applyMs.toFixed(0)}ms ` +
            `promote=${__timing.promoteMs.toFixed(0)}ms audit=${__timing.auditMs.toFixed(0)}ms ` +
            `status=${res.statusCode}`
        );
      });
      if (!patientCareStateStore) {
        return res.status(503).json({ error: 'Patient care store saknas.' });
      }
      const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
      const proposalId = normalizeText(req.params?.proposalId);
      const status = normalizeText(req.body?.status).toLowerCase();
      if (!proposalId || !['approved', 'dismissed'].includes(status)) {
        return res.status(400).json({ error: 'proposalId och status (approved|dismissed) krävs.' });
      }
      const promoteRequested =
        normalizeText(req.query?.promote) === 'true' ||
        normalizeText(req.query?.promote) === '1' ||
        req.body?.promote === true;
      try {
        const __reviewStart = process.hrtime.bigint();
        const updated = await patientCareStateStore.reviewDraftProposal({
          tenantId,
          proposalId,
          status,
          reviewedBy: req.auth.userId,
          note: normalizeText(req.body?.note),
        });
        __timing.reviewMs = __ms(__reviewStart);
        if (!updated) {
          return res.status(404).json({ error: 'Utkast hittades inte.' });
        }
        const __applyStart = process.hrtime.bigint();
        let journalApply = null;
        if (status === 'approved' && journalStore && !promoteRequested) {
          journalApply = await applyApprovedDraftProposal({
            proposal: updated,
            journalStore,
            patientMasterStore,
            actor: {
              userId: req.auth.userId,
              displayName: req.auth.displayName || req.auth.userId,
              role: req.auth.role,
            },
          });
        }
        __timing.applyMs = __ms(__applyStart);
        const __promoteStart = process.hrtime.bigint();
        let journalPromote = null;
        if (status === 'approved' && promoteRequested && journalStore) {
          journalPromote = await promoteApprovedDraftToJournalEntry({
            proposalId,
            tenantId,
            ownerUserId: req.auth.userId,
            patientCareStateStore,
            journalStore,
            patientMasterStore,
            actor: {
              userId: req.auth.userId,
              displayName: req.auth.displayName || req.auth.userId,
              role: req.auth.role,
            },
          });
          if (journalPromote?.promoted) {
            await authStore.addAuditEvent({
              tenantId,
              actorUserId: req.auth.userId,
              action: 'journal_draft_promoted',
              outcome: 'success',
              targetType: 'journal_draft_proposal',
              targetId: proposalId,
              metadata: {
                patientId: journalPromote.patientId,
                journalEntryIds: journalPromote.journalEntryIds,
              },
            });
          }
        }
        __timing.promoteMs = __ms(__promoteStart);
        const __auditStart = process.hrtime.bigint();
        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco_care.review_draft_proposal',
          outcome: 'success',
          targetType: 'journal_draft_proposal',
          targetId: proposalId,
          metadata: { status, patientId: updated.patientId, journalApply, journalPromote },
        });
        __timing.auditMs = __ms(__auditStart);
        return res.json({
          ok: true,
          proposal: journalPromote?.proposal || updated,
          journalApply,
          journalPromote,
        });
      } catch (error) {
        console.error('[ops/cco-care/draft-proposals/review]', error);
        return res.status(500).json({ error: 'Kunde inte uppdatera journalutkast.' });
      }
    }
  );

  router.post(
    '/ops/cco-care/draft-proposals/:proposalId/promote',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!patientCareStateStore) {
        return res.status(503).json({ error: 'Patient care store saknas.' });
      }
      if (!journalStore) {
        return res.status(503).json({ error: 'Journalstore saknas — promotion kan inte ske.' });
      }
      const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
      const proposalId = normalizeText(req.params?.proposalId);
      if (!proposalId) {
        return res.status(400).json({ error: 'proposalId krävs.' });
      }
      try {
        const result = await promoteApprovedDraftToJournalEntry({
          proposalId,
          tenantId,
          ownerUserId: req.auth.userId,
          patientCareStateStore,
          journalStore,
          patientMasterStore,
          actor: {
            userId: req.auth.userId,
            displayName: req.auth.displayName || req.auth.userId,
            role: req.auth.role,
          },
        });
        if (!result.promoted) {
          if (result.reason === 'proposal_not_found') {
            return res.status(404).json({ error: 'Utkast hittades inte.', detail: result });
          }
          if (result.reason === 'already_promoted') {
            return res.status(409).json({
              error: 'Utkastet är redan promoverat till journalpost.',
              detail: result,
            });
          }
          if (result.reason === 'not_approved') {
            return res.status(409).json({
              error: 'Utkastet måste först sättas till status=approved.',
              detail: result,
            });
          }
          return res.status(400).json({ error: 'Kunde inte promovera utkast.', detail: result });
        }
        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'journal_draft_promoted',
          outcome: 'success',
          targetType: 'journal_draft_proposal',
          targetId: proposalId,
          metadata: {
            patientId: result.patientId,
            journalEntryIds: result.journalEntryIds,
          },
        });
        return res.json({ ok: true, ...result });
      } catch (error) {
        console.error('[ops/cco-care/draft-proposals/promote]', error);
        return res.status(500).json({ error: 'Kunde inte promovera utkast till journalpost.' });
      }
    }
  );

  router.post(
    '/ops/cco-care/patient-outreach',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!patientMasterStore) {
        return res.status(503).json({ error: 'Patientmaster saknas.' });
      }
      const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
      const patientId = normalizeText(req.body?.patientId);
      const outreachType = normalizeText(req.body?.outreachType).toLowerCase() || 'custom';
      if (!patientId) {
        return res.status(400).json({ error: 'patientId krävs.' });
      }
      if (!OUTREACH_TYPES.includes(outreachType)) {
        return res.status(400).json({ error: 'Ogiltig outreachType.', allowed: OUTREACH_TYPES });
      }
      try {
        const patient = await patientMasterStore.getPatient({ tenantId, patientId });
        if (!patient) {
          return res.status(404).json({ error: 'Patient hittades inte.' });
        }
        const origin = normalizeText(req.body?.origin) || `${req.protocol}://${req.get('host')}`;
        const result = await sendPatientOutreach({
          patient,
          outreachType,
          linkUrl: normalizeText(req.body?.linkUrl),
          note: normalizeText(req.body?.note),
          toEmail: normalizeText(req.body?.toEmail),
          fromEmail: resolveResendFrom() || 'booking@hairtpclinic.com',
          graphSendConnector,
          origin,
        });
        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco_care.patient_outreach',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: patientId,
          metadata: {
            outreachType,
            to: result.to,
            provider: result.delivery?.provider || 'none',
          },
        });
        return res.json({ ok: true, outreach: result });
      } catch (error) {
        console.error('[ops/cco-care/patient-outreach]', error);
        const statusCode = Number(error?.statusCode || 500);
        return res.status(statusCode).json({
          error: error?.message || 'Kunde inte skicka till patient.',
        });
      }
    }
  );

  router.get('/ops/scheduler/status', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    if (!scheduler || typeof scheduler.getStatus !== 'function') {
      return res.status(503).json({ error: 'Scheduler är inte tillgänglig.' });
    }
    try {
      const status = scheduler.getStatus();

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'ops.scheduler.status.read',
        outcome: 'success',
        targetType: 'ops',
        targetId: 'scheduler_status',
        metadata: {
          enabled: Boolean(status?.enabled),
          started: Boolean(status?.started),
          jobs: Array.isArray(status?.jobs) ? status.jobs.length : 0,
        },
      });

      return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        scheduler: status,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa scheduler-status.' });
    }
  });

  router.get(
    '/ops/cco/enrichment/coverage',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      const mailboxIds = resolveCcoHistoryMailboxIds(config);
      if (!ccoMailboxTruthStore) {
        return res.status(503).json({ error: 'ccoMailboxTruthStore saknas.' });
      }
      if (!capabilityAnalysisStore) {
        return res.status(503).json({ error: 'capabilityAnalysisStore saknas.' });
      }
      try {
        if (
          ccoMailboxTruthStore &&
          typeof ccoMailboxTruthStore.ensureMailboxLoaded === 'function'
        ) {
          for (const mailboxId of mailboxIds) {
            try {
              await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
            } catch {
              /* optional preload */
            }
          }
        }
        const coverage = await computeCcoInboxEnrichmentCoverage({
          tenantId,
          mailboxIds,
          capabilityAnalysisStore,
          ccoMailboxTruthStore,
          ccoCustomerStore,
          stateRoot: config.stateRoot,
        });
        const exclusions = await loadDenominatorExclusions({
          stateRoot: config.stateRoot,
          tenantId,
        });
        const adjustedCoverage =
          exclusions.conversationKeys?.size > 0
            ? applyDenominatorExclusionsToCoverage(coverage, exclusions.conversationKeys)
            : coverage;
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco.enrichment.coverage.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'cco_enrichment_coverage',
          metadata: {
            gapCount: adjustedCoverage.gapCount,
            coveragePercent: adjustedCoverage.coveragePercent,
            readyForWork: adjustedCoverage.readyForWork,
            denominatorExcluded:
              adjustedCoverage.denominatorExclusions?.excludedConversationCount || 0,
          },
        });
        return res.json({
          ok: true,
          ...summarizeEnrichmentCoverage(adjustedCoverage),
        });
      } catch (error) {
        console.error('[ops/cco/enrichment/coverage]', error);
        return res.status(500).json({
          error: error?.message || 'Kunde inte beräkna enrichment coverage.',
        });
      }
    }
  );

  router.post(
    '/ops/cco/enrichment/gap-recovery/phase2/denominator-exclusions',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
      const go = req.body?.go === true;
      const dryRun = req.body?.dryRun !== false && !go;
      const mailboxIds = resolveCcoHistoryMailboxIds(config);
      if (!ccoMailboxTruthStore || !capabilityAnalysisStore) {
        return res.status(503).json({ error: 'stores saknas för phase2.' });
      }
      try {
        for (const mailboxId of mailboxIds) {
          try {
            await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
          } catch {
            /* optional */
          }
        }
        const analysis = await analyzeCcoInboxEnrichmentGaps({
          tenantId,
          mailboxIds,
          capabilityAnalysisStore,
          ccoMailboxTruthStore,
          ccoCustomerStore,
          ccoMailIngestionStore,
          supportedMailboxIds: mailboxIds,
          stateRoot: config.stateRoot,
          detailLimit: 10000,
          snapshotProbeLimit: 0,
        });
        const built = buildDenominatorExclusionsFromGapDetails(analysis.details || []);
        let saved = null;
        if (!dryRun && go) {
          saved = await saveDenominatorExclusions({
            stateRoot: config.stateRoot,
            tenantId,
            conversationKeys: built.conversationKeys,
            summary: {
              source: 'gap_recovery_phase2',
              bucketCounts: built.bucketCounts,
              totalExcluded: built.totalExcluded,
            },
          });
        }
        const coverage = await computeCcoInboxEnrichmentCoverage({
          tenantId,
          mailboxIds,
          capabilityAnalysisStore,
          ccoMailboxTruthStore,
          ccoCustomerStore,
          stateRoot: config.stateRoot,
        });
        const adjusted = applyDenominatorExclusionsToCoverage(
          coverage,
          new Set(built.conversationKeys.map((item) => item.toLowerCase()))
        );
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco.enrichment.gap_recovery.phase2.denominator_exclusions',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'cco_gap_recovery_phase2',
          metadata: {
            dryRun,
            totalExcluded: built.totalExcluded,
            adjustedCoveragePercent: adjusted.coveragePercent,
            adjustedReadyForWork: adjusted.readyForWork,
          },
        });
        return res.json({
          ok: true,
          dryRun,
          totalExcluded: built.totalExcluded,
          bucketCounts: built.bucketCounts,
          saved,
          coverage: summarizeEnrichmentCoverage(adjusted),
        });
      } catch (error) {
        console.error('[ops/cco/enrichment/gap-recovery/phase2/denominator-exclusions]', error);
        return res.status(500).json({
          error: error?.message || 'Kunde inte applicera denominator-exkluderingar.',
        });
      }
    }
  );

  router.get(
    '/ops/cco/enrichment/gap-recovery/phase2/repair-plan',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      const includeRepairableLimit = Math.max(
        0,
        Math.min(2000, Number.parseInt(String(req.query?.includeRepairableLimit ?? '0'), 10) || 0)
      );
      const mailboxIds = resolveCcoHistoryMailboxIds(config);
      if (!ccoMailboxTruthStore || !capabilityAnalysisStore) {
        return res.status(503).json({ error: 'stores saknas för phase2 repair-plan.' });
      }
      try {
        for (const mailboxId of mailboxIds) {
          try {
            await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
          } catch {
            /* optional */
          }
        }
        const analysis = await analyzeCcoInboxEnrichmentGaps({
          tenantId,
          mailboxIds,
          capabilityAnalysisStore,
          ccoMailboxTruthStore,
          ccoCustomerStore,
          ccoMailIngestionStore,
          supportedMailboxIds: mailboxIds,
          stateRoot: config.stateRoot,
          detailLimit: 10000,
          snapshotProbeLimit: 0,
        });
        const missingRows = (analysis.details || []).filter(
          (row) => row.primaryBucket === 'missing_graphMessageId'
        );
        const plan = buildGraphMessageIdRepairPlan({
          gapDetails: missingRows,
          ingestionStore: ccoMailIngestionStore,
          truthStore: ccoMailboxTruthStore,
        });
        const repairableRows = plan.rows.filter(
          (row) => row.repairStatus === 'repairable_single_match'
        );
        return res.json({
          ok: true,
          dryRun: true,
          tenantId,
          denominatorExcludedTarget: 592,
          missingGraphMessageIdAnalyzed: plan.analyzedCount,
          statusCounts: plan.statusCounts,
          repairableCount: plan.repairableCount,
          ambiguousCount: plan.ambiguousCount,
          noCandidateCount: plan.noCandidateCount,
          mailboxCounts: plan.mailboxCounts,
          sampleRepairable: repairableRows.slice(0, 10),
          repairableConversationKeys:
            includeRepairableLimit > 0
              ? repairableRows.slice(0, includeRepairableLimit).map((row) => row.conversationKey)
              : undefined,
        });
      } catch (error) {
        console.error('[ops/cco/enrichment/gap-recovery/phase2/repair-plan]', error);
        return res.status(500).json({
          error: error?.message || 'Kunde inte bygga repair-plan.',
        });
      }
    }
  );

  router.post(
    '/ops/cco/enrichment/gap-recovery/phase2/repair/canary',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
      const go = req.body?.go === true;
      const dryRun = req.body?.dryRun !== false && !go;
      const canaryLimit = Math.max(
        1,
        Math.min(500, Number.parseInt(String(req.body?.canaryLimit ?? '100'), 10) || 100)
      );
      const mailboxIds = resolveCcoHistoryMailboxIds(config);
      if (!ccoMailboxTruthStore || !capabilityAnalysisStore) {
        return res.status(503).json({ error: 'stores saknas för phase2 canary repair.' });
      }
      try {
        if (!dryRun && go) {
          const label = `pre-gap-recovery-phase2-repair-${new Date().toISOString().slice(0, 10)}`;
          const dir = path.join(config.backupDir || path.join(config.stateRoot, 'backups'), label);
          await fs.mkdir(dir, { recursive: true });
          await fs.copyFile(
            config.capabilityAnalysisStorePath,
            path.join(dir, path.basename(config.capabilityAnalysisStorePath))
          );
          try {
            await fs.copyFile(
              resolveCheckpointPath(config.stateRoot, tenantId),
              path.join(dir, path.basename(resolveCheckpointPath(config.stateRoot, tenantId)))
            );
          } catch {
            /* optional */
          }
        }
        for (const mailboxId of mailboxIds) {
          try {
            await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
          } catch {
            /* optional */
          }
        }
        const analysis = await analyzeCcoInboxEnrichmentGaps({
          tenantId,
          mailboxIds,
          capabilityAnalysisStore,
          ccoMailboxTruthStore,
          ccoCustomerStore,
          ccoMailIngestionStore,
          supportedMailboxIds: mailboxIds,
          stateRoot: config.stateRoot,
          detailLimit: 10000,
          snapshotProbeLimit: 0,
        });
        const missingRows = (analysis.details || []).filter(
          (row) => row.primaryBucket === 'missing_graphMessageId'
        );
        const repairRunId = crypto.randomUUID();
        if (!dryRun && go) {
          await reconcileRepairRegistryFromGapDetails({
            stateRoot: config.stateRoot,
            tenantId,
            runId: repairRunId,
            gapDetails: missingRows,
            truthStore: ccoMailboxTruthStore,
            mailboxIds,
          });
        }
        const repairRegistry = await loadRepairRegistry({
          stateRoot: config.stateRoot,
          tenantId,
        });
        const plan = buildGraphMessageIdRepairPlan({
          gapDetails: missingRows,
          ingestionStore: ccoMailIngestionStore,
          truthStore: ccoMailboxTruthStore,
        });
        const canary = await applyGraphMessageIdRepairCanary({
          truthStore: ccoMailboxTruthStore,
          ingestionStore: ccoMailIngestionStore,
          repairRows: plan.rows,
          canaryLimit,
          dryRun,
          actorUserId: req.auth.userId,
          runId: repairRunId,
          stateRoot: config.stateRoot,
          tenantId,
          repairRegistry,
        });
        if (!dryRun && go && Object.keys(canary.aliases || {}).length > 0) {
          await saveConversationAliases({
            stateRoot: config.stateRoot,
            tenantId,
            aliases: canary.aliases,
            metadata: { phase: 'canary_repair', canaryLimit },
          });
        }
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco.enrichment.gap_recovery.phase2.repair_canary',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'cco_gap_recovery_phase2',
          metadata: {
            dryRun,
            canaryLimit,
            processedCount: canary.processedCount,
            messagesUpserted: canary.messagesUpserted,
            aliasesWritten: canary.aliasesWritten,
            skippedAlreadyRepaired: canary.skippedAlreadyRepaired,
            repairRunId,
            registryCount: canary.registrySave?.count || null,
          },
        });
        return res.json({
          ok: true,
          dryRun,
          canaryLimit,
          repairRunId,
          repairableInPlan: plan.repairableCount,
          skippedAlreadyRepaired: canary.skippedAlreadyRepaired,
          registrySave: canary.registrySave,
          repairedConversationKeys: canary.results
            .filter((row) => row.outcome === 'upserted_truth_message')
            .map((row) => row.conversationKey)
            .filter(Boolean),
          ...canary,
          results: canary.results.slice(0, 25),
        });
      } catch (error) {
        console.error('[ops/cco/enrichment/gap-recovery/phase2/repair/canary]', error);
        return res.status(500).json({
          error: error?.message || 'Kunde inte köra canary repair.',
        });
      }
    }
  );

  router.post(
    '/ops/cco/enrichment/gap-recovery/phase2/targeted-enrich',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
      const go = req.body?.go === true;
      const conversationKeys = (
        Array.isArray(req.body?.conversationKeys) ? req.body.conversationKeys : []
      )
        .map((item) => normalizeText(item))
        .filter(Boolean);
      if (!go) {
        return res.status(400).json({ error: 'targeted-enrich kräver go=true.' });
      }
      if (!conversationKeys.length) {
        return res.status(400).json({ error: 'conversationKeys saknas.' });
      }
      if (!scheduler || typeof scheduler.runJob !== 'function') {
        return res.status(503).json({ error: 'scheduler saknas.' });
      }
      try {
        const result = await scheduler.runJob('cco_inbox_enrichment_full_backfill', {
          trigger: 'manual_api_phase2_targeted',
          actorUserId: req.auth.userId,
          tenantId,
          phase: 'full',
          targetConversationIds: conversationKeys,
        });
        const mailboxIds = resolveCcoHistoryMailboxIds(config);
        let coverage = null;
        if (ccoMailboxTruthStore && capabilityAnalysisStore) {
          coverage = await computeCcoInboxEnrichmentCoverage({
            tenantId,
            mailboxIds,
            capabilityAnalysisStore,
            ccoMailboxTruthStore,
            ccoCustomerStore,
            stateRoot: config.stateRoot,
          });
          const exclusions = await loadDenominatorExclusions({
            stateRoot: config.stateRoot,
            tenantId,
          });
          if (exclusions.conversationKeys?.size > 0) {
            coverage = applyDenominatorExclusionsToCoverage(coverage, exclusions.conversationKeys);
          }
        }
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco.enrichment.gap_recovery.phase2.targeted_enrich',
          outcome: result?.ok === true ? 'success' : 'error',
          targetType: 'ops',
          targetId: 'cco_gap_recovery_phase2',
          metadata: {
            targetedCount: conversationKeys.length,
            coveragePercent: coverage?.coveragePercent ?? null,
            readyForWork: coverage?.readyForWork ?? null,
          },
        });
        return res.json({
          ok: result?.ok === true,
          targetedCount: conversationKeys.length,
          result: summarizeEnrichmentBackfillResult(result),
          coverage: summarizeEnrichmentCoverage(coverage),
        });
      } catch (error) {
        console.error('[ops/cco/enrichment/gap-recovery/phase2/targeted-enrich]', error);
        return res.status(500).json({
          error: error?.message || 'Kunde inte köra targeted enrichment.',
        });
      }
    }
  );

  router.get(
    '/ops/cco/enrichment/gap-recovery/parser-empty/plan',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      const mailboxIds = resolveCcoHistoryMailboxIds(config);
      const canaryOnly = parseBoolean(req.query?.canaryOnly, false);
      const limit = Math.max(
        0,
        Math.min(500, Number.parseInt(String(req.query?.limit ?? '0'), 10) || 0)
      );
      if (!ccoMailboxTruthStore || !capabilityAnalysisStore) {
        return res.status(503).json({ error: 'stores saknas för parser-empty plan.' });
      }
      try {
        for (const mailboxId of mailboxIds) {
          try {
            await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
          } catch {
            /* optional */
          }
        }
        let conversationStateStore = null;
        if (config.ccoConversationStateStorePath) {
          conversationStateStore = await createCcoConversationStateStore({
            filePath: config.ccoConversationStateStorePath,
          });
        }
        const plan = await buildParserEmptyFallbackPlan({
          tenantId,
          mailboxIds,
          capabilityAnalysisStore,
          ccoMailboxTruthStore,
          ccoCustomerStore,
          ccoMailIngestionStore,
          conversationStateStore,
          stateRoot: config.stateRoot,
          limit: limit > 0 ? limit : null,
          canaryOnly,
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco.enrichment.gap_recovery.parser_empty.plan',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'cco_parser_empty_fallback',
          metadata: {
            parserEmptyTotal: plan.parserEmptyTotal,
            policyCounts: plan.policyCounts,
            canarySafeCount: plan.canarySafeCount,
          },
        });
        return res.json({ ok: true, ...plan, allRows: undefined });
      } catch (error) {
        console.error('[ops/cco/enrichment/gap-recovery/parser-empty/plan]', error);
        return res.status(500).json({
          error: error?.message || 'Kunde inte bygga parser-empty plan.',
        });
      }
    }
  );

  router.post(
    '/ops/cco/enrichment/gap-recovery/parser-empty/apply',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
      const go = req.body?.go === true;
      const dryRun = req.body?.dryRun !== false && !go;
      const canaryOnly = parseBoolean(req.body?.canaryOnly, false);
      const canaryLimit = Math.max(
        1,
        Math.min(500, Number.parseInt(String(req.body?.canaryLimit ?? '25'), 10) || 25)
      );
      const mailboxIds = resolveCcoHistoryMailboxIds(config);
      if (!ccoMailboxTruthStore || !capabilityAnalysisStore) {
        return res.status(503).json({ error: 'stores saknas för parser-empty apply.' });
      }
      try {
        if (!dryRun && go) {
          const label = `pre-parser-empty-fallback-${new Date().toISOString().slice(0, 10)}`;
          const dir = path.join(config.backupDir || path.join(config.stateRoot, 'backups'), label);
          await fs.mkdir(dir, { recursive: true });
          try {
            await fs.copyFile(
              config.capabilityAnalysisStorePath,
              path.join(dir, path.basename(config.capabilityAnalysisStorePath))
            );
          } catch {
            /* optional */
          }
        }
        for (const mailboxId of mailboxIds) {
          try {
            await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
          } catch {
            /* optional */
          }
        }
        let conversationStateStore = null;
        if (config.ccoConversationStateStorePath) {
          conversationStateStore = await createCcoConversationStateStore({
            filePath: config.ccoConversationStateStorePath,
          });
        }
        const plan = await buildParserEmptyFallbackPlan({
          tenantId,
          mailboxIds,
          capabilityAnalysisStore,
          ccoMailboxTruthStore,
          ccoCustomerStore,
          ccoMailIngestionStore,
          conversationStateStore,
          stateRoot: config.stateRoot,
          limit: canaryLimit,
          canaryOnly,
        });
        const applyResult = await applyParserEmptyFallbackBatch({
          tenantId,
          mailboxIds,
          capabilityAnalysisStore,
          ccoMailboxTruthStore,
          ccoCustomerStore,
          ccoMailIngestionStore,
          conversationStateStore,
          stateRoot: config.stateRoot,
          planRows: plan.rows,
          actorUserId: req.auth.userId,
          dryRun,
        });
        clearWorklistConsumerResponseCache();
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco.enrichment.gap_recovery.parser_empty.apply',
          outcome: applyResult.ok ? 'success' : 'error',
          targetType: 'ops',
          targetId: 'cco_parser_empty_fallback',
          metadata: {
            dryRun,
            canaryLimit,
            canaryOnly,
            processedCount: applyResult.processedCount,
            fallbackEnrichedCount: applyResult.fallbackEnrichedCount,
            excludedCount: applyResult.excludedCount,
            unresolvedCount: applyResult.unresolvedCount,
            runId: applyResult.runId,
            coverageBefore: applyResult.coverageBefore?.adjustedCoveragePercent ?? null,
            coverageAfter: applyResult.coverageAfter?.adjustedCoveragePercent ?? null,
          },
        });
        return res.json({
          ok: true,
          dryRun,
          canaryLimit,
          canaryOnly,
          policyCounts: plan.policyCounts,
          parserEmptyTotal: plan.parserEmptyTotal,
          ...applyResult,
        });
      } catch (error) {
        console.error('[ops/cco/enrichment/gap-recovery/parser-empty/apply]', error);
        return res.status(500).json({
          error: error?.message || 'Kunde inte applicera parser-empty fallback.',
        });
      }
    }
  );

  function resolveAmbiguousReviewContext(tenantId) {
    const mailboxIds = resolveCcoHistoryMailboxIds(config);
    return {
      tenantId,
      mailboxIds,
      capabilityAnalysisStore,
      ccoMailboxTruthStore,
      ccoCustomerStore,
      ccoMailIngestionStore,
      stateRoot: config.stateRoot,
    };
  }

  async function ensureAmbiguousReviewMailboxesLoaded() {
    const mailboxIds = resolveCcoHistoryMailboxIds(config);
    for (const mailboxId of mailboxIds) {
      try {
        await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
      } catch {
        /* optional */
      }
    }
    return mailboxIds;
  }

  router.get(
    '/ops/cco/enrichment/gap-recovery/ambiguous-review/summary',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      if (!ccoMailboxTruthStore || !capabilityAnalysisStore) {
        return res.status(503).json({ error: 'stores saknas för ambiguous-review.' });
      }
      try {
        await ensureAmbiguousReviewMailboxesLoaded();
        const summary = await loadAmbiguousReviewSummary(resolveAmbiguousReviewContext(tenantId));
        return res.json({
          ok: true,
          phase: 'ambiguous_review_read',
          ...summary,
          rules: {
            noAutoRepair: true,
            noFuzzyMerge: true,
            noCustomerMerge: true,
            noBlindEnrichment: true,
            minApproveMatchFields: MIN_APPROVE_MATCH_FIELDS,
            deterministicMatchFields: DETERMINISTIC_MATCH_FIELDS,
          },
        });
      } catch (error) {
        console.error('[ops/cco/enrichment/gap-recovery/ambiguous-review/summary]', error);
        return res.status(error?.statusCode || 500).json({
          error: error?.message || 'Kunde inte ladda ambiguous-review summary.',
        });
      }
    }
  );

  router.get(
    '/ops/cco/enrichment/gap-recovery/ambiguous-review/queue',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      if (!ccoMailboxTruthStore || !capabilityAnalysisStore) {
        return res.status(503).json({ error: 'stores saknas för ambiguous-review.' });
      }
      try {
        await ensureAmbiguousReviewMailboxesLoaded();
        const queue = await listAmbiguousReviewQueue(resolveAmbiguousReviewContext(tenantId), {
          mailboxId: normalizeText(req.query?.mailboxId),
          status: normalizeText(req.query?.status) || 'pending',
          limit: Number.parseInt(String(req.query?.limit ?? '50'), 10),
          offset: Number.parseInt(String(req.query?.offset ?? '0'), 10),
        });
        return res.json({ ok: true, ...queue });
      } catch (error) {
        console.error('[ops/cco/enrichment/gap-recovery/ambiguous-review/queue]', error);
        return res.status(error?.statusCode || 500).json({
          error: error?.message || 'Kunde inte ladda ambiguous-review queue.',
        });
      }
    }
  );

  router.get(
    '/ops/cco/enrichment/gap-recovery/ambiguous-review/item',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      const conversationKey = normalizeText(req.query?.conversationKey);
      if (!conversationKey) {
        return res.status(400).json({ error: 'conversationKey saknas.' });
      }
      if (!ccoMailboxTruthStore || !capabilityAnalysisStore) {
        return res.status(503).json({ error: 'stores saknas för ambiguous-review.' });
      }
      try {
        await ensureAmbiguousReviewMailboxesLoaded();
        const { item } = await getAmbiguousReviewItem(
          resolveAmbiguousReviewContext(tenantId),
          conversationKey
        );
        return res.json({ ok: true, item });
      } catch (error) {
        console.error('[ops/cco/enrichment/gap-recovery/ambiguous-review/item]', error);
        return res.status(error?.statusCode || 500).json({
          error: error?.message || 'Kunde inte ladda ambiguous-review item.',
        });
      }
    }
  );

  router.post(
    '/ops/cco/enrichment/gap-recovery/ambiguous-review/decide',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
      const go = req.body?.go === true;
      const action = normalizeText(req.body?.action);
      const conversationKey = normalizeText(req.body?.conversationKey);
      const candidateId = normalizeText(req.body?.candidateId);
      const reason = normalizeText(req.body?.reason);
      const reviewer = normalizeText(req.body?.reviewer || req.auth.userId);
      const ownerAccepted = req.body?.ownerAccepted === true;

      if (!go) {
        return res.status(400).json({ error: 'decide kräver go=true.' });
      }
      if (!conversationKey) {
        return res.status(400).json({ error: 'conversationKey saknas.' });
      }
      if (!ccoMailboxTruthStore || !capabilityAnalysisStore) {
        return res.status(503).json({ error: 'stores saknas för ambiguous-review decide.' });
      }

      try {
        const canaryOps =
          config.enableCcoOperatorCanary && config.enableMailReviewCanary
            ? require('../ops/ccoOperatorCanary')
            : null;
        if (canaryOps) {
          canaryOps.assertCanaryAllows('mail', {
            projectRoot: path.join(__dirname, '../..'),
            maxDecisions: config.mailReviewCanaryMax,
            enabled: true,
          });
        } else if (config.enableCcoOperatorCanary && !config.enableMailReviewCanary) {
          return res.status(403).json({
            error: 'mail_review_canary_write_disabled',
            hint: 'Sätt ENABLE_MAIL_REVIEW_CANARY=true tillsammans med ENABLE_CCO_OPERATOR_CANARY',
          });
        }
        await ensureAmbiguousReviewMailboxesLoaded();
        const result = await decideAmbiguousReviewItem(resolveAmbiguousReviewContext(tenantId), {
          conversationKey,
          action,
          candidateId,
          reason,
          reviewer,
          actorUserId: req.auth.userId,
          ownerAccepted,
          go,
          scheduler,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco.enrichment.gap_recovery.ambiguous_review.decide',
          outcome: result.ok ? 'success' : 'error',
          targetType: 'ops',
          targetId: conversationKey,
          metadata: {
            reviewAction: action,
            candidateId: candidateId || null,
            matchedFields: result.decision?.matchedFields || [],
            repairOutcome: result.repairResult?.outcome || null,
            enrichTriggered: Boolean(result.enrichResult?.ok),
            adjustedCoveragePercent: result.coverage?.adjustedCoveragePercent ?? null,
            readyForWork: result.coverage?.readyForWork ?? null,
            reason: reason ? reason.slice(0, 120) : null,
          },
        });

        if (canaryOps) {
          const counter = { unresolved: 0, excluded: 0, rejected: 0, approved: 0 };
          if (action === 'approve_single_match') counter.approved = 1;
          else if (action === 'leave_unresolved') counter.unresolved = 1;
          else if (action === 'exclude_non_actionable') counter.excluded = 1;
          else if (action === 'reject_candidate') counter.rejected = 1;
          canaryOps.recordCanaryDecision('mail', counter, {
            projectRoot: path.join(__dirname, '../..'),
            maxDecisions: config.mailReviewCanaryMax,
          });
        }
        return res.json(result);
      } catch (error) {
        console.error('[ops/cco/enrichment/gap-recovery/ambiguous-review/decide]', error);
        await authStore
          .addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'ops.cco.enrichment.gap_recovery.ambiguous_review.decide',
            outcome: 'error',
            targetType: 'ops',
            targetId: conversationKey || 'unknown',
            metadata: {
              reviewAction: action,
              error: String(error?.message || error).slice(0, 200),
            },
          })
          .catch(() => {});
        return res.status(error?.statusCode || 500).json({
          error: error?.message || 'Kunde inte applicera ambiguous-review beslut.',
        });
      }
    }
  );

  router.get(
    '/ops/cco/enrichment/baseline/diagnose',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      const mailboxIds = resolveCcoHistoryMailboxIds(config);
      const targetEntryIdPrefix = normalizeText(req.query?.entryId) || '05dd08b4';
      if (!ccoMailboxTruthStore) {
        return res.status(503).json({ error: 'ccoMailboxTruthStore saknas.' });
      }
      try {
        const diagnosis = await diagnoseEnrichmentBaselineRecovery({
          tenantId,
          mailboxIds,
          stateRoot: config.stateRoot,
          backupDir: path.join(config.backupDir || path.join(config.stateRoot, 'backups')),
          capabilityAnalysisStorePath: config.capabilityAnalysisStorePath,
          capabilityAnalysisStore,
          ccoMailboxTruthStore,
          ccoCustomerStore,
          targetEntryIdPrefix,
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco.enrichment.baseline.diagnose',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'cco_enrichment_baseline_diagnose',
          metadata: {
            recommendation: diagnosis.recommendation?.action || null,
            memoryCoverage: diagnosis.memory?.coveragePercent ?? null,
          },
        });
        return res.json({ ok: true, ...diagnosis });
      } catch (error) {
        console.error('[ops/cco/enrichment/baseline/diagnose]', error);
        return res.status(500).json({
          error: error?.message || 'Kunde inte diagnostisera enrichment-baseline.',
        });
      }
    }
  );

  router.get(
    '/ops/cco/enrichment/gap-analysis',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      const mailboxIds = resolveCcoHistoryMailboxIds(config);
      const detailLimit = Math.max(
        1,
        Math.min(10000, Number.parseInt(String(req.query?.detailLimit ?? '2105'), 10) || 2105)
      );
      const snapshotProbeLimit = Math.max(
        0,
        Math.min(50, Number.parseInt(String(req.query?.snapshotProbeLimit ?? '25'), 10) || 25)
      );
      if (!ccoMailboxTruthStore) {
        return res.status(503).json({ error: 'ccoMailboxTruthStore saknas.' });
      }
      if (!capabilityAnalysisStore) {
        return res.status(503).json({ error: 'capabilityAnalysisStore saknas.' });
      }
      try {
        if (
          ccoMailboxTruthStore &&
          typeof ccoMailboxTruthStore.ensureMailboxLoaded === 'function'
        ) {
          for (const mailboxId of mailboxIds) {
            try {
              await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
            } catch {
              /* optional preload */
            }
          }
        }
        const analysis = await analyzeCcoInboxEnrichmentGaps({
          tenantId,
          mailboxIds,
          capabilityAnalysisStore,
          ccoMailboxTruthStore,
          ccoCustomerStore,
          ccoMailIngestionStore,
          supportedMailboxIds: mailboxIds,
          stateRoot: config.stateRoot,
          detailLimit,
          snapshotProbeLimit,
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.cco.enrichment.gap_analysis.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'cco_enrichment_gap_analysis',
          metadata: {
            totalGap: analysis.totalGap,
            canFallbackEnrichCount: analysis.canFallbackEnrichCount,
            shouldExcludeFromThresholdCount: analysis.shouldExcludeFromThresholdCount,
          },
        });
        return res.json({ ok: true, ...analysis });
      } catch (error) {
        console.error('[ops/cco/enrichment/gap-analysis]', error);
        return res.status(500).json({
          error: error?.message || 'Kunde inte analysera enrichment-gap.',
        });
      }
    }
  );

  router.get(
    '/ops/cco/enrichment/backfill/plan',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const tenantId = normalizeText(req.query?.tenantId) || req.auth.tenantId;
      const mailboxIds = resolveCcoHistoryMailboxIds(config);
      const canaryLimit = Math.max(
        1,
        Math.min(9338, Number.parseInt(String(req.query?.canaryLimit ?? '500'), 10) || 500)
      );
      if (!ccoMailboxTruthStore || !capabilityAnalysisStore) {
        return res.status(503).json({ error: 'Stores saknas.' });
      }
      try {
        for (const mailboxId of mailboxIds) {
          try {
            await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
          } catch {
            /* optional */
          }
        }
        const plan = await buildCcoInboxEnrichmentBackfillPlan({
          tenantId,
          mailboxIds,
          capabilityAnalysisStore,
          ccoMailboxTruthStore,
          ccoCustomerStore,
          stateRoot: config.stateRoot,
          canaryLimit,
        });
        return res.json({ ok: true, ...plan });
      } catch (error) {
        console.error('[ops/cco/enrichment/backfill/plan]', error);
        return res.status(500).json({ error: error?.message || 'Plan misslyckades.' });
      }
    }
  );

  router.post(
    '/ops/cco/enrichment/backfill/run',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const phase = normalizeText(body.phase) || 'run';
      const go = parseBoolean(body.go, false);
      const tenantId = normalizeText(body.tenantId) || req.auth.tenantId;

      if (!scheduler || typeof scheduler.runJob !== 'function') {
        return res.status(503).json({ error: 'Scheduler saknas.' });
      }

      try {
        if (phase === 'snapshot') {
          const label = `pre-enrichment-backfill-${new Date().toISOString().slice(0, 10)}`;
          const dir = path.join(config.backupDir || path.join(config.stateRoot, 'backups'), label);
          await fs.mkdir(dir, { recursive: true });
          const files = [
            config.ccoMailboxTruthStorePath,
            config.capabilityAnalysisStorePath,
            config.ccoConversationStateStorePath,
            path.join(config.stateRoot, 'cco-conversation-thread-states.json'),
            path.join(config.stateRoot, 'cco-audit.jsonl'),
          ];
          const copied = [];
          for (const filePath of files) {
            if (!filePath) continue;
            try {
              await fs.copyFile(filePath, path.join(dir, path.basename(filePath)));
              copied.push(path.basename(filePath));
            } catch {
              /* optional */
            }
          }
          try {
            await fs.cp(config.ccoMailboxTruthShardDir, path.join(dir, 'cco-mailbox-truth'), {
              recursive: true,
            });
            copied.push('cco-mailbox-truth/');
          } catch {
            /* optional */
          }
          try {
            const checkpointPath = resolveCheckpointPath(config.stateRoot, tenantId);
            await fs.copyFile(checkpointPath, path.join(dir, path.basename(checkpointPath)));
            copied.push(path.basename(checkpointPath));
          } catch {
            /* optional */
          }

          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'ops.cco.enrichment.backfill.snapshot',
            outcome: 'success',
            targetType: 'ops',
            targetId: 'cco_enrichment_backfill',
            metadata: { dir, copied },
          });

          return res.json({ ok: true, phase: 'snapshot', dir, copied });
        }

        if (phase === 'restore-capability' || phase === 'reload-capability') {
          if (!go) {
            return res.status(400).json({ error: `${phase} kräver go=true.` });
          }
          const label =
            normalizeText(body.label) ||
            `pre-enrichment-backfill-${new Date().toISOString().slice(0, 10)}`;
          const entryIdPrefix = normalizeText(body.entryId);
          const dir = path.join(config.backupDir || path.join(config.stateRoot, 'backups'), label);
          const sourcePath = path.join(dir, path.basename(config.capabilityAnalysisStorePath));
          const checkpointBackupPath = path.join(
            dir,
            path.basename(resolveCheckpointPath(config.stateRoot, tenantId))
          );
          const checkpointTargetPath = resolveCheckpointPath(config.stateRoot, tenantId);
          const restored = {
            capabilityStore: false,
            checkpoint: false,
          };

          if (phase === 'restore-capability') {
            try {
              await fs.copyFile(sourcePath, config.capabilityAnalysisStorePath);
              restored.capabilityStore = true;
            } catch (error) {
              return res.status(404).json({
                error: `Kunde inte återställa capability store från ${sourcePath}.`,
                detail: error?.message || null,
              });
            }
            try {
              await fs.copyFile(checkpointBackupPath, checkpointTargetPath);
              restored.checkpoint = true;
            } catch {
              /* optional checkpoint in backup */
            }
          }

          let reloadResult = null;
          if (
            capabilityAnalysisStore &&
            typeof capabilityAnalysisStore.reloadFromDisk === 'function'
          ) {
            reloadResult = await capabilityAnalysisStore.reloadFromDisk();
          }

          let matchedEntry = null;
          if (entryIdPrefix && capabilityAnalysisStore) {
            const entries = await capabilityAnalysisStore.list({ tenantId, limit: 1000 });
            matchedEntry =
              entries.find((entry) => normalizeText(entry?.id) === entryIdPrefix) ||
              entries.find((entry) => normalizeText(entry?.id).startsWith(entryIdPrefix)) ||
              null;
          }

          clearWorklistConsumerResponseCache();
          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'ops.cco.enrichment.backfill.restore_capability',
            outcome: 'success',
            targetType: 'ops',
            targetId: 'cco_enrichment_backfill',
            metadata: {
              phase,
              label,
              dir,
              sourcePath,
              entryIdPrefix: entryIdPrefix || null,
              matchedEntryId: matchedEntry?.id || null,
              restored,
              reloadResult,
            },
          });
          return res.json({
            ok: true,
            phase,
            label,
            sourcePath,
            checkpointBackupPath,
            checkpointTargetPath,
            restored,
            reloadResult,
            entryIdPrefix: entryIdPrefix || null,
            matchedEntry: matchedEntry
              ? { id: matchedEntry.id, ts: matchedEntry.ts || null }
              : null,
          });
        }

        if (phase === 'run' || phase === 'canary' || phase === 'full') {
          if (!go) {
            return res.status(400).json({ error: `${phase} kräver go=true.` });
          }

          pruneEnrichmentBackfillJobs();
          const jobId = crypto.randomUUID();
          const canaryLimit = Math.max(
            0,
            Math.min(9338, Number.parseInt(String(body.canaryLimit ?? '500'), 10) || 500)
          );
          const runPhase = phase === 'canary' ? 'canary' : 'full';
          enrichmentBackfillJobs.set(jobId, {
            jobId,
            phase: runPhase,
            status: 'running',
            startedAtMs: Date.now(),
            startedAt: new Date().toISOString(),
            tenantId,
            canaryLimit: phase === 'canary' ? canaryLimit : null,
          });

          res.json({
            ok: true,
            phase: runPhase,
            jobId,
            status: 'running',
            canaryLimit: phase === 'canary' ? canaryLimit : null,
            pollUrl: `/api/v1/ops/cco/enrichment/backfill/status/${jobId}`,
          });

          (async () => {
            try {
              const result = await scheduler.runJob('cco_inbox_enrichment_full_backfill', {
                trigger: 'manual_api',
                actorUserId: req.auth.userId,
                tenantId,
                canaryLimit: phase === 'canary' ? canaryLimit : 0,
                phase: runPhase,
              });
              const mailboxIds = resolveCcoHistoryMailboxIds(config);
              let coverage = null;
              if (ccoMailboxTruthStore && capabilityAnalysisStore) {
                for (const mailboxId of mailboxIds) {
                  try {
                    await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
                  } catch {
                    /* optional */
                  }
                }
                coverage = await computeCcoInboxEnrichmentCoverage({
                  tenantId,
                  mailboxIds,
                  capabilityAnalysisStore,
                  ccoMailboxTruthStore,
                  ccoCustomerStore,
                  stateRoot: config.stateRoot,
                });
              }
              enrichmentBackfillJobs.set(jobId, {
                jobId,
                phase: 'run',
                status: result?.ok === true ? 'success' : 'error',
                startedAtMs: enrichmentBackfillJobs.get(jobId)?.startedAtMs || Date.now(),
                completedAt: new Date().toISOString(),
                tenantId,
                result: summarizeEnrichmentBackfillResult(result),
                coverage: summarizeEnrichmentCoverage(coverage),
              });
              await authStore.addAuditEvent({
                tenantId: req.auth.tenantId,
                actorUserId: req.auth.userId,
                action: 'ops.cco.enrichment.backfill.run',
                outcome: result?.ok === true ? 'success' : 'failure',
                targetType: 'ops',
                targetId: 'cco_enrichment_backfill',
                metadata: {
                  jobId,
                  coveragePercent: coverage?.coveragePercent ?? null,
                  gapCount: coverage?.gapCount ?? null,
                  readyForWork: coverage?.readyForWork ?? null,
                  skipped: result?.result?.skipped ?? null,
                  reason: result?.result?.reason ?? null,
                },
              });
            } catch (error) {
              enrichmentBackfillJobs.set(jobId, {
                jobId,
                phase: 'run',
                status: 'error',
                startedAtMs: enrichmentBackfillJobs.get(jobId)?.startedAtMs || Date.now(),
                completedAt: new Date().toISOString(),
                tenantId,
                error: error?.message || 'enrichment_backfill_failed',
              });
            }
          })();
          return undefined;
        }

        return res.status(400).json({
          error:
            'phase måste vara snapshot, restore-capability, reload-capability, run, canary eller full.',
        });
      } catch (error) {
        console.error('[ops/cco/enrichment/backfill/run]', error);
        return res.status(500).json({
          error: error?.message || 'Enrichment backfill misslyckades.',
        });
      }
    }
  );

  router.get(
    '/ops/cco/enrichment/backfill/status/:jobId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      pruneEnrichmentBackfillJobs();
      const jobId = normalizeText(req.params?.jobId);
      const job = jobId ? enrichmentBackfillJobs.get(jobId) : null;
      if (!job) {
        return res.status(404).json({ error: 'Jobb hittades inte.' });
      }
      return res.json({ ok: true, ...job });
    }
  );

  router.post('/ops/scheduler/run', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    if (!scheduler || typeof scheduler.runJob !== 'function') {
      return res.status(503).json({ error: 'Scheduler är inte tillgänglig.' });
    }

    const jobId = normalizeText(req.body?.jobId);
    const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
    if (!jobId) {
      return res.status(400).json({ error: 'jobId krävs.' });
    }

    try {
      const runSuite = jobId === 'required_suite';
      let payload = null;
      let success = false;
      let statusCode = 200;

      if (runSuite) {
        const suiteResults = [];
        for (const suiteJobId of REQUIRED_SCHEDULER_SUITE_JOB_IDS) {
          const suiteResult = await scheduler.runJob(suiteJobId, {
            trigger: 'manual_api_suite',
            actorUserId: req.auth.userId,
            tenantId,
          });
          suiteResults.push({
            requestedJobId: suiteJobId,
            ...suiteResult,
          });
        }
        const failed = suiteResults.filter((item) => item?.ok !== true);
        const succeeded = suiteResults.length - failed.length;
        success = failed.length === 0;
        statusCode = success ? 200 : 409;
        payload = {
          ok: success,
          jobId: 'required_suite',
          trigger: 'manual_api_suite',
          suite: {
            total: suiteResults.length,
            succeeded,
            failed: failed.length,
            results: suiteResults,
          },
        };
      } else {
        const result = await scheduler.runJob(jobId, {
          trigger: 'manual_api',
          actorUserId: req.auth.userId,
          tenantId,
        });
        success = result?.ok === true;
        const errorCode = String(result?.error || '');
        statusCode = success
          ? 200
          : errorCode === 'job_running' || errorCode === 'disabled_job'
            ? 409
            : 400;
        payload = {
          ok: success,
          ...result,
        };
      }

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'ops.scheduler.run',
        outcome: success ? 'success' : 'failure',
        targetType: 'scheduler_job',
        targetId: jobId,
        metadata: {
          requestedTenantId: tenantId,
          result: payload,
        },
      });

      return res.status(statusCode).json(payload);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte köra scheduler-jobb.' });
    }
  });

  router.get(
    '/ops/release/cycles',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!releaseGovernanceStore || typeof releaseGovernanceStore.listCycles !== 'function') {
        return res.status(503).json({ error: 'Release governance store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth.tenantId;
        const limit = parseLimit(req.query?.limit, 20);
        const list = await releaseGovernanceStore.listCycles({
          tenantId,
          limit,
        });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.release.cycles.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: tenantId,
          metadata: {
            count: Number(list?.count || 0),
            limit,
          },
        });

        return res.json({
          tenantId,
          limit,
          ...list,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa release-cykler.' });
      }
    }
  );

  router.post('/ops/release/cycles', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    if (!releaseGovernanceStore || typeof releaseGovernanceStore.startCycle !== 'function') {
      return res.status(503).json({ error: 'Release governance store är inte tillgänglig.' });
    }
    try {
      const tenantId = req.auth.tenantId;
      const targetEnvironment = normalizeText(req.body?.targetEnvironment || 'production');
      const rolloutStrategy = normalizeText(req.body?.rolloutStrategy || 'tenant_batch');
      const note = normalizeText(req.body?.note || '');
      const cycle = await releaseGovernanceStore.startCycle({
        tenantId,
        actorUserId: req.auth.userId,
        targetEnvironment,
        rolloutStrategy,
        note,
      });

      await authStore.addAuditEvent({
        tenantId,
        actorUserId: req.auth.userId,
        action: 'ops.release.cycle.start',
        outcome: 'success',
        targetType: 'release_cycle',
        targetId: cycle.id,
        metadata: {
          targetEnvironment: cycle.targetEnvironment,
          rolloutStrategy: cycle.rolloutStrategy,
        },
      });

      return res.status(201).json({
        ok: true,
        cycle,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte starta release-cykel.' });
    }
  });

  router.get(
    '/ops/release/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!releaseGovernanceStore || typeof releaseGovernanceStore.evaluateCycle !== 'function') {
        return res.status(503).json({ error: 'Release governance store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth.tenantId;
        const cycleId = normalizeText(req.query?.cycleId || '');
        const auditEvents = await authStore.listAuditEvents({
          tenantId,
          limit: 2000,
        });
        const observedNoGoWindow = parseNoGoWindowFromAuditEvents(
          auditEvents,
          Number(config?.releaseNoGoFreeDays || 14)
        );

        const payload = await releaseGovernanceStore.evaluateCycle({
          tenantId,
          cycleId,
          ...buildReleaseEvaluationOptions(config),
        });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.release.status.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: payload?.cycle?.id || tenantId,
          metadata: {
            cycleId: payload?.cycle?.id || null,
            releaseGatePassed: payload?.evaluation?.releaseGatePassed === true,
            blockers: Number(payload?.evaluation?.blockers?.length || 0),
            observedNoGoWindowDays: observedNoGoWindow.days,
            observedNoGoEvidenceCount: observedNoGoWindow.evidenceCount,
            observedNoGoClean: observedNoGoWindow.clean,
          },
        });

        return res.json({
          generatedAt: new Date().toISOString(),
          tenantId,
          thresholds: {
            noGoFreeDays: Number(config?.releaseNoGoFreeDays || 14),
            requirePentestEvidence: Boolean(config?.releaseRequirePentestEvidence),
            pentestMaxAgeDays: Number(config?.releasePentestMaxAgeDays || 120),
            postLaunchReviewWindowDays: Number(config?.releasePostLaunchReviewWindowDays || 30),
            postLaunchStabilizationDays: Number(config?.releasePostLaunchStabilizationDays || 14),
            enforcePostLaunchStabilization: Boolean(config?.releaseEnforcePostLaunchStabilization),
            requireDistinctSignoffUsers: Boolean(config?.releaseRequireDistinctSignoffUsers),
            realityAuditIntervalDays: Number(config?.releaseRealityAuditIntervalDays || 90),
            requireFinalLiveSignoff: Boolean(config?.releaseRequireFinalLiveSignoff),
          },
          observedNoGoWindow,
          ...payload,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa release-status.' });
      }
    }
  );

  router.post(
    '/ops/release/cycles/:cycleId/evidence',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (
        !releaseGovernanceStore ||
        typeof releaseGovernanceStore.recordGateEvidence !== 'function'
      ) {
        return res.status(503).json({ error: 'Release governance store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth.tenantId;
        const cycleId = normalizeText(req.params?.cycleId || '');
        if (!cycleId) {
          return res.status(400).json({ error: 'cycleId saknas.' });
        }

        const recentReadinessEvents = await authStore.listAuditEvents({
          tenantId,
          limit: 2500,
        });
        const noGoWindow = parseNoGoWindowFromAuditEvents(
          recentReadinessEvents,
          Number(config?.releaseNoGoFreeDays || 14)
        );
        const latestReadinessEvent = [...recentReadinessEvents]
          .reverse()
          .find((item) => normalizeText(item?.action) === 'monitor.readiness.read');
        const latestReadinessMeta =
          latestReadinessEvent?.metadata && typeof latestReadinessEvent.metadata === 'object'
            ? latestReadinessEvent.metadata
            : {};

        const readinessInput =
          req.body?.readiness && typeof req.body.readiness === 'object' ? req.body.readiness : {};
        const strictInput =
          req.body?.strict && typeof req.body.strict === 'object' ? req.body.strict : {};
        const requiredChecksInput =
          req.body?.requiredChecks && typeof req.body.requiredChecks === 'object'
            ? req.body.requiredChecks
            : {};

        const readiness = {
          score: Number(readinessInput.score ?? latestReadinessMeta.score ?? 0),
          band: normalizeText(readinessInput.band || latestReadinessMeta.band || ''),
          goAllowed: readinessInput.goAllowed === true || latestReadinessMeta.goAllowed === true,
          blockerChecksCount: Number(
            readinessInput.blockerChecksCount ?? latestReadinessMeta.blockingRequiredChecks ?? 0
          ),
          triggeredNoGoCount: Number(
            readinessInput.triggeredNoGoCount ?? latestReadinessMeta.triggeredNoGo ?? 0
          ),
          triggeredNoGoIds: Array.isArray(readinessInput.triggeredNoGoIds)
            ? readinessInput.triggeredNoGoIds
            : [],
        };
        const strictFailures = Array.isArray(strictInput.failures)
          ? strictInput.failures.map((item) => normalizeText(item)).filter(Boolean)
          : [];
        const strict = {
          passed: strictInput.passed === true || strictFailures.length === 0,
          failuresCount: Number(strictInput.failuresCount ?? strictFailures.length),
          failures: strictFailures,
        };
        const requiredChecks = {
          noP0P1Blockers:
            requiredChecksInput.noP0P1Blockers === true || req.body?.noP0P1Blockers === true,
          patientSafetyApproved:
            requiredChecksInput.patientSafetyApproved === true ||
            req.body?.patientSafetyApproved === true,
          restoreDrillsVerified:
            requiredChecksInput.restoreDrillsVerified === true ||
            req.body?.restoreDrillsVerified === true,
          governanceRunbooksReady:
            requiredChecksInput.governanceRunbooksReady === true ||
            req.body?.governanceRunbooksReady === true,
        };

        const cycle = await releaseGovernanceStore.recordGateEvidence({
          tenantId,
          cycleId,
          source: normalizeText(req.body?.source || 'manual'),
          readiness,
          strict,
          requiredChecks,
          noGoWindow:
            req.body?.noGoWindow && typeof req.body.noGoWindow === 'object'
              ? req.body.noGoWindow
              : noGoWindow,
          pentestEvidencePath: normalizeText(req.body?.pentestEvidencePath || ''),
          notes: normalizeText(req.body?.notes || ''),
        });

        const evaluationPayload = await releaseGovernanceStore.evaluateCycle({
          tenantId,
          cycleId,
          ...buildReleaseEvaluationOptions(config),
        });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.release.cycle.evidence.update',
          outcome: 'success',
          targetType: 'release_cycle',
          targetId: cycleId,
          metadata: {
            releaseGatePassed: evaluationPayload?.evaluation?.releaseGatePassed === true,
            blockers: Number(evaluationPayload?.evaluation?.blockers?.length || 0),
            noGoWindowDays: Number(cycle?.gateEvidence?.noGoWindow?.days || 0),
            noGoWindowEvidenceCount: Number(cycle?.gateEvidence?.noGoWindow?.evidenceCount || 0),
            pentestExists: cycle?.gateEvidence?.pentest?.exists === true,
          },
        });

        return res.json({
          ok: true,
          cycle,
          evaluation: evaluationPayload?.evaluation || null,
        });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message || '');
        return res
          .status(message.includes('hittades inte') ? 404 : 500)
          .json({ error: message || 'Kunde inte uppdatera release-evidens.' });
      }
    }
  );

  router.post(
    '/ops/release/cycles/:cycleId/signoff',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!releaseGovernanceStore || typeof releaseGovernanceStore.recordSignoff !== 'function') {
        return res.status(503).json({ error: 'Release governance store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth.tenantId;
        const cycleId = normalizeText(req.params?.cycleId || '');
        const signoffRole = normalizeText(req.body?.signoffRole || '').toLowerCase();
        if (!cycleId) return res.status(400).json({ error: 'cycleId saknas.' });
        if (!signoffRole) return res.status(400).json({ error: 'signoffRole saknas.' });
        if (signoffRole === 'owner' && normalizeText(req.auth.role).toUpperCase() !== 'OWNER') {
          return res.status(403).json({ error: 'owner sign-off kräver OWNER-roll.' });
        }

        const cycle = await releaseGovernanceStore.recordSignoff({
          tenantId,
          cycleId,
          signoffRole,
          actorUserId: req.auth.userId,
          actorMembershipRole: req.auth.role,
          note: normalizeText(req.body?.note || ''),
          requireDistinctUsers: Boolean(config?.releaseRequireDistinctSignoffUsers),
        });

        const evaluationPayload = await releaseGovernanceStore.evaluateCycle({
          tenantId,
          cycleId,
          ...buildReleaseEvaluationOptions(config),
        });

        if (
          cycle?.status === 'planning' &&
          evaluationPayload?.evaluation?.releaseGatePassed === true &&
          evaluationPayload?.evaluation?.signoffComplete === true
        ) {
          await releaseGovernanceStore.setCycleStatus({
            tenantId,
            cycleId,
            status: 'launch_ready',
          });
        }

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.release.cycle.signoff',
          outcome: 'success',
          targetType: 'release_cycle',
          targetId: cycleId,
          metadata: {
            signoffRole,
            releaseGatePassed: evaluationPayload?.evaluation?.releaseGatePassed === true,
            signoffComplete: evaluationPayload?.evaluation?.signoffComplete === true,
          },
        });

        const latest = await releaseGovernanceStore.evaluateCycle({
          tenantId,
          cycleId,
          ...buildReleaseEvaluationOptions(config),
        });

        return res.json({
          ok: true,
          cycle: latest?.cycle || cycle,
          evaluation: latest?.evaluation || evaluationPayload?.evaluation || null,
        });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message || '');
        const statusCode = message.includes('hittades inte')
          ? 404
          : message.includes('Sign-off kräver')
            ? 409
            : 500;
        return res
          .status(statusCode)
          .json({ error: message || 'Kunde inte spara release sign-off.' });
      }
    }
  );

  router.post(
    '/ops/release/cycles/:cycleId/launch',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!releaseGovernanceStore || typeof releaseGovernanceStore.recordLaunch !== 'function') {
        return res.status(503).json({ error: 'Release governance store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth.tenantId;
        const cycleId = normalizeText(req.params?.cycleId || '');
        if (!cycleId) return res.status(400).json({ error: 'cycleId saknas.' });

        const evaluationPayload = await releaseGovernanceStore.evaluateCycle({
          tenantId,
          cycleId,
          ...buildReleaseEvaluationOptions(config),
        });

        if (!evaluationPayload?.evaluation?.releaseGatePassed) {
          return res.status(409).json({
            error: 'Release gate är inte godkänd.',
            blockers: evaluationPayload?.evaluation?.blockers || [],
            evaluation: evaluationPayload?.evaluation || null,
          });
        }

        const cycle = await releaseGovernanceStore.recordLaunch({
          tenantId,
          cycleId,
          actorUserId: req.auth.userId,
          strategy: normalizeText(req.body?.strategy || 'tenant_batch'),
          batchLabel: normalizeText(req.body?.batchLabel || ''),
          rollbackPlan: normalizeText(req.body?.rollbackPlan || ''),
        });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.release.cycle.launch',
          outcome: 'success',
          targetType: 'release_cycle',
          targetId: cycleId,
          metadata: {
            strategy: cycle?.launch?.strategy || null,
            batchLabel: cycle?.launch?.batchLabel || null,
            rollbackPlan: cycle?.launch?.rollbackPlan || null,
          },
        });

        return res.status(201).json({
          ok: true,
          cycle,
        });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message || '');
        return res
          .status(message.includes('hittades inte') ? 404 : 500)
          .json({ error: message || 'Kunde inte markera launch.' });
      }
    }
  );

  router.post(
    '/ops/release/cycles/:cycleId/review',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (
        !releaseGovernanceStore ||
        typeof releaseGovernanceStore.addPostLaunchReview !== 'function'
      ) {
        return res.status(503).json({ error: 'Release governance store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth.tenantId;
        const cycleId = normalizeText(req.params?.cycleId || '');
        if (!cycleId) return res.status(400).json({ error: 'cycleId saknas.' });

        const reviewResult = await releaseGovernanceStore.addPostLaunchReview({
          tenantId,
          cycleId,
          reviewerUserId: req.auth.userId,
          status: parseReleaseStatus(req.body?.status, 'ok'),
          note: normalizeText(req.body?.note || ''),
          openIncidents: Number(req.body?.openIncidents || 0),
          breachedIncidents: Number(req.body?.breachedIncidents || 0),
          triggeredNoGoCount: Number(req.body?.triggeredNoGoCount || 0),
          ts: req.body?.ts || null,
        });

        const latest = await releaseGovernanceStore.evaluateCycle({
          tenantId,
          cycleId,
          ...buildReleaseEvaluationOptions(config),
        });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.release.cycle.review.add',
          outcome: 'success',
          targetType: 'release_cycle',
          targetId: cycleId,
          metadata: {
            status: reviewResult?.review?.status || null,
            openIncidents: Number(reviewResult?.review?.openIncidents || 0),
            breachedIncidents: Number(reviewResult?.review?.breachedIncidents || 0),
            triggeredNoGoCount: Number(reviewResult?.review?.triggeredNoGoCount || 0),
          },
        });

        return res.status(201).json({
          ok: true,
          review: reviewResult?.review || null,
          cycle: latest?.cycle || reviewResult?.cycle || null,
          evaluation: latest?.evaluation || null,
        });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message || '');
        return res
          .status(message.includes('hittades inte') ? 404 : 500)
          .json({ error: message || 'Kunde inte spara post-launch review.' });
      }
    }
  );

  router.post(
    '/ops/release/cycles/:cycleId/reality-audit',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (
        !releaseGovernanceStore ||
        typeof releaseGovernanceStore.recordRealityAudit !== 'function'
      ) {
        return res.status(503).json({ error: 'Release governance store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth.tenantId;
        const cycleId = normalizeText(req.params?.cycleId || '');
        if (!cycleId) return res.status(400).json({ error: 'cycleId saknas.' });

        const cycle = await releaseGovernanceStore.recordRealityAudit({
          tenantId,
          cycleId,
          actorUserId: req.auth.userId,
          changeGovernanceVersion: normalizeText(req.body?.changeGovernanceVersion || ''),
          note: normalizeText(req.body?.note || ''),
          intervalDays: Number(config?.releaseRealityAuditIntervalDays || 90),
        });

        const latest = await releaseGovernanceStore.evaluateCycle({
          tenantId,
          cycleId,
          ...buildReleaseEvaluationOptions(config),
        });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.release.cycle.reality_audit',
          outcome: 'success',
          targetType: 'release_cycle',
          targetId: cycleId,
          metadata: {
            lastRealityAuditAt: cycle?.governance?.lastRealityAuditAt || null,
            nextRealityAuditDueAt: cycle?.governance?.nextRealityAuditDueAt || null,
            changeGovernanceVersion: cycle?.governance?.changeGovernanceVersion || null,
          },
        });

        return res.json({
          ok: true,
          cycle,
          evaluation: latest?.evaluation || null,
        });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message || '');
        return res
          .status(message.includes('hittades inte') ? 404 : 500)
          .json({ error: message || 'Kunde inte registrera reality audit.' });
      }
    }
  );

  router.post(
    '/ops/release/cycles/:cycleId/final-live-signoff',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (
        !releaseGovernanceStore ||
        typeof releaseGovernanceStore.recordFinalLiveSignoff !== 'function'
      ) {
        return res.status(503).json({ error: 'Release governance store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth.tenantId;
        const cycleId = normalizeText(req.params?.cycleId || '');
        if (!cycleId) return res.status(400).json({ error: 'cycleId saknas.' });

        const evaluationBefore = await releaseGovernanceStore.evaluateCycle({
          tenantId,
          cycleId,
          ...buildReleaseEvaluationOptions(config),
          requireFinalLiveSignoff: false,
        });
        const releaseEval = evaluationBefore?.evaluation || null;
        if (!releaseEval) {
          return res.status(404).json({ error: 'Release cycle hittades inte.' });
        }
        if (releaseEval.releaseGatePassed !== true) {
          return res.status(409).json({
            error: 'Release gate är inte godkänd för final live sign-off.',
            blockers: releaseEval.blockers || [],
            evaluation: releaseEval,
          });
        }

        const stabilization = releaseEval.postLaunchStabilization || {};
        const requiredDays = Number(
          stabilization?.requiredDays || config?.releasePostLaunchStabilizationDays || 14
        );
        const actualReviews = Number(stabilization?.actualReviews || 0);
        const stabilizationReady =
          stabilization?.completed === true &&
          stabilization?.hasNoGoTrigger !== true &&
          actualReviews >= requiredDays;
        if (!stabilizationReady) {
          return res.status(409).json({
            error: 'Stabiliseringsfönster är inte komplett för final live sign-off.',
            stabilization,
            evaluation: releaseEval,
          });
        }

        const wasLocked = releaseEval?.finalLiveSignoff?.locked === true;
        const cycle = await releaseGovernanceStore.recordFinalLiveSignoff({
          tenantId,
          cycleId,
          actorUserId: req.auth.userId,
          note: normalizeText(req.body?.note || ''),
          force: parseBoolean(req.body?.force, false),
        });

        const latest = await releaseGovernanceStore.evaluateCycle({
          tenantId,
          cycleId,
          ...buildReleaseEvaluationOptions(config),
        });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.release.cycle.final_live_signoff',
          outcome: 'success',
          targetType: 'release_cycle',
          targetId: cycleId,
          metadata: {
            alreadyLocked: wasLocked,
            lockedAt: cycle?.governance?.finalLiveSignoffAt || null,
            lockedBy: cycle?.governance?.finalLiveSignoffBy || null,
          },
        });

        return res.json({
          ok: true,
          alreadyLocked: wasLocked,
          cycle: latest?.cycle || cycle,
          evaluation: latest?.evaluation || null,
        });
      } catch (error) {
        console.error(error);
        const message = normalizeText(error?.message || '');
        const statusCode = message.includes('hittades inte') ? 404 : 500;
        return res
          .status(statusCode)
          .json({ error: message || 'Kunde inte låsa final live sign-off.' });
      }
    }
  );

  router.get('/ops/secrets/status', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    if (!secretRotationStore || typeof secretRotationStore.getSecretsStatus !== 'function') {
      return res.status(503).json({ error: 'Secret rotation store är inte tillgänglig.' });
    }
    try {
      const maxAgeDays = parseDays(
        req.query?.maxAgeDays,
        parseDays(config?.secretRotationMaxAgeDays, 90)
      );
      const status = await secretRotationStore.getSecretsStatus({ maxAgeDays });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'ops.secrets.status.read',
        outcome: 'success',
        targetType: 'ops',
        targetId: 'secrets_status',
        metadata: {
          tracked: Number(status?.totals?.tracked || 0),
          required: Number(status?.totals?.required || 0),
          staleRequired: Number(status?.totals?.staleRequired || 0),
          pendingRotation: Number(status?.totals?.pendingRotation || 0),
          maxAgeDays,
        },
      });

      return res.json({
        ok: true,
        maxAgeDays,
        ...status,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa secret-rotation status.' });
    }
  });

  router.post(
    '/ops/readiness/remediate-output-gates',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (
        !templateStore ||
        typeof templateStore.listActiveVersionSnapshots !== 'function' ||
        typeof templateStore.getTemplate !== 'function' ||
        typeof templateStore.getTemplateVersion !== 'function' ||
        typeof templateStore.evaluateVersion !== 'function'
      ) {
        return res.status(503).json({ error: 'Template store saknas för readiness-remediation.' });
      }

      try {
        const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
        const dryRun = parseBoolean(req.body?.dryRun, true);
        const limit = parseLimit(req.body?.limit, 50);
        const detailsLimit = parseLimit(req.body?.detailsLimit, 3);

        const activeVersions = await templateStore.listActiveVersionSnapshots({ tenantId });
        const candidates = [];

        for (const snapshot of Array.isArray(activeVersions) ? activeVersions : []) {
          const analysis = analyzeOutputGate(snapshot);
          if (analysis.issues.length === 0) continue;
          candidates.push({
            templateId: normalizeText(snapshot?.templateId),
            templateName: normalizeText(snapshot?.templateName) || null,
            category: normalizeText(snapshot?.category) || null,
            versionId: normalizeText(snapshot?.versionId),
            versionNo: Number(snapshot?.versionNo || 0),
            activatedAt: normalizeText(snapshot?.activatedAt) || null,
            updatedAt: normalizeText(snapshot?.updatedAt) || null,
            ...analysis,
          });
        }

        const limitedCandidates = candidates.slice(0, limit);
        const fixableCandidates = limitedCandidates.filter((item) => item.fixableIssues.length > 0);
        const manualCandidates = limitedCandidates.filter(
          (item) => item.fixableIssues.length === 0
        );

        const fixed = [];
        const skipped = [];

        if (!dryRun) {
          const tenantRuntime = await getTenantTemplateRuntime(tenantConfigStore, tenantId);

          for (const candidate of limitedCandidates) {
            if (!candidate.templateId || !candidate.versionId) {
              skipped.push({
                templateId: candidate.templateId,
                versionId: candidate.versionId,
                reason: 'missing_template_or_version_id',
              });
              continue;
            }
            if (candidate.fixableIssues.length === 0) {
              skipped.push({
                templateId: candidate.templateId,
                versionId: candidate.versionId,
                reason: 'manual_owner_override_required',
                issues: candidate.issues,
              });
              continue;
            }

            const template = await templateStore.getTemplate(candidate.templateId);
            const version = await templateStore.getTemplateVersion(
              candidate.templateId,
              candidate.versionId
            );
            if (!template || !version) {
              skipped.push({
                templateId: candidate.templateId,
                versionId: candidate.versionId,
                reason: 'template_or_version_not_found',
              });
              continue;
            }

            const contentForEvaluation = applyChannelSignature({
              content: version.content,
              channel: template.channel,
              signaturesByChannel: tenantRuntime.templateSignaturesByChannel,
            });
            const variableValidation = validateTemplateVariables({
              category: template.category,
              content: contentForEvaluation,
              variables: version.variablesUsed,
              allowlistOverridesByCategory: tenantRuntime.templateVariableAllowlistByCategory,
              requiredOverridesByCategory: tenantRuntime.templateRequiredVariablesByCategory,
            });
            const inputEvaluation = evaluateTemplateRisk({
              scope: 'input',
              category: template.category,
              content: contentForEvaluation,
              tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
              riskThresholdVersion: tenantRuntime.riskThresholdVersion,
              variableValidation,
            });
            const outputEvaluation = evaluateTemplateRisk({
              scope: 'output',
              category: template.category,
              content: contentForEvaluation,
              tenantRiskModifier: tenantRuntime.riskSensitivityModifier,
              riskThresholdVersion: tenantRuntime.riskThresholdVersion,
              variableValidation,
              enforceStrictTemplateVariables: true,
            });

            const repaired = await templateStore.evaluateVersion({
              templateId: candidate.templateId,
              versionId: candidate.versionId,
              inputEvaluation,
              outputEvaluation,
              persistEvaluation: false,
              ownerDecisionOverride: candidate.ownerDecision || '',
            });
            const postAnalysis = analyzeOutputGate({ risk: repaired?.risk });

            fixed.push({
              templateId: candidate.templateId,
              versionId: candidate.versionId,
              versionNo: candidate.versionNo,
              beforeIssues: candidate.issues,
              afterIssues: postAnalysis.issues,
              beforeDecision: candidate.decision,
              afterDecision: postAnalysis.decision,
              beforeOwnerDecision: candidate.ownerDecision,
              afterOwnerDecision: postAnalysis.ownerDecision,
              unknownVariables: Number(variableValidation?.unknownVariables?.length || 0),
              missingRequiredVariables: Number(
                variableValidation?.missingRequiredVariables?.length || 0
              ),
            });
          }
        }

        const remainingFixableAfterApply = dryRun
          ? fixableCandidates.length
          : fixed.filter((item) =>
              (Array.isArray(item.afterIssues) ? item.afterIssues : []).some(
                (issue) => issue !== 'owner_override_missing'
              )
            ).length;
        const resolvedFixableCount = dryRun ? 0 : fixed.length - remainingFixableAfterApply;

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: dryRun
            ? 'ops.readiness.remediate_output_gates.preview'
            : 'ops.readiness.remediate_output_gates.run',
          outcome: 'success',
          targetType: 'ops',
          targetId: tenantId,
          metadata: {
            tenantId,
            dryRun,
            limit,
            scanned: activeVersions.length,
            candidates: candidates.length,
            fixableCandidates: fixableCandidates.length,
            manualCandidates: manualCandidates.length,
            fixedCount: fixed.length,
            resolvedFixableCount,
            remainingFixableAfterApply,
            skippedCount: skipped.length,
          },
        });

        return res.json({
          ok: true,
          tenantId,
          dryRun,
          limit,
          scanned: activeVersions.length,
          candidates: candidates.length,
          fixableCandidates: fixableCandidates.length,
          manualCandidates: manualCandidates.length,
          fixedCount: fixed.length,
          resolvedFixableCount,
          remainingFixableAfterApply,
          skippedCount: skipped.length,
          candidatesPreview: limitedCandidates.slice(0, detailsLimit),
          fixedPreview: fixed.slice(0, detailsLimit),
          skippedPreview: skipped.slice(0, detailsLimit),
          generatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(error);
        return res
          .status(500)
          .json({ error: 'Kunde inte köra readiness remediation för output gates.' });
      }
    }
  );

  router.post(
    '/ops/readiness/remediate-owner-mfa-memberships',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (
        !authStore ||
        typeof authStore.listTenantMembers !== 'function' ||
        typeof authStore.updateMembership !== 'function' ||
        typeof authStore.revokeSessionsByMembership !== 'function'
      ) {
        return res.status(503).json({ error: 'Auth store saknas för OWNER MFA remediation.' });
      }

      try {
        const tenantId = normalizeText(req.body?.tenantId) || req.auth.tenantId;
        if (tenantId !== req.auth.tenantId) {
          return res.status(403).json({ error: 'Du kan bara köra remediation i din tenant.' });
        }
        const dryRun = parseBoolean(req.body?.dryRun, true);
        const limit = parseLimit(req.body?.limit, 50);
        const detailsLimit = parseLimit(req.body?.detailsLimit, 5);

        const membersBefore = await authStore.listTenantMembers(tenantId);
        const reportBefore = classifyOwnerMfaMembers(membersBefore, {
          currentMembershipId: req.auth.membershipId,
        });
        const candidatePool = reportBefore.disableCandidates.slice(0, limit);
        const skipped = reportBefore.protectedCurrentOwnerCandidates.map((item) => ({
          email: item.email,
          membershipId: item.membershipId,
          reason: 'current_actor_membership',
        }));
        const disabled = [];

        if (!dryRun) {
          for (const candidate of candidatePool) {
            if (!candidate.membershipId) {
              skipped.push({
                email: candidate.email,
                membershipId: candidate.membershipId,
                reason: 'missing_membership_id',
              });
              continue;
            }
            const updated = await authStore.updateMembership(candidate.membershipId, {
              status: 'disabled',
            });
            if (!updated) {
              skipped.push({
                email: candidate.email,
                membershipId: candidate.membershipId,
                reason: 'membership_not_found',
              });
              continue;
            }
            if (normalizeText(updated?.status).toLowerCase() !== 'disabled') {
              skipped.push({
                email: candidate.email,
                membershipId: candidate.membershipId,
                reason: 'membership_not_disabled',
              });
              continue;
            }
            const revokedSessions = await authStore.revokeSessionsByMembership(
              candidate.membershipId,
              { reason: 'membership_disabled' }
            );
            disabled.push({
              email: candidate.email,
              membershipId: candidate.membershipId,
              revokedSessions: Number(revokedSessions || 0),
            });
          }
        }

        const membersAfter = dryRun ? membersBefore : await authStore.listTenantMembers(tenantId);
        const reportAfter = classifyOwnerMfaMembers(membersAfter, {
          currentMembershipId: req.auth.membershipId,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: dryRun
            ? 'ops.readiness.remediate_owner_mfa_memberships.preview'
            : 'ops.readiness.remediate_owner_mfa_memberships.run',
          outcome: 'success',
          targetType: 'ops',
          targetId: tenantId,
          metadata: {
            tenantId,
            dryRun,
            limit,
            activeOwnersBefore: reportBefore.activeOwners.length,
            compliantOwnersBefore: reportBefore.compliantOwners.length,
            nonCompliantOwnersBefore: reportBefore.nonCompliantOwners.length,
            candidatePool: candidatePool.length,
            disabledCount: disabled.length,
            skippedCount: skipped.length,
            activeOwnersAfter: reportAfter.activeOwners.length,
            compliantOwnersAfter: reportAfter.compliantOwners.length,
            nonCompliantOwnersAfter: reportAfter.nonCompliantOwners.length,
          },
        });

        return res.json({
          ok: true,
          tenantId,
          dryRun,
          limit,
          attempted: candidatePool.length,
          activeOwners: reportBefore.activeOwners.length,
          compliantOwners: reportBefore.compliantOwners.length,
          nonCompliantOwners: reportBefore.nonCompliantOwners.length,
          canDisableNonCompliant: reportBefore.canDisableNonCompliant,
          disableCandidates: reportBefore.disableCandidates.length,
          attemptedCandidates: candidatePool.length,
          disabledCount: disabled.length,
          skippedCount: skipped.length,
          remainingNonCompliantOwners: reportAfter.nonCompliantOwners.length,
          before: {
            activeOwners: reportBefore.activeOwners.length,
            compliantOwners: reportBefore.compliantOwners.length,
            nonCompliantOwners: reportBefore.nonCompliantOwners.length,
            canDisableNonCompliant: reportBefore.canDisableNonCompliant,
          },
          after: {
            activeOwners: reportAfter.activeOwners.length,
            compliantOwners: reportAfter.compliantOwners.length,
            nonCompliantOwners: reportAfter.nonCompliantOwners.length,
          },
          candidatesPreview: candidatePool.slice(0, detailsLimit),
          disabledPreview: disabled.slice(0, detailsLimit),
          skippedPreview: skipped.slice(0, detailsLimit),
          generatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte köra OWNER MFA remediation.' });
      }
    }
  );

  router.post('/ops/secrets/snapshot', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    if (!secretRotationStore || typeof secretRotationStore.captureSnapshot !== 'function') {
      return res.status(503).json({ error: 'Secret rotation store är inte tillgänglig.' });
    }
    try {
      const dryRun = parseBoolean(req.body?.dryRun, true);
      const force = parseBoolean(req.body?.force, false);
      const note = normalizeText(req.body?.note || '');
      const source = dryRun ? 'ops_snapshot_preview' : 'ops_snapshot_commit';
      const snapshot = await secretRotationStore.captureSnapshot({
        actorUserId: req.auth.userId,
        source,
        note,
        dryRun,
        force,
      });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: dryRun ? 'ops.secrets.snapshot.preview' : 'ops.secrets.snapshot.run',
        outcome: 'success',
        targetType: 'ops',
        targetId: 'secrets_snapshot',
        metadata: {
          dryRun,
          force,
          changedCount: Number(snapshot?.totals?.changedCount || 0),
          staleRequired: Number(snapshot?.totals?.staleRequired || 0),
          pendingRotation: Number(snapshot?.totals?.pendingRotation || 0),
        },
      });

      return res.json({
        ok: true,
        ...snapshot,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte skapa secret-rotation snapshot.' });
    }
  });

  router.get('/ops/secrets/history', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    if (!secretRotationStore || typeof secretRotationStore.listSecretHistory !== 'function') {
      return res.status(503).json({ error: 'Secret rotation store är inte tillgänglig.' });
    }
    try {
      const secretId = normalizeText(req.query?.secretId || '');
      const limit = parseLimit(req.query?.limit, 50);
      const history = await secretRotationStore.listSecretHistory({
        secretId,
        limit,
      });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'ops.secrets.history.read',
        outcome: 'success',
        targetType: 'ops',
        targetId: secretId || 'all',
        metadata: {
          limit,
          count: Number(history?.count || 0),
        },
      });

      return res.json({
        secretId: secretId || null,
        limit,
        ...history,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa secret-rotation historik.' });
    }
  });

  router.get(
    '/ops/slo-tickets',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!sloTicketStore || typeof sloTicketStore.listTickets !== 'function') {
        return res.status(503).json({ error: 'SLO ticket-store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth.tenantId;
        const limit = parseLimit(req.query?.limit, 50);
        const status = normalizeText(req.query?.status || '');
        const list = await sloTicketStore.listTickets({
          tenantId,
          status,
          limit,
        });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.slo_tickets.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: tenantId,
          metadata: {
            status: status || 'all',
            limit,
            count: Number(list?.count || 0),
          },
        });

        return res.json({
          tenantId,
          status: status || 'all',
          limit,
          count: Number(list?.count || 0),
          tickets: Array.isArray(list?.tickets) ? list.tickets : [],
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa SLO-tickets.' });
      }
    }
  );

  router.get(
    '/ops/slo-tickets/summary',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!sloTicketStore || typeof sloTicketStore.summarize !== 'function') {
        return res.status(503).json({ error: 'SLO ticket-store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth.tenantId;
        const summary = await sloTicketStore.summarize({ tenantId });

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.slo_tickets.summary.read',
          outcome: 'success',
          targetType: 'ops',
          targetId: tenantId,
          metadata: {
            open: Number(summary?.totals?.open || 0),
            openBreaches: Number(summary?.totals?.openBreaches || 0),
            tickets: Number(summary?.totals?.tickets || 0),
          },
        });

        return res.json(summary);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa SLO-ticket summary.' });
      }
    }
  );

  router.post(
    '/ops/slo-tickets/:ticketId/resolve',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!sloTicketStore || typeof sloTicketStore.resolveTicket !== 'function') {
        return res.status(503).json({ error: 'SLO ticket-store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth.tenantId;
        const ticketId = normalizeText(req.params?.ticketId || '');
        if (!ticketId) {
          return res.status(400).json({ error: 'ticketId saknas.' });
        }
        const note = normalizeText(req.body?.note || '');
        const resolved = await sloTicketStore.resolveTicket({
          tenantId,
          ticketId,
          resolvedBy: req.auth.userId,
          note,
        });
        if (!resolved) {
          return res.status(404).json({ error: 'SLO-ticket hittades inte.' });
        }

        await authStore.addAuditEvent({
          tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.slo_tickets.resolve',
          outcome: 'success',
          targetType: 'slo_ticket',
          targetId: ticketId,
          metadata: {
            note: note || null,
          },
        });

        return res.json({
          ok: true,
          ticket: resolved,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte markera SLO-ticket som löst.' });
      }
    }
  );

  router.get('/ops/reports', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const limit = parseLimit(req.query?.limit, 20);
      const reports = await listSchedulerPilotReports({
        reportsDir: config.reportsDir,
        limit,
      });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'ops.reports.read',
        outcome: 'success',
        targetType: 'ops',
        targetId: 'scheduler_reports',
        metadata: {
          count: reports.length,
          limit,
        },
      });

      return res.json({
        reportsDir: config.reportsDir,
        retention: {
          maxFiles: config.reportRetentionMaxFiles,
          maxAgeDays: config.reportRetentionMaxAgeDays,
        },
        count: reports.length,
        reports,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa scheduler-rapporter.' });
    }
  });

  router.post('/ops/reports/prune', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const dryRun = parseBoolean(req.body?.dryRun, true);
      const result = await pruneSchedulerPilotReports({
        reportsDir: config.reportsDir,
        maxFiles: config.reportRetentionMaxFiles,
        maxAgeDays: config.reportRetentionMaxAgeDays,
        dryRun,
      });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: dryRun ? 'ops.reports.prune.preview' : 'ops.reports.prune.run',
        outcome: 'success',
        targetType: 'ops',
        targetId: 'scheduler_reports',
        metadata: {
          deletedCount: result.deletedCount,
          scannedCount: result.scannedCount,
          maxFiles: result.settings.maxFiles,
          maxAgeDays: result.settings.maxAgeDays,
        },
      });

      return res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte pruna scheduler-rapporter.' });
    }
  });

  router.get('/ops/state/manifest', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const stateFileMap = getStateFileMap(config);
      const manifest = await buildStateManifest({ stateFileMap });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'ops.state.manifest.read',
        outcome: 'success',
        targetType: 'ops',
        targetId: 'state_manifest',
      });

      return res.json({
        backupDir: config.backupDir,
        retention: {
          maxFiles: config.backupRetentionMaxFiles,
          maxAgeDays: config.backupRetentionMaxAgeDays,
        },
        ...manifest,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa state manifest.' });
    }
  });

  router.get('/ops/state/backups', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const limit = parseLimit(req.query?.limit, 20);
      const backups = await listBackups({
        backupDir: config.backupDir,
        limit,
      });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'ops.state.backups.read',
        outcome: 'success',
        targetType: 'ops',
        targetId: 'state_backups',
        metadata: { count: backups.length, limit },
      });

      return res.json({
        backupDir: config.backupDir,
        retention: {
          maxFiles: config.backupRetentionMaxFiles,
          maxAgeDays: config.backupRetentionMaxAgeDays,
        },
        count: backups.length,
        backups,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa backups.' });
    }
  });

  router.post('/ops/state/backup', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const stateFileMap = getStateFileMap(config);
      const backup = await createStateBackup({
        stateFileMap,
        backupDir: config.backupDir,
        createdBy: req.currentUser?.email || req.auth.userId || 'owner',
      });

      const pruneResult = await pruneBackups({
        backupDir: config.backupDir,
        maxFiles: config.backupRetentionMaxFiles,
        maxAgeDays: config.backupRetentionMaxAgeDays,
        dryRun: false,
      });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'ops.state.backup.create',
        outcome: 'success',
        targetType: 'backup',
        targetId: backup.fileName,
        metadata: {
          filePath: backup.filePath,
          sizeBytes: backup.sizeBytes,
          stores: backup.stores.length,
          pruneDeletedCount: pruneResult.deletedCount,
        },
      });

      return res.status(201).json({
        ok: true,
        backup,
        prune: pruneResult,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte skapa backup.' });
    }
  });

  router.post(
    '/ops/state/backups/prune',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const dryRun = parseBoolean(req.body?.dryRun, true);
        const result = await pruneBackups({
          backupDir: config.backupDir,
          maxFiles: config.backupRetentionMaxFiles,
          maxAgeDays: config.backupRetentionMaxAgeDays,
          dryRun,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: dryRun ? 'ops.state.backups.prune.preview' : 'ops.state.backups.prune.run',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'state_backups',
          metadata: {
            deletedCount: result.deletedCount,
            scannedCount: result.scannedCount,
            maxFiles: result.settings.maxFiles,
            maxAgeDays: result.settings.maxAgeDays,
          },
        });

        return res.json({
          ok: true,
          ...result,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte pruna backups.' });
      }
    }
  );

  router.post('/ops/state/restore', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const fileName = normalizeText(req.body?.fileName);
      const dryRun = parseBoolean(req.body?.dryRun, false);
      const confirmText = normalizeText(req.body?.confirmText);

      if (!fileName) {
        return res.status(400).json({ error: 'fileName krävs.' });
      }

      const backupFilePath = resolveBackupFilePath({
        backupDir: config.backupDir,
        fileName,
      });
      const stateFileMap = getStateFileMap(config);
      const preview = await inspectBackupRestore({
        backupFilePath,
        stateFileMap,
      });

      if (dryRun) {
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.state.restore.preview',
          outcome: 'success',
          targetType: 'backup',
          targetId: fileName,
          metadata: {
            willRestoreCount: preview.stores.filter((store) => store.willRestore).length,
            missingCount: preview.stores.filter((store) => !store.existsInBackup).length,
            unknownStores: preview.unknownStores.length,
          },
        });

        return res.json({
          ok: true,
          dryRun: true,
          fileName,
          preview,
        });
      }

      const expectedConfirm = `RESTORE ${fileName}`;
      if (confirmText !== expectedConfirm) {
        return res.status(400).json({
          error: `Bekräftelse saknas. Sätt confirmText till exakt "${expectedConfirm}".`,
        });
      }

      const restore = await restoreFromBackup({
        backupFilePath,
        stateFileMap,
      });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'ops.state.restore.run',
        outcome: 'success',
        targetType: 'backup',
        targetId: fileName,
        metadata: {
          restoredCount: restore.stores.filter((store) => store.restored).length,
          skippedCount: restore.stores.filter((store) => !store.restored).length,
        },
      });

      return res.json({
        ok: true,
        dryRun: false,
        fileName,
        preview,
        restore,
      });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return res.status(404).json({ error: 'Backupfilen hittades inte.' });
      }
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte återställa backup.' });
    }
  });

  router.get(
    '/ops/mailbox-truth/restore/inspect',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const layout = await inspectMailboxTruthLayout(config);
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.mailbox_truth.restore.inspect',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'mailbox_truth_restore',
        });
        return res.json({ ok: true, layout });
      } catch (error) {
        console.error('[ops/mailbox-truth/restore/inspect]', error);
        return res
          .status(500)
          .json({ error: error?.message || 'Kunde inte inspektera truth-backup.' });
      }
    }
  );

  router.post(
    '/ops/mailbox-truth/reload-shards',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.ensureMailboxLoaded !== 'function') {
        return res.status(503).json({ error: 'Mailbox-truth reload stöds inte i denna version.' });
      }
      try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const mailboxIds = Array.isArray(body.mailboxIds)
          ? body.mailboxIds.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
          : [];
        const layout = await inspectMailboxTruthLayout(config);
        const targets =
          mailboxIds.length > 0
            ? mailboxIds
            : layout.shards
                .map((shard) => decodeMailboxIdFromShardFileName(shard.fileName))
                .filter(Boolean);

        const results = [];
        for (const mailboxId of targets) {
          const beforeCount = ccoMailboxTruthStore.listMessages({ mailboxIds: [mailboxId] }).length;
          try {
            await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
            const afterCount = ccoMailboxTruthStore.listMessages({
              mailboxIds: [mailboxId],
            }).length;
            results.push({ mailboxId, ok: true, beforeCount, afterCount });
          } catch (error) {
            results.push({
              mailboxId,
              ok: false,
              beforeCount,
              afterCount: beforeCount,
              error: error?.message || String(error),
            });
          }
        }

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'ops.mailbox_truth.reload_shards',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'mailbox_truth_reload',
          metadata: {
            targets,
            loadedMailboxes: ccoMailboxTruthStore.listLoadedMailboxes?.() || [],
          },
        });

        return res.json({
          ok: true,
          loadedMailboxes: ccoMailboxTruthStore.listLoadedMailboxes?.() || [],
          results,
        });
      } catch (error) {
        console.error('[ops/mailbox-truth/reload-shards]', error);
        return res.status(500).json({ error: error?.message || 'Kunde inte reloada shards.' });
      }
    }
  );

  router.post(
    '/ops/mailbox-truth/restore',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const dryRun = parseBoolean(body.dryRun, true);
        const confirmText = normalizeText(body.confirmText);
        const mailboxIds = Array.isArray(body.mailboxIds)
          ? body.mailboxIds.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
          : [];
        const backupPath = normalizeText(body.backupPath);

        if (!dryRun && confirmText !== 'RESTORE MAILBOX TRUTH') {
          return res.status(400).json({
            error: 'confirmText måste vara exakt "RESTORE MAILBOX TRUTH" för apply.',
          });
        }

        const result = await restoreMailboxTruthShards({
          config,
          backupPath,
          mailboxIds,
          apply: !dryRun,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: dryRun ? 'ops.mailbox_truth.restore.preview' : 'ops.mailbox_truth.restore.apply',
          outcome: 'success',
          targetType: 'ops',
          targetId: 'mailbox_truth_restore',
          metadata: {
            dryRun,
            backupPath: result.backupPath,
            restoredCount: result.actions.filter((action) => action.restored).length,
            mailboxIds: result.targets,
          },
        });

        return res.json({ ok: true, ...result });
      } catch (error) {
        console.error('[ops/mailbox-truth/restore]', error);
        return res
          .status(500)
          .json({ error: error?.message || 'Kunde inte återställa mailbox truth.' });
      }
    }
  );

  // CL4: Cliento bookings — list + summary + import + mock-seed.
  router.get(
    '/ops/cliento/bookings/summary',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!clientoBookingStore) {
        return res.status(503).json({ error: 'clientoBookingStore saknas.' });
      }
      try {
        return res.json({
          ok: true,
          summary: clientoBookingStore.summarize({ tenantId: req.auth?.tenantId }),
        });
      } catch (error) {
        console.error('[ops/cliento/summary]', error);
        return res.status(500).json({ error: 'Kunde inte hämta summary.' });
      }
    }
  );

  router.post(
    '/ops/cliento/import-bookings',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!clientoBookingStore) {
        return res.status(503).json({ error: 'clientoBookingStore saknas.' });
      }
      try {
        const tenantId = req.auth?.tenantId;
        if (!tenantId) return res.status(400).json({ error: 'tenantId saknas.' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const bookings = Array.isArray(body.bookings) ? body.bookings : [];
        if (bookings.length === 0) {
          return res.status(400).json({ error: 'bookings[] saknas i body.' });
        }
        const result = await clientoBookingStore.importBatch({
          tenantId,
          bookings,
          source: body.source || 'manual',
        });
        try {
          await authStore.addAuditEvent({
            tenantId,
            actorUserId: req.auth?.userId,
            action: 'ops.cliento.import',
            outcome: 'success',
            targetType: 'cliento_bookings',
            targetId: 'batch_import',
            metadata: { ...result, source: body.source || 'manual' },
          });
        } catch (_e) {}
        return res.json({ ok: true, ...result });
      } catch (error) {
        console.error('[ops/cliento/import-bookings]', error);
        return res.status(500).json({ error: 'Kunde inte importera bokningar.' });
      }
    }
  );

  router.post(
    '/ops/cliento/mock-seed',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!clientoBookingStore || !ccoMailboxTruthStore) {
        return res
          .status(503)
          .json({ error: 'clientoBookingStore eller ccoMailboxTruthStore saknas.' });
      }
      try {
        const tenantId = req.auth?.tenantId;
        if (!tenantId) return res.status(400).json({ error: 'tenantId saknas.' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const result = await seedClientoMockBookings({
          tenantId,
          ccoMailboxTruthStore,
          clientoBookingStore,
          maxCustomers: Number(body.maxCustomers) || 200,
        });
        try {
          await authStore.addAuditEvent({
            tenantId,
            actorUserId: req.auth?.userId,
            action: 'ops.cliento.mock_seed',
            outcome: 'success',
            targetType: 'cliento_bookings',
            targetId: 'mock_seed',
            metadata: result,
          });
        } catch (_e) {}
        return res.json({ ok: true, ...result });
      } catch (error) {
        console.error('[ops/cliento/mock-seed]', error);
        return res.status(500).json({ error: error?.message || 'Kunde inte seeda mockdata.' });
      }
    }
  );

  // DI9: Auto-bootstrap status. Read-only.
  router.get(
    '/ops/bootstrap/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        return res.json({
          ok: true,
          enabled: isBootstrapEnabled(),
          ...getBootstrapStatus(),
        });
      } catch (error) {
        console.error('[ops/bootstrap/status]', error);
        return res.status(500).json({ error: 'Kunde inte hämta bootstrap-status.' });
      }
    }
  );

  // DI3+DI4: Message-intelligence backfill / delta-runner
  // Kör enrichment över alla messages i mailboxTruthStore för anropande
  // tenant. Idempotent. Mode kan vara 'backfill' (default), 'delta' eller 'force'.
  router.post(
    '/ops/intelligence/run',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!ccoMailboxTruthStore) {
        return res.status(503).json({ error: 'Mailbox-truth-store är inte tillgänglig.' });
      }
      if (!messageIntelligenceStore) {
        return res.status(503).json({ error: 'Message-intelligence-store är inte tillgänglig.' });
      }
      try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const tenantId = req.auth?.tenantId;
        if (!tenantId) {
          return res.status(400).json({ error: 'tenantId saknas i auth-context.' });
        }
        const mode = ['backfill', 'delta', 'force'].includes(body.mode) ? body.mode : 'backfill';
        const mailboxIds = Array.isArray(body.mailboxIds) ? body.mailboxIds : [];
        const result = await runEnrichment({
          tenantId,
          mailboxIds,
          ccoMailboxTruthStore,
          messageIntelligenceStore,
          mode,
        });
        try {
          await authStore.addAuditEvent({
            tenantId,
            actorUserId: req.auth?.userId,
            action: 'ops.intelligence.run',
            outcome: 'success',
            targetType: 'ops',
            targetId: 'message_intelligence',
            metadata: {
              mode,
              examined: result.examined,
              enriched: result.enriched,
              skipped: result.skipped,
              failed: result.failed,
              durationMs: result.durationMs,
              mailboxIds,
            },
          });
        } catch (_e) {}
        return res.json({ ok: true, result });
      } catch (error) {
        console.error('[ops/intelligence/run]', error);
        return res.status(500).json({ error: error?.message || 'Kunde inte köra enrichment.' });
      }
    }
  );

  router.get(
    '/ops/intelligence/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!messageIntelligenceStore) {
        return res.status(503).json({ error: 'Message-intelligence-store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth?.tenantId;
        const enrichmentCount = messageIntelligenceStore.countEnrichments({ tenantId });
        const totalMessages = ccoMailboxTruthStore
          ? ccoMailboxTruthStore.listMessages({})?.length || 0
          : null;
        const runInfo = messageIntelligenceStore.getRunInfo(tenantId);
        return res.json({
          ok: true,
          tenantId,
          enrichmentCount,
          totalMessages,
          coveragePct:
            totalMessages > 0 ? Math.round((enrichmentCount / totalMessages) * 100) : null,
          runInfo,
        });
      } catch (error) {
        console.error('[ops/intelligence/status]', error);
        return res.status(500).json({ error: 'Kunde inte hämta status.' });
      }
    }
  );

  // DI5: Cross-mailbox kund-rapport — read-only.
  // GET-parameter `preferredMailbox` (default contact@hairtpclinic.com) markerar
  // vilka kunder som behöver konsolideras.
  router.get(
    '/ops/customers/cross-mailbox-report',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!ccoMailboxTruthStore) {
        return res.status(503).json({ error: 'Mailbox-truth-store är inte tillgänglig.' });
      }
      try {
        const preferred = String(
          req.query?.preferredMailbox || DEFAULT_PREFERRED_MAILBOX
        ).toLowerCase();
        const limit = Math.max(1, Math.min(500, Number(req.query?.limit) || 200));
        const messages = ccoMailboxTruthStore.listMessages({}) || [];
        const summary = summarizeAggregation(messages, { preferredMailboxId: preferred });
        const customers = findCrossMailboxCustomers(messages, {
          preferredMailboxId: preferred,
        }).slice(0, limit);
        // Debug: när inga kunder hittas, returnera shape av första 3 messages
        const debug =
          customers.length === 0 && messages.length > 0
            ? {
                totalMessages: messages.length,
                sampleMessageKeys: Object.keys(messages[0] || {}),
                sampleMessages: messages.slice(0, 3).map((m) => ({
                  mailboxId: m.mailboxId,
                  folderType: m.folderType,
                  customerEmail: m.customerEmail,
                  senderEmail: m.senderEmail,
                  from: m.from,
                  fromName: m.fromName,
                  fromEmail: m.fromEmail,
                  toRecipients: Array.isArray(m.toRecipients)
                    ? m.toRecipients.slice(0, 2)
                    : m.toRecipients,
                  subject: (m.subject || '').slice(0, 60),
                })),
              }
            : null;
        return res.json({
          ok: true,
          generatedAt: new Date().toISOString(),
          preferredMailboxId: preferred,
          summary,
          customers,
          ...(debug ? { debug } : {}),
        });
      } catch (error) {
        console.error('[ops/customers/cross-mailbox-report]', error);
        return res.status(500).json({ error: 'Kunde inte bygga rapporten.' });
      }
    }
  );

  // DI6: Konsolidera kunder till preferred mailbox.
  // Sätter customerPreference.preferredMailboxId = preferred för varje kund som
  // skrivit till >1 mailbox. Detta är reversibel (skriver bara metadata, ändrar
  // inte själva mail-trådarna). Body: { preferredMailbox?, dryRun?, limit? }.
  router.post(
    '/ops/customers/consolidate',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!ccoMailboxTruthStore) {
        return res.status(503).json({ error: 'Mailbox-truth-store är inte tillgänglig.' });
      }
      if (!customerPreferenceStore) {
        return res.status(503).json({ error: 'Customer-preference-store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth?.tenantId;
        if (!tenantId) {
          return res.status(400).json({ error: 'tenantId saknas i auth-context.' });
        }
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const preferred = String(body.preferredMailbox || DEFAULT_PREFERRED_MAILBOX).toLowerCase();
        const dryRun = Boolean(body.dryRun);
        const limit = Math.max(0, Number(body.limit) || 0);

        const messages = ccoMailboxTruthStore.listMessages({}) || [];
        const candidates = findCrossMailboxCustomers(messages, {
          preferredMailboxId: preferred,
        });
        const targets = limit > 0 ? candidates.slice(0, limit) : candidates;
        let updated = 0;
        const samples = [];
        for (const c of targets) {
          if (!dryRun) {
            await customerPreferenceStore.setPreferredMailbox({
              tenantId,
              customerEmail: c.customerEmail,
              preferredMailboxId: preferred,
              reason: c.wroteToPreferred
                ? 'consolidated_existing_preferred'
                : 'consolidated_new_preferred',
            });
          }
          updated += 1;
          if (samples.length < 5) {
            samples.push({
              customerEmail: c.customerEmail,
              customerName: c.customerName,
              mailboxes: c.mailboxes.map((m) => `${m.mailboxId} (${m.messageCount})`),
              totalMessages: c.totalMessages,
            });
          }
        }
        if (!dryRun && typeof customerPreferenceStore.flush === 'function') {
          await customerPreferenceStore.flush();
        }
        try {
          await authStore.addAuditEvent({
            tenantId,
            actorUserId: req.auth?.userId,
            action: 'ops.customers.consolidate',
            outcome: 'success',
            targetType: 'customer_preference',
            targetId: preferred,
            metadata: {
              preferredMailboxId: preferred,
              candidates: candidates.length,
              updated,
              dryRun,
            },
          });
        } catch (_e) {}

        return res.json({
          ok: true,
          dryRun,
          preferredMailboxId: preferred,
          candidatesFound: candidates.length,
          updated,
          samples,
        });
      } catch (error) {
        console.error('[ops/customers/consolidate]', error);
        return res.status(500).json({ error: error?.message || 'Kunde inte konsolidera kunder.' });
      }
    }
  );

  // OI3: Daily digest preview — bygger HTML-email från KPI-payload som
  // klienten redan hämtat. Tar `{ kpis, locale }` i bodyn, returnerar
  // antingen JSON {subject, html, text} eller direkt HTML när
  // `?format=html` skickas.
  router.post(
    '/ops/digest/preview',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const kpis = body.kpis && typeof body.kpis === 'object' ? body.kpis : {};
        const locale = typeof body.locale === 'string' ? body.locale : 'sv';
        const tenantId = req.auth?.tenantId || kpis?.data?.tenantId || '';
        let tenantBrand =
          body.tenantBrand && typeof body.tenantBrand === 'object' ? body.tenantBrand : null;
        if (
          !tenantBrand &&
          tenantConfigStore &&
          typeof tenantConfigStore.getTenantConfig === 'function'
        ) {
          try {
            const cfg = await tenantConfigStore.getTenantConfig(tenantId);
            tenantBrand = cfg?.brand || null;
          } catch (_e) {}
        }
        const digest = buildDigest({ tenantBrand: tenantBrand || {}, kpis, locale });
        try {
          await authStore.addAuditEvent({
            tenantId,
            actorUserId: req.auth?.userId,
            action: 'ops.digest.preview',
            outcome: 'success',
            targetType: 'ops',
            targetId: 'daily_digest',
            metadata: {
              locale,
              hasAlerts: Array.isArray(kpis?.data?.alerts) && kpis.data.alerts.length > 0,
            },
          });
        } catch (_e) {}
        if (String(req.query?.format || '').toLowerCase() === 'html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.send(digest.html);
        }
        return res.json({ ok: true, digest });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte bygga digest.' });
      }
    }
  );

  // DD2: manuell trigger för daily-digest (skickar e-post via Graph). Body:
  //   { tenantId?: string, recipients?: string[], dryRun?: boolean, allTenants?: boolean }
  // Default: skicka för auth-tenanten. Med allTenants=true loopar runnern alla tenants.
  router.post(
    '/ops/digest/send',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!tenantConfigStore || typeof tenantConfigStore.getTenantConfig !== 'function') {
        return res.status(503).json({ error: 'tenantConfigStore är inte tillgänglig.' });
      }
      if (!graphSendConnector) {
        return res.status(503).json({
          error:
            'graphSendConnector saknas (ARCANA_GRAPH_SEND_ENABLED ej satt eller credentials saknas).',
        });
      }
      try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const dryRun = Boolean(body.dryRun);
        const recipientsOverride =
          Array.isArray(body.recipients) && body.recipients.length > 0 ? body.recipients : null;

        if (body.allTenants === true) {
          const result = await runDailyDigestForAllTenants({
            tenantConfigStore,
            ccoHistoryStore,
            graphSendConnector,
            runtimeMetricsStore,
            forceSend: true,
            dryRun,
            logger: console,
          });
          try {
            await authStore.addAuditEvent({
              tenantId: req.auth?.tenantId || null,
              actorUserId: req.auth?.userId,
              action: 'ops.digest.send.all',
              outcome: 'success',
              targetType: 'digest',
              targetId: 'all_tenants',
              metadata: {
                sent: result?.sent,
                skipped: result?.skipped,
                failed: result?.failed,
                dryRun,
              },
            });
          } catch (_e) {}
          return res.json({ ok: true, result });
        }

        const tenantId = (body.tenantId && String(body.tenantId).trim()) || req.auth?.tenantId;
        if (!tenantId) {
          return res.status(400).json({ error: 'tenantId saknas.' });
        }
        const tenantConfig = await tenantConfigStore.getTenantConfig(tenantId);
        const result = await runDigestForTenant({
          tenantId,
          tenantConfig: tenantConfig || {},
          tenantConfigStore,
          ccoHistoryStore,
          graphSendConnector,
          runtimeMetricsStore,
          forceSend: true,
          recipientsOverride,
          dryRun,
          logger: console,
        });
        try {
          await authStore.addAuditEvent({
            tenantId,
            actorUserId: req.auth?.userId,
            action: 'ops.digest.send',
            outcome: result?.error ? 'failed' : 'success',
            targetType: 'digest',
            targetId: 'manual_trigger',
            metadata: {
              recipients: result?.recipients,
              senderMailboxId: result?.senderMailboxId,
              dryRun,
              error: result?.error || null,
            },
          });
        } catch (_e) {}
        return res.json({ ok: true, result });
      } catch (error) {
        console.error('[ops/digest/send]', error);
        return res.status(500).json({ error: error?.message || 'Kunde inte skicka digest.' });
      }
    }
  );

  router.post(
    '/ops/mail/truth-hydration/run',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const phase = normalizeText(body.phase) || 'dry-run';
      const go = parseBoolean(body.go, false);
      const autoContinue = parseBoolean(body.autoContinue, false);
      const canaryLimit = Math.max(1, Math.min(500, Number(body.canaryLimit) || 200));

      if (!ccoMailboxTruthStore) {
        return res.status(503).json({ error: 'ccoMailboxTruthStore saknas.' });
      }
      if (!ccoMailIngestionStore && phase !== 'snapshot') {
        return res.status(503).json({ error: 'ccoMailIngestionStore saknas.' });
      }

      try {
        if (phase === 'snapshot') {
          const label = `pre-mail-truth-hydration-${new Date().toISOString().slice(0, 10)}`;
          const dir = path.join(config.backupDir || path.join(config.stateRoot, 'backups'), label);
          await fs.mkdir(dir, { recursive: true });
          const files = [
            config.ccoMailIngestionStorePath,
            config.ccoMailboxTruthStorePath,
            config.ccoConversationStateStorePath,
            path.join(config.stateRoot, 'cco-conversation-thread-states.json'),
            path.join(config.stateRoot, 'cco-mail-snoozes.json'),
            path.join(config.stateRoot, 'cco-audit.jsonl'),
          ];
          const copied = [];
          for (const filePath of files) {
            if (!filePath) continue;
            try {
              await fs.copyFile(filePath, path.join(dir, path.basename(filePath)));
              copied.push(path.basename(filePath));
            } catch {
              /* optional */
            }
          }
          try {
            await fs.cp(config.ccoMailboxTruthShardDir, path.join(dir, 'cco-mailbox-truth'), {
              recursive: true,
            });
            copied.push('cco-mailbox-truth/');
          } catch {
            /* optional */
          }

          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'ops.mail.truth_hydration.snapshot',
            outcome: 'success',
            targetType: 'ops',
            targetId: 'mail_truth_hydration',
            metadata: { dir, copied },
          });

          return res.json({ ok: true, phase: 'snapshot', dir, copied });
        }

        const writeEnabled =
          String(process.env.ENABLE_MAIL_TRUTH_HYDRATION_WRITE || '').toLowerCase() === 'true';
        if ((phase === 'canary' || phase === 'full') && (!go || !writeEnabled)) {
          return res.status(400).json({
            error: 'canary/full kräver go=true och ENABLE_MAIL_TRUTH_HYDRATION_WRITE=true',
          });
        }

        let patientDirectory = [];
        if (patientMasterStore?.listPatients) {
          const listed = await patientMasterStore.listPatients({
            tenantId: req.auth.tenantId || config.defaultTenant,
            limit: 50000,
            offset: 0,
          });
          patientDirectory = listed.items || listed.patients || [];
        }

        const auditLog = await createCcoAuditLog({
          filePath: path.join(config.stateRoot, 'cco-audit.jsonl'),
        });

        const runAsync = (phase === 'canary' || phase === 'full') && parseBoolean(body.async, true);

        const executeHydration = async ({ hydrationPhase, limit = canaryLimit } = {}) =>
          runMailTruthHydration({
            ingestionFilePath: config.ccoMailIngestionStorePath,
            truthStore: ccoMailboxTruthStore,
            auditLog,
            patientDirectory,
            phase: hydrationPhase,
            canaryLimit: limit,
            actor: req.auth?.userId || 'owner',
            tenantId: req.auth?.tenantId || config.defaultTenant,
          });

        const finalizeHydration = async ({ result, fullResult = null, jobId = null } = {}) => {
          let enrichmentCoverage = null;
          let analyzeInboxResult = null;
          const hydrationComplete =
            (phase === 'full' && result?.ok) || (fullResult && fullResult.ok);
          if (hydrationComplete) {
            if (scheduler && typeof scheduler.runJob === 'function') {
              try {
                analyzeInboxResult = await scheduler.runJob('cco_inbox_enrichment_bootstrap', {
                  trigger: 'manual_api',
                  actorUserId: req.auth.userId,
                  tenantId: req.auth.tenantId,
                });
              } catch (analyzeError) {
                analyzeInboxResult = {
                  ok: false,
                  error: analyzeError?.message || 'analyze_inbox_failed',
                };
              }
            }
            if (capabilityAnalysisStore && ccoMailboxTruthStore) {
              enrichmentCoverage = await computeCcoInboxEnrichmentCoverage({
                tenantId: req.auth.tenantId,
                mailboxIds: resolveCcoHistoryMailboxIds(config),
                capabilityAnalysisStore,
                ccoMailboxTruthStore,
                ccoCustomerStore,
                stateRoot: config.stateRoot,
              });
            }
          }

          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: `ops.mail.truth_hydration.${phase}`,
            outcome: result?.ok ? 'success' : 'failed',
            targetType: 'ops',
            targetId: 'mail_truth_hydration',
            metadata: {
              runId: result?.runId || jobId || null,
              phase,
              applied: result?.applied || null,
              stopReason: result?.stopReason || null,
              async: runAsync,
            },
          });

          return { enrichmentCoverage, analyzeInboxResult };
        };

        if (runAsync) {
          const jobId = crypto.randomUUID();
          const startedAt = new Date().toISOString();
          pruneMailTruthHydrationJobs();
          mailTruthHydrationJobs.set(jobId, {
            jobId,
            phase,
            autoContinue,
            status: 'running',
            startedAt,
            updatedAt: startedAt,
          });

          setImmediate(async () => {
            try {
              const result = await executeHydration({
                hydrationPhase: phase === 'canary' || phase === 'full' ? phase : 'dry-run',
              });
              let fullResult = null;
              if (phase === 'canary' && autoContinue && result.ok) {
                fullResult = await executeHydration({ hydrationPhase: 'full' });
              }
              const { enrichmentCoverage, analyzeInboxResult } = await finalizeHydration({
                result,
                fullResult,
                jobId,
              });
              mailTruthHydrationJobs.set(jobId, {
                jobId,
                phase,
                autoContinue,
                status: result.ok && (!fullResult || fullResult.ok) ? 'completed' : 'failed',
                startedAt,
                updatedAt: new Date().toISOString(),
                result,
                fullResult,
                analyzeInboxResult,
                enrichmentCoverage,
              });
            } catch (error) {
              mailTruthHydrationJobs.set(jobId, {
                jobId,
                phase,
                autoContinue,
                status: 'failed',
                startedAt,
                updatedAt: new Date().toISOString(),
                error: error?.message || 'mail_truth_hydration_failed',
                code: error?.code || null,
              });
            }
          });

          return res.status(202).json({
            ok: true,
            accepted: true,
            async: true,
            jobId,
            phase,
            autoContinue,
          });
        }

        const result = await executeHydration({
          hydrationPhase: phase === 'canary' || phase === 'full' ? phase : 'dry-run',
        });

        let fullResult = null;
        if (phase === 'canary' && autoContinue && result.ok) {
          fullResult = await executeHydration({ hydrationPhase: 'full' });
        }

        const { enrichmentCoverage, analyzeInboxResult } = await finalizeHydration({
          result,
          fullResult,
        });

        return res.json({
          ok: result.ok,
          phase,
          result,
          fullResult,
          analyzeInboxResult,
          enrichmentCoverage,
        });
      } catch (error) {
        console.error('[ops/mail/truth-hydration/run]', error);
        return res.status(500).json({
          error: error?.message || 'Mail truth hydration misslyckades.',
          code: error?.code || null,
        });
      }
    }
  );

  router.get(
    '/ops/mail/truth-hydration/status/:jobId',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      pruneMailTruthHydrationJobs();
      const jobId = normalizeText(req.params?.jobId);
      const job = jobId ? mailTruthHydrationJobs.get(jobId) : null;
      if (!job) {
        return res.status(404).json({ error: 'Hydration-jobb saknas eller har gått ut.' });
      }
      return res.json({ ok: job.status !== 'failed', job });
    }
  );

  return router;
}

module.exports = {
  createOpsRouter,
};
