'use strict';

const { ROLE_OWNER } = require('../security/roles');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isRecentWithinDays(ts, days, nowMs = Date.now()) {
  const iso = toIso(ts);
  if (!iso) return false;
  const ageMs = nowMs - new Date(iso).getTime();
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}

function pickReadinessBand(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 'unknown';
  if (value < 75) return 'no_go';
  if (value < 85) return 'limited_beta';
  return 'controlled_go';
}

function riskLevelRank(level) {
  const normalized = normalizeText(level).toUpperCase();
  const map = { L1: 1, L2: 2, L3: 3, L4: 4, L5: 5 };
  return map[normalized] || 0;
}

const CAO_SCHEDULER_JOB_IDS = Object.freeze([
  'cao_daily_quality_gate',
  'cao_sla_risk_scan',
  'cao_missing_dod_scan',
]);

const SHARED_OPERATIONAL_READINESS_DISCLAIMER =
  'Operational core delas mellan CAO och monitor evidence. Go/No-Go-beslut = /api/v1/monitor/readiness.';

function buildCaoSchedulerObservability(schedulerStatus = null) {
  const jobs = Array.isArray(schedulerStatus?.jobs) ? schedulerStatus.jobs : [];
  const jobMap = new Map(jobs.map((job) => [normalizeText(job?.id), job]));
  const caoJobs = CAO_SCHEDULER_JOB_IDS.map((jobId) => {
    const job = jobMap.get(jobId) || null;
    const lastSuccessAt = toIso(job?.lastSuccessAt);
    const lastFailureAt = toIso(job?.lastFailureAt);
    const enabled = Boolean(job?.enabled);
    const healthy = enabled && Boolean(lastSuccessAt);
    return {
      id: jobId,
      enabled,
      lastSuccessAt,
      lastFailureAt,
      healthy,
    };
  });
  const unhealthy = caoJobs.filter((job) => !job.healthy);
  let status = 'green';
  if (unhealthy.length >= 2) status = 'red';
  else if (unhealthy.length === 1) status = 'yellow';

  return {
    status,
    caoJobs,
    allHealthy: unhealthy.length === 0,
    affectsReadinessScore: false,
    summary: unhealthy.length
      ? `${unhealthy.length} CAO scheduler-jobb saknar färsk success-run`
      : 'Alla CAO scheduler-jobb har färsk success-run',
  };
}

async function gatherOperationalReadinessEvidence({
  tenantId,
  templateStore = null,
  authStore = null,
  scheduler = null,
  adminTasksStore = null,
  config = null,
} = {}) {
  const normalizedTenantId = normalizeText(tenantId) || 'default';
  const schedulerStatus =
    scheduler && typeof scheduler.getStatus === 'function' ? scheduler.getStatus() : null;

  let incidentSummary = null;
  let openIncidents = [];
  if (templateStore && typeof templateStore.summarizeIncidents === 'function') {
    incidentSummary = await templateStore.summarizeIncidents({ tenantId: normalizedTenantId });
  }
  if (templateStore && typeof templateStore.listIncidents === 'function') {
    openIncidents = await templateStore.listIncidents({
      tenantId: normalizedTenantId,
      status: 'open',
      limit: 200,
    });
  }

  let riskSummary = null;
  if (templateStore && typeof templateStore.summarizeRisk === 'function') {
    riskSummary = await templateStore.summarizeRisk({ tenantId: normalizedTenantId, minRiskLevel: 1 });
  }

  let adminTasks = [];
  if (adminTasksStore && typeof adminTasksStore.listTasks === 'function') {
    adminTasks = await adminTasksStore.listTasks({ tenantId: normalizedTenantId, limit: 200 });
  }

  let auditIntegrityOk = true;
  if (authStore && typeof authStore.verifyAuditIntegrity === 'function') {
    const integrity = await authStore.verifyAuditIntegrity({ maxIssues: 5 });
    auditIntegrityOk = integrity?.ok === true;
  }

  let ownerMfaOk = true;
  let ownersWithoutMfa = 0;
  if (
    authStore &&
    typeof authStore.listTenantMembers === 'function' &&
    config?.authOwnerMfaRequired !== false
  ) {
    const members = await authStore.listTenantMembers(normalizedTenantId);
    const activeOwners = (Array.isArray(members) ? members : []).filter(
      (item) =>
        normalizeText(item?.membership?.role).toUpperCase() === ROLE_OWNER &&
        normalizeText(item?.membership?.status).toLowerCase() === 'active'
    );
    const missing = activeOwners.filter(
      (item) => !item?.user?.mfaRequired || !item?.user?.mfaConfigured
    );
    ownersWithoutMfa = missing.length;
    ownerMfaOk = ownersWithoutMfa === 0;
  }

  const breachedOpen = Number(incidentSummary?.totals?.breachedOpen || 0);
  const unownedOpen = (Array.isArray(openIncidents) ? openIncidents : []).filter(
    (item) => !normalizeText(item?.owner?.userId)
  ).length;
  const highCriticalOpen = Number(riskSummary?.totals?.highCriticalOpen || 0);
  const flaggedTasks = (Array.isArray(adminTasks) ? adminTasks : []).filter((task) => {
    const status = normalizeText(task.status).toLowerCase();
    if (status === 'done' || status === 'completed') return false;
    return !normalizeText(task.owner) || !normalizeText(task.dod) || !normalizeText(task.nextStep);
  });

  return {
    tenantId: normalizedTenantId,
    schedulerStatus,
    breachedOpen,
    unownedOpen,
    highCriticalOpen,
    flaggedAdminTasks: flaggedTasks.length,
    flaggedTasks,
    schedulerEnabled: Boolean(schedulerStatus?.enabled),
    schedulerStarted: Boolean(schedulerStatus?.started),
    auditIntegrityOk,
    ownerMfaOk,
    ownersWithoutMfa,
  };
}

function computeOperationalReadinessFromEvidence(evidence = {}) {
  const blockers = [];
  let score = 100;

  if (!evidence.schedulerEnabled || !evidence.schedulerStarted) {
    score -= 15;
    blockers.push({
      id: 'scheduler_not_running',
      label: 'Scheduler är inte aktiv',
      severity: 'high',
    });
  }
  if (Number(evidence.breachedOpen || 0) > 0) {
    score -= Math.min(20, Number(evidence.breachedOpen) * 5);
    blockers.push({
      id: 'incidents_sla_breached',
      label: `${evidence.breachedOpen} incidenter har SLA-breach`,
      severity: 'high',
    });
  }
  if (Number(evidence.unownedOpen || 0) > 0) {
    score -= Math.min(10, Number(evidence.unownedOpen) * 2);
    blockers.push({
      id: 'incidents_unowned',
      label: `${evidence.unownedOpen} öppna incidenter saknar ägare`,
      severity: Number(evidence.unownedOpen) >= 3 ? 'high' : 'medium',
    });
  }
  if (Number(evidence.highCriticalOpen || 0) > 0) {
    score -= Math.min(15, Number(evidence.highCriticalOpen) * 3);
    blockers.push({
      id: 'risk_high_critical_open',
      label: `${evidence.highCriticalOpen} öppna high/critical risk-ärenden`,
      severity: 'high',
    });
  }
  if (Number(evidence.flaggedAdminTasks || 0) > 0) {
    score -= Math.min(10, Number(evidence.flaggedAdminTasks) * 2);
    blockers.push({
      id: 'admin_tasks_incomplete_metadata',
      label: `${evidence.flaggedAdminTasks} adminuppgifter saknar owner/DoD/nästa steg`,
      severity: 'medium',
    });
  }
  if (evidence.auditIntegrityOk === false) {
    score -= 10;
    blockers.push({
      id: 'audit_integrity_failed',
      label: 'Audit integrity check misslyckades',
      severity: 'high',
    });
  }
  if (evidence.ownerMfaOk === false) {
    score -= 8;
    blockers.push({
      id: 'owner_mfa_missing',
      label: `${Number(evidence.ownersWithoutMfa || 0)} owner(s) saknar MFA`,
      severity: 'high',
    });
  }

  const normalizedScore = Math.max(0, Math.min(100, Number(score.toFixed(2))));
  const band = pickReadinessBand(normalizedScore);
  const goAllowed =
    band === 'controlled_go' && blockers.filter((item) => item.severity === 'high').length === 0;

  return {
    score: normalizedScore,
    band,
    goAllowed,
    blockers: blockers.slice(0, 15),
    ownerDecisionRequired: !goAllowed,
  };
}

async function evaluateTenantOperationalReadiness(deps = {}) {
  const evidence = await gatherOperationalReadinessEvidence(deps);
  const computed = computeOperationalReadinessFromEvidence(evidence);
  const caoScheduler = buildCaoSchedulerObservability(evidence.schedulerStatus);
  return {
    ...computed,
    capturedAt: new Date().toISOString(),
    evidence: {
      breachedOpen: evidence.breachedOpen,
      unownedOpen: evidence.unownedOpen,
      highCriticalOpen: evidence.highCriticalOpen,
      flaggedAdminTasks: evidence.flaggedAdminTasks,
      schedulerEnabled: evidence.schedulerEnabled,
      schedulerStarted: evidence.schedulerStarted,
      auditIntegrityOk: evidence.auditIntegrityOk,
      ownerMfaOk: evidence.ownerMfaOk,
    },
    caoSchedulerObservability: caoScheduler,
  };
}

function buildReadinessAlignment({
  monitorScore = null,
  operationalScore = null,
  monitorGoAllowed = null,
  operationalGoAllowed = null,
} = {}) {
  const monitor = Number(monitorScore);
  const operational = Number(operationalScore);
  const scoreDelta =
    Number.isFinite(monitor) && Number.isFinite(operational)
      ? Number((monitor - operational).toFixed(2))
      : null;
  return {
    monitorAuthoritative: true,
    monitorEndpoint: '/api/v1/monitor/readiness',
    monitorScore: Number.isFinite(monitor) ? monitor : null,
    operationalScore: Number.isFinite(operational) ? operational : null,
    scoreDelta,
    goAllowedDelta:
      monitorGoAllowed === null || operationalGoAllowed === null
        ? null
        : monitorGoAllowed === operationalGoAllowed
          ? 'aligned'
          : 'diverged',
    disclaimer: SHARED_OPERATIONAL_READINESS_DISCLAIMER,
  };
}

async function buildCaoReadinessSnapshot(deps = {}) {
  const operational = await evaluateTenantOperationalReadiness(deps);
  return {
    ...operational,
    source: 'shared_operational_core',
    monitorParity: 'evidence_aligned',
    monitorEndpoint: '/api/v1/monitor/readiness',
    disclaimer: SHARED_OPERATIONAL_READINESS_DISCLAIMER,
    alignment: buildReadinessAlignment({
      operationalScore: operational.score,
      operationalGoAllowed: operational.goAllowed,
    }),
  };
}

module.exports = {
  buildCaoReadinessSnapshot,
  evaluateTenantOperationalReadiness,
  gatherOperationalReadinessEvidence,
  computeOperationalReadinessFromEvidence,
  buildReadinessAlignment,
  buildCaoSchedulerObservability,
  pickReadinessBand,
  riskLevelRank,
  isRecentWithinDays,
  CAO_SCHEDULER_JOB_IDS,
  SHARED_OPERATIONAL_READINESS_DISCLAIMER,
  CAO_LIGHT_READINESS_DISCLAIMER: SHARED_OPERATIONAL_READINESS_DISCLAIMER,
};
