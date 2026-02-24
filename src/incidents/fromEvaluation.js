const INCIDENT_SEVERITY = Object.freeze({
  L4: 'L4',
  L5: 'L5',
});

const INCIDENT_STATUS = Object.freeze({
  OPEN: 'open',
  ESCALATED: 'escalated',
  RESOLVED: 'resolved',
  ALL: 'all',
});

const INCIDENT_SLA_TARGET_MS = Object.freeze({
  [INCIDENT_SEVERITY.L4]: 4 * 60 * 60 * 1000,
  [INCIDENT_SEVERITY.L5]: 30 * 60 * 1000,
});

const RESOLVED_OWNER_DECISIONS = new Set(['approved_exception', 'false_positive']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toEpochMs(value, fallback = null) {
  const parsed = Date.parse(String(value || ''));
  if (Number.isFinite(parsed)) return parsed;
  return fallback;
}

function normalizeIncidentSeverity(value) {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized === INCIDENT_SEVERITY.L4) return INCIDENT_SEVERITY.L4;
  if (normalized === INCIDENT_SEVERITY.L5) return INCIDENT_SEVERITY.L5;
  return '';
}

function normalizeIncidentStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === INCIDENT_STATUS.OPEN) return INCIDENT_STATUS.OPEN;
  if (normalized === INCIDENT_STATUS.ESCALATED) return INCIDENT_STATUS.ESCALATED;
  if (normalized === INCIDENT_STATUS.RESOLVED) return INCIDENT_STATUS.RESOLVED;
  if (normalized === INCIDENT_STATUS.ALL) return INCIDENT_STATUS.ALL;
  return '';
}

function isIncidentOpenStatus(status) {
  return status === INCIDENT_STATUS.OPEN || status === INCIDENT_STATUS.ESCALATED;
}

function severityFromRiskLevel(riskLevel) {
  const level = Number(riskLevel || 0);
  return level >= 5 ? INCIDENT_SEVERITY.L5 : INCIDENT_SEVERITY.L4;
}

function statusFromOwnerDecision(ownerDecision) {
  const normalized = normalizeText(ownerDecision).toLowerCase();
  if (RESOLVED_OWNER_DECISIONS.has(normalized)) return INCIDENT_STATUS.RESOLVED;
  if (normalized === 'escalated') return INCIDENT_STATUS.ESCALATED;
  return INCIDENT_STATUS.OPEN;
}

function pickOwnerUserId(ownerActions) {
  if (!Array.isArray(ownerActions) || ownerActions.length === 0) return null;
  for (let index = ownerActions.length - 1; index >= 0; index -= 1) {
    const candidate = normalizeText(ownerActions[index]?.actorUserId || '');
    if (candidate) return candidate;
  }
  return null;
}

function buildSla({
  severity,
  status,
  openedAtMs,
  resolutionTs = null,
  nowMs = Date.now(),
}) {
  const targetMs = Number(INCIDENT_SLA_TARGET_MS[severity] || INCIDENT_SLA_TARGET_MS.L4);
  const deadlineMs = openedAtMs + targetMs;
  const deadline = new Date(deadlineMs).toISOString();
  const elapsedMs = Math.max(0, nowMs - openedAtMs);
  const remainingMs = deadlineMs - nowMs;

  let state = 'ok';
  if (status === INCIDENT_STATUS.RESOLVED) {
    state = 'resolved';
  } else if (remainingMs <= 0) {
    state = 'breached';
  } else {
    const remainingRatio = remainingMs / targetMs;
    if (remainingRatio <= 0.25) state = 'critical';
    else if (remainingRatio <= 0.5) state = 'warn';
  }

  const resolutionMs = toEpochMs(resolutionTs, null);
  const breached =
    status === INCIDENT_STATUS.RESOLVED
      ? Number.isFinite(resolutionMs) && resolutionMs > deadlineMs
      : remainingMs <= 0;

  return {
    targetMs,
    targetMinutes: Math.round(targetMs / 60000),
    deadline,
    remainingMs,
    elapsedMs,
    state,
    breached,
  };
}

function buildIncidentFromEvaluation(evaluation, { nowMs = Date.now() } = {}) {
  if (!evaluation || typeof evaluation !== 'object') return null;

  const riskLevel = Number(evaluation.riskLevel || 0);
  if (riskLevel < 4) return null;

  const incidentId = normalizeText(evaluation.id);
  if (!incidentId) return null;

  const openedAt =
    toIso(evaluation.evaluatedAt) ||
    toIso(evaluation.updatedAt) ||
    new Date(nowMs).toISOString();
  const updatedAt = toIso(evaluation.updatedAt) || openedAt;
  const openedAtMs = toEpochMs(openedAt, nowMs);

  const ownerDecision = normalizeText(evaluation.ownerDecision || 'pending').toLowerCase() || 'pending';
  const severity = severityFromRiskLevel(riskLevel);
  const status = statusFromOwnerDecision(ownerDecision);
  const resolutionTs = status === INCIDENT_STATUS.RESOLVED ? updatedAt : null;
  const ownerUserId = pickOwnerUserId(evaluation.ownerActions);

  return {
    id: incidentId,
    sourceEvaluationId: incidentId,
    tenantId: normalizeText(evaluation.tenantId),
    templateId: normalizeText(evaluation.templateId),
    templateVersionId: normalizeText(evaluation.templateVersionId),
    category: normalizeText(evaluation.category),
    riskLevel,
    decision: normalizeText(evaluation.decision || 'blocked'),
    reasonCodes: Array.isArray(evaluation.reasonCodes) ? [...evaluation.reasonCodes] : [],
    severity,
    status,
    ownerDecision,
    owner: ownerUserId
      ? {
          userId: ownerUserId,
        }
      : null,
    ownerActionsCount: Array.isArray(evaluation.ownerActions) ? evaluation.ownerActions.length : 0,
    openedAt,
    updatedAt,
    resolutionTs,
    sla: buildSla({
      severity,
      status,
      openedAtMs,
      resolutionTs,
      nowMs,
    }),
  };
}

function compareIncidents(a, b) {
  const aOpen = isIncidentOpenStatus(a?.status) ? 0 : 1;
  const bOpen = isIncidentOpenStatus(b?.status) ? 0 : 1;
  if (aOpen !== bOpen) return aOpen - bOpen;

  const aSla = normalizeText(a?.sla?.state).toLowerCase();
  const bSla = normalizeText(b?.sla?.state).toLowerCase();
  const slaRank = {
    breached: 0,
    critical: 1,
    warn: 2,
    ok: 3,
    resolved: 4,
  };
  const aSlaRank = Object.prototype.hasOwnProperty.call(slaRank, aSla) ? slaRank[aSla] : 5;
  const bSlaRank = Object.prototype.hasOwnProperty.call(slaRank, bSla) ? slaRank[bSla] : 5;
  if (aSlaRank !== bSlaRank) return aSlaRank - bSlaRank;

  const aSeverity = normalizeIncidentSeverity(a?.severity) === INCIDENT_SEVERITY.L5 ? 0 : 1;
  const bSeverity = normalizeIncidentSeverity(b?.severity) === INCIDENT_SEVERITY.L5 ? 0 : 1;
  if (aSeverity !== bSeverity) return aSeverity - bSeverity;

  const aDeadline = toEpochMs(a?.sla?.deadline, Number.MAX_SAFE_INTEGER);
  const bDeadline = toEpochMs(b?.sla?.deadline, Number.MAX_SAFE_INTEGER);
  if (aDeadline !== bDeadline) return aDeadline - bDeadline;

  const aOpenedAt = toEpochMs(a?.openedAt, 0);
  const bOpenedAt = toEpochMs(b?.openedAt, 0);
  if (aOpenedAt !== bOpenedAt) return bOpenedAt - aOpenedAt;

  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

module.exports = {
  INCIDENT_SEVERITY,
  INCIDENT_STATUS,
  INCIDENT_SLA_TARGET_MS,
  buildIncidentFromEvaluation,
  compareIncidents,
  isIncidentOpenStatus,
  normalizeIncidentSeverity,
  normalizeIncidentStatus,
};
