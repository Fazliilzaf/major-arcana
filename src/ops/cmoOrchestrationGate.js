'use strict';

const LAUNCH_GATE_MIN_SCORE = 75;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DEFAULT_MQL_DEFINITION =
  'MQL: lead med uttryckt intresse + kontaktbarhet + match mot ICP, ej klinisk behandlingsrådgivning.';
const DEFAULT_SQL_DEFINITION =
  'SQL: MQL + budget/timing bekräftad + mötesbokning eller aktiv dialog med beslutsfattare.';

function evaluateCmoLaunchGate(readiness = {}) {
  const source = asObject(readiness.operationalReadiness || readiness);
  const score = toNumber(source.score, NaN);
  const band = normalizeText(source.band).toLowerCase() || 'unknown';
  const goAllowed = source.goAllowed === true;

  const scoreKnown = Number.isFinite(score);
  const allowed =
    goAllowed || (scoreKnown && score >= LAUNCH_GATE_MIN_SCORE && band === 'controlled_go');

  return {
    gate: 'cao_launch_readiness',
    allowed,
    blocked: !allowed,
    score: scoreKnown ? score : null,
    band,
    goAllowed,
    minScore: LAUNCH_GATE_MIN_SCORE,
    reason: allowed
      ? 'Operational readiness tillåter launch-förslag med OWNER-godkännande.'
      : `Launch gate blockerad — readiness ${scoreKnown ? score : 'okänd'}/${LAUNCH_GATE_MIN_SCORE} (band=${band}).`,
  };
}

function evaluateCooIncidentCampaignPause(incidentSummary = {}) {
  const source = asObject(incidentSummary);
  const p0Open = toNumber(source.p0Open ?? source.criticalOpen, 0);
  const p1Open = toNumber(source.p1Open ?? source.highOpen, 0);
  const required = p0Open > 0 || p1Open > 0;

  return {
    gate: 'coo_incident_pause',
    required,
    p0Open,
    p1Open,
    actionType: 'pause_all_external_campaigns',
    recommendation: required
      ? 'Pausa externa kampanjer tills P0/P1-incidenter är under kontroll.'
      : null,
    reason: required
      ? `${p0Open} P0 och ${p1Open} P1 incidenter öppna — marknadsaktivitet bör pausas.`
      : 'Inga öppna P0/P1-incidenter.',
  };
}

function evaluateCfoBudgetGate({ marketingBudget = {}, spendProposal = {} } = {}) {
  const budget = asObject(marketingBudget);
  const proposal = asObject(spendProposal);
  const cap = toNumber(budget.monthlyCap ?? budget.cap, NaN);
  const proposed = toNumber(proposal.amount ?? proposal.total, NaN);
  const hasCap = Number.isFinite(cap) && cap > 0;
  const hasProposal = Number.isFinite(proposed) && proposed > 0;
  const overCap = hasCap && hasProposal && proposed > cap;

  return {
    gate: 'cfo_budget',
    allowed: !overCap,
    requiresOwnerApproval: overCap,
    cap: hasCap ? cap : null,
    proposed: hasProposal ? proposed : null,
    currency: normalizeText(budget.currency) || 'SEK',
    reason: overCap
      ? `Spend-förslag ${proposed} överstiger tak ${cap} — kräver OWNER-godkännande.`
      : hasCap
        ? `Spend-förslag inom budgettak (${cap}).`
        : 'Inget budgettak konfigurerat.',
  };
}

function buildCcoHandoffContext(snapshot = {}) {
  const handoff = asObject(snapshot.ccoCommercialHandoff || snapshot.ccoHandoff);
  return {
    gate: 'cco_handoff',
    mqlDefinition: normalizeText(handoff.mqlDefinition) || DEFAULT_MQL_DEFINITION,
    sqlDefinition: normalizeText(handoff.sqlDefinition) || DEFAULT_SQL_DEFINITION,
    pipelineStages: asArray(handoff.pipelineStages).length
      ? asArray(handoff.pipelineStages)
      : ['lead', 'mql', 'sql', 'opportunity', 'won'],
    battlecardRequested: handoff.battlecardRequested !== false,
    source: normalizeText(handoff.source) || 'shared_definition_v1',
  };
}

function applyCmoOrchestrationGates({
  campaigns = [],
  scheduleAllowed = false,
  snapshot = {},
} = {}) {
  const launchGate = evaluateCmoLaunchGate(snapshot);
  const incidentPause = evaluateCooIncidentCampaignPause(snapshot.incidentSummary);
  const budgetGate = evaluateCfoBudgetGate({
    marketingBudget: snapshot.marketingBudget,
    spendProposal: snapshot.spendProposal,
  });
  const ccoHandoff = buildCcoHandoffContext(snapshot);

  let nextScheduleAllowed = scheduleAllowed && launchGate.allowed && !incidentPause.required;
  if (budgetGate.requiresOwnerApproval) {
    nextScheduleAllowed = false;
  }

  const gatedCampaigns = asArray(campaigns).map((campaign) => {
    const next = { ...campaign };
    if (incidentPause.required) {
      next.readiness = 'paused_incident';
      next.launchBlocked = true;
      next.pauseReason = incidentPause.reason;
    } else if (!launchGate.allowed && (next.readiness === 'ready' || next.complianceCleared)) {
      next.readiness = 'launch_gate_blocked';
      next.launchBlocked = true;
      next.pauseReason = launchGate.reason;
    } else if (budgetGate.requiresOwnerApproval) {
      next.requiresOwnerApproval = true;
      next.budgetGate = 'over_cap';
    }
    return next;
  });

  const warnings = [];
  if (!launchGate.allowed) warnings.push(launchGate.reason);
  if (incidentPause.required) warnings.push(incidentPause.reason);
  if (budgetGate.requiresOwnerApproval) warnings.push(budgetGate.reason);

  return {
    orchestrationGates: {
      launchGate,
      incidentPause,
      budgetGate,
      ccoHandoff,
    },
    campaigns: gatedCampaigns,
    scheduleAllowed: nextScheduleAllowed,
    pauseAllExternalCampaigns: incidentPause.required,
    warnings,
  };
}

async function buildOrchestrationSnapshotFromHydration({
  baseSnapshot = {},
  intent = '',
  prompt = '',
  buildReadiness = null,
} = {}) {
  const base = asObject(baseSnapshot);
  let readiness = asObject(base.readiness);
  if (typeof buildReadiness === 'function' && !Number.isFinite(Number(readiness.score))) {
    try {
      readiness = asObject(await buildReadiness());
    } catch {
      readiness = {};
    }
  }

  let incidentSummary = asObject(base.incidentSummary);
  if (!Number.isFinite(Number(incidentSummary.p0Open)) && Array.isArray(base.openIncidents)) {
    incidentSummary = {
      p0Open: base.openIncidents.filter((item) => normalizeText(item?.priority) === 'P0').length,
      p1Open: base.openIncidents.filter((item) => normalizeText(item?.priority) === 'P1').length,
    };
  }

  return {
    ...base,
    orchestratorContext: {
      intent: normalizeText(intent),
      prompt: normalizeText(prompt),
    },
    operationalReadiness: {
      score: Number.isFinite(Number(readiness.score)) ? Number(readiness.score) : null,
      band: normalizeText(readiness.band).toLowerCase() || 'unknown',
      goAllowed: readiness.goAllowed === true,
    },
    readiness,
    incidentSummary,
    ccoCommercialHandoff: asObject(base.ccoCommercialHandoff).mqlDefinition
      ? asObject(base.ccoCommercialHandoff)
      : { battlecardRequested: true },
    marketingBudget: base.marketingBudget || null,
    spendProposal: base.spendProposal || null,
  };
}

module.exports = {
  LAUNCH_GATE_MIN_SCORE,
  DEFAULT_MQL_DEFINITION,
  DEFAULT_SQL_DEFINITION,
  evaluateCmoLaunchGate,
  evaluateCooIncidentCampaignPause,
  evaluateCfoBudgetGate,
  buildCcoHandoffContext,
  applyCmoOrchestrationGates,
  buildOrchestrationSnapshotFromHydration,
};
