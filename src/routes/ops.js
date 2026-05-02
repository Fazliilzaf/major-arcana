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
const {
  listSchedulerPilotReports,
  pruneSchedulerPilotReports,
} = require('../ops/pilotReports');
const {
  validateTemplateVariables,
  applyChannelSignature,
} = require('../templates/variables');
const { evaluateTemplateRisk } = require('../risk/templateRisk');
const { buildDigest } = require('../ops/dailyDigest');
const {
  runDigestForTenant,
  runDailyDigestForAllTenants,
} = require('../ops/dailyDigestRunner');
const { runEnrichment } = require('../ops/messageEnrichmentRunner');
const { seedFromMailboxTruth: seedClientoMockBookings } = require('../ops/clientoMockSeeder');
const {
  aggregateByCustomer,
  findCrossMailboxCustomers,
  summarizeAggregation,
} = require('../ops/crossMailboxAggregator');
const {
  getBootstrapStatus,
  isEnabled: isBootstrapEnabled,
} = require('../ops/bootstrapRunner');

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
    const metadata =
      event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
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
      templateVariableAllowlistByCategory:
        tenantConfig?.templateVariableAllowlistByCategory || {},
      templateRequiredVariablesByCategory:
        tenantConfig?.templateRequiredVariablesByCategory || {},
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
  const outputEvaluation =
    risk?.output && typeof risk.output === 'object' ? risk.output : null;
  const hasOutputEvaluation =
    Boolean(outputEvaluation) &&
    normalizeText(outputEvaluation?.scope).toLowerCase() === 'output';
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
  const nonCompliantOwners = activeOwners.filter((item) => !item.mfaRequired || !item.mfaConfigured);
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
  messageIntelligenceStore = null,
  customerPreferenceStore = null,
  ccoHistoryStore = null,
  graphSendConnector = null,
  runtimeMetricsStore = null,
  clientoBookingStore = null,
  requireAuth,
  requireRole,
}) {
  const DEFAULT_PREFERRED_MAILBOX =
    String(process.env.CCO_DEFAULT_PREFERRED_MAILBOX || 'contact@hairtpclinic.com').toLowerCase();
  const router = express.Router();
  const REQUIRED_SCHEDULER_SUITE_JOB_IDS = Object.freeze([
    'nightly_pilot_report',
    'backup_prune',
    'restore_drill_preview',
    'restore_drill_full',
    'audit_integrity_check',
    'secrets_rotation_snapshot',
    'release_governance_review',
    'alert_probe',
  ]);

  router.get(
    '/ops/scheduler/status',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
    }
  );

  router.post(
    '/ops/scheduler/run',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
          statusCode =
            success ? 200 : errorCode === 'job_running' || errorCode === 'disabled_job' ? 409 : 400;
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
    }
  );

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

  router.post(
    '/ops/release/cycles',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
    }
  );

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
      if (!releaseGovernanceStore || typeof releaseGovernanceStore.recordGateEvidence !== 'function') {
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
          req.body?.readiness && typeof req.body.readiness === 'object'
            ? req.body.readiness
            : {};
        const strictInput =
          req.body?.strict && typeof req.body.strict === 'object'
            ? req.body.strict
            : {};
        const requiredChecksInput =
          req.body?.requiredChecks && typeof req.body.requiredChecks === 'object'
            ? req.body.requiredChecks
            : {};

        const readiness = {
          score: Number(readinessInput.score ?? latestReadinessMeta.score ?? 0),
          band: normalizeText(readinessInput.band || latestReadinessMeta.band || ''),
          goAllowed:
            readinessInput.goAllowed === true || latestReadinessMeta.goAllowed === true,
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
            requiredChecksInput.noP0P1Blockers === true ||
            req.body?.noP0P1Blockers === true,
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
        const statusCode =
          message.includes('hittades inte') ? 404 : message.includes('Sign-off kräver') ? 409 : 500;
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
      if (!releaseGovernanceStore || typeof releaseGovernanceStore.addPostLaunchReview !== 'function') {
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
      if (!releaseGovernanceStore || typeof releaseGovernanceStore.recordRealityAudit !== 'function') {
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
        const requiredDays = Number(stabilization?.requiredDays || config?.releasePostLaunchStabilizationDays || 14);
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

  router.get(
    '/ops/secrets/status',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
    }
  );

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
        const manualCandidates = limitedCandidates.filter((item) => item.fixableIssues.length === 0);

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
              allowlistOverridesByCategory:
                tenantRuntime.templateVariableAllowlistByCategory,
              requiredOverridesByCategory:
                tenantRuntime.templateRequiredVariablesByCategory,
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
        const resolvedFixableCount = dryRun
          ? 0
          : fixed.length - remainingFixableAfterApply;

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
        return res
          .status(503)
          .json({ error: 'Auth store saknas för OWNER MFA remediation.' });
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

        const membersAfter = dryRun
          ? membersBefore
          : await authStore.listTenantMembers(tenantId);
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
        return res
          .status(500)
          .json({ error: 'Kunde inte köra OWNER MFA remediation.' });
      }
    }
  );

  router.post(
    '/ops/secrets/snapshot',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
    }
  );

  router.get(
    '/ops/secrets/history',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
    }
  );

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

  router.get(
    '/ops/reports',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
    }
  );

  router.post(
    '/ops/reports/prune',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
    }
  );

  router.get(
    '/ops/state/manifest',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
    }
  );

  router.get(
    '/ops/state/backups',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
    }
  );

  router.post(
    '/ops/state/backup',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
    }
  );

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

  router.post(
    '/ops/state/restore',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
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
        return res.json({ ok: true, summary: clientoBookingStore.summarize({ tenantId: req.auth?.tenantId }) });
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
        return res
          .status(503)
          .json({ error: 'Message-intelligence-store är inte tillgänglig.' });
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
        return res
          .status(500)
          .json({ error: error?.message || 'Kunde inte köra enrichment.' });
      }
    }
  );

  router.get(
    '/ops/intelligence/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      if (!messageIntelligenceStore) {
        return res
          .status(503)
          .json({ error: 'Message-intelligence-store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth?.tenantId;
        const enrichmentCount = messageIntelligenceStore.countEnrichments({ tenantId });
        const totalMessages = ccoMailboxTruthStore
          ? (ccoMailboxTruthStore.listMessages({})?.length || 0)
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
        return res
          .status(503)
          .json({ error: 'Customer-preference-store är inte tillgänglig.' });
      }
      try {
        const tenantId = req.auth?.tenantId;
        if (!tenantId) {
          return res.status(400).json({ error: 'tenantId saknas i auth-context.' });
        }
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const preferred = String(
          body.preferredMailbox || DEFAULT_PREFERRED_MAILBOX
        ).toLowerCase();
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
        return res
          .status(500)
          .json({ error: error?.message || 'Kunde inte konsolidera kunder.' });
      }
    }
  );

  // OI3: Daily digest preview — bygger HTML-email från KPI-payload som
  // klienten redan hämtat. Tar `{ kpis, locale }` i bodyn, returnerar
  // antingen JSON {subject, html, text} eller direkt HTML när
  // `?format=html` skickas.
  router.post('/ops/digest/preview', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const kpis = body.kpis && typeof body.kpis === 'object' ? body.kpis : {};
      const locale = typeof body.locale === 'string' ? body.locale : 'sv';
      const tenantId = req.auth?.tenantId || kpis?.data?.tenantId || '';
      let tenantBrand = body.tenantBrand && typeof body.tenantBrand === 'object' ? body.tenantBrand : null;
      if (!tenantBrand && tenantConfigStore && typeof tenantConfigStore.getTenantConfig === 'function') {
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
          metadata: { locale, hasAlerts: Array.isArray(kpis?.data?.alerts) && kpis.data.alerts.length > 0 },
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
  });

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
        return res
          .status(503)
          .json({ error: 'graphSendConnector saknas (ARCANA_GRAPH_SEND_ENABLED ej satt eller credentials saknas).' });
      }
      try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const dryRun = Boolean(body.dryRun);
        const recipientsOverride = Array.isArray(body.recipients) && body.recipients.length > 0
          ? body.recipients
          : null;

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
        return res
          .status(500)
          .json({ error: error?.message || 'Kunde inte skicka digest.' });
      }
    }
  );

  return router;
}

module.exports = {
  createOpsRouter,
};
