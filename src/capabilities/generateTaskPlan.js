const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function pickPriority(rank) {
  if (rank <= 0) return 'P0';
  if (rank === 1) return 'P1';
  if (rank === 2) return 'P2';
  return 'P3';
}

function priorityWeight(priority) {
  switch (String(priority || '').toUpperCase()) {
    case 'P0':
      return 400;
    case 'P1':
      return 300;
    case 'P2':
      return 200;
    default:
      return 100;
  }
}

function riskLevelFromScore(score) {
  const normalized = Math.max(0, Math.round(toNumber(score, 0)));
  if (normalized >= 80) return 'critical';
  if (normalized >= 45) return 'high';
  if (normalized >= 20) return 'medium';
  return 'low';
}

function buildTask({
  id,
  title,
  priority,
  riskLevel,
  recommendedAction,
  evidence = '',
  score = 0,
}) {
  return {
    id,
    title,
    priority,
    riskLevel,
    recommendedAction,
    evidence: normalizeText(evidence),
    score: Math.max(0, Math.round(toNumber(score, 0))),
  };
}

function buildRiskHighlight({
  criticalIncidents,
  breachedIncidents,
  highRiskOpenReviews,
  openReviewsTotal,
  openIncidentsTotal,
  kpiSignals,
}) {
  const riskScore =
    criticalIncidents * 32 +
    breachedIncidents * 20 +
    highRiskOpenReviews * 10 +
    kpiSignals * 12;
  const level = riskLevelFromScore(riskScore);
  const summaryParts = [
    `${criticalIncidents} kritiska incidenter`,
    `${breachedIncidents} SLA-brott`,
    `${highRiskOpenReviews}/${openReviewsTotal} high/critical öppna reviews`,
    `${openIncidentsTotal} öppna incidenter`,
  ];
  return {
    level,
    score: Math.max(0, Math.min(100, riskScore)),
    summary: summaryParts.join(', '),
    criticalOpenIncidents: criticalIncidents,
    breachedIncidents,
    highRiskOpenReviews,
    openReviewsTotal,
    openIncidentsTotal,
    kpiSignals,
  };
}

function summarizeKpiSignals(kpi = {}) {
  const signals = [];
  const noGo = toNumber(kpi.triggeredNoGoCount, 0);
  const sloBreaches = toNumber(kpi.sloBreaches, 0);
  const unresolved = toNumber(kpi.openUnresolvedIncidents, 0);
  const highCritical = toNumber(kpi.highCriticalOpenReviews, 0);

  if (noGo > 0) signals.push(`no-go triggers: ${noGo}`);
  if (sloBreaches > 0) signals.push(`SLO-brott: ${sloBreaches}`);
  if (unresolved > 0) signals.push(`öppna incidenter: ${unresolved}`);
  if (highCritical > 0) signals.push(`high/critical reviews: ${highCritical}`);

  return {
    count: signals.length,
    text: signals.join(', '),
  };
}

function safeSnapshot(source = {}) {
  const snapshot = source && typeof source === 'object' ? source : {};
  return {
    openReviews: asArray(snapshot.openReviews),
    incidents: asArray(snapshot.incidents),
    latestTemplateChanges: asArray(snapshot.latestTemplateChanges),
    kpi: snapshot.kpi && typeof snapshot.kpi === 'object' ? snapshot.kpi : {},
  };
}

class GenerateTaskPlanCapability extends BaseCapability {
  static name = 'GenerateTaskPlan';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      maxTasks: { type: 'integer', minimum: 1, maximum: 5 },
      includeEvidence: { type: 'boolean' },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: {
        type: 'object',
        required: ['tasks', 'riskHighlight', 'recommendedActions', 'summary', 'generatedAt'],
        additionalProperties: true,
        properties: {
          tasks: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: {
              type: 'object',
              required: ['id', 'title', 'priority', 'riskLevel', 'recommendedAction'],
              additionalProperties: true,
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 120 },
                title: { type: 'string', minLength: 1, maxLength: 200 },
                priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
                riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                recommendedAction: { type: 'string', minLength: 1, maxLength: 240 },
                evidence: { type: 'string', maxLength: 240 },
              },
            },
          },
          riskHighlight: {
            type: 'object',
            required: ['level', 'summary'],
            additionalProperties: true,
            properties: {
              level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              summary: { type: 'string', minLength: 1, maxLength: 300 },
              score: { type: 'number', minimum: 0, maximum: 100 },
            },
          },
          recommendedActions: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: {
              type: 'string',
              minLength: 1,
              maxLength: 240,
            },
          },
          summary: {
            type: 'string',
            minLength: 1,
            maxLength: 500,
          },
          generatedAt: {
            type: 'string',
            minLength: 1,
            maxLength: 50,
          },
        },
      },
      metadata: {
        type: 'object',
        required: ['capability', 'version', 'channel'],
        additionalProperties: true,
        properties: {
          capability: { type: 'string', minLength: 1, maxLength: 120 },
          version: { type: 'string', minLength: 1, maxLength: 40 },
          channel: { type: 'string', minLength: 1, maxLength: 40 },
          tenantId: { type: 'string', minLength: 1, maxLength: 120 },
          requestId: { type: 'string', minLength: 1, maxLength: 120 },
          correlationId: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
      warnings: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'string',
          minLength: 1,
          maxLength: 240,
        },
      },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input = safeContext.input && typeof safeContext.input === 'object' ? safeContext.input : {};
    const snapshot = safeSnapshot(safeContext.systemStateSnapshot);
    const openReviews = snapshot.openReviews;
    const incidents = snapshot.incidents;
    const latestTemplateChanges = snapshot.latestTemplateChanges;
    const kpi = snapshot.kpi;

    const highRiskOpenReviews = openReviews.filter(
      (item) => toNumber(item?.riskLevel, 0) >= 4
    ).length;
    const blockedOpenReviews = openReviews.filter(
      (item) => normalizeText(item?.decision).toLowerCase() === 'blocked'
    ).length;
    const criticalIncidents = incidents.filter((item) => {
      const severity = normalizeText(item?.severity).toUpperCase();
      return severity === 'L5';
    }).length;
    const breachedIncidents = incidents.filter((item) => {
      const decision = normalizeText(item?.ownerDecision).toLowerCase();
      return decision === 'escalate_to_owner' || decision === 'escalate_to_medical';
    }).length;
    const staleTemplateChanges = latestTemplateChanges.filter((item) => {
      const updatedAt = toIso(item?.updatedAt);
      if (!updatedAt) return true;
      const ageMs = Date.now() - Date.parse(updatedAt);
      return ageMs > 5 * 24 * 60 * 60 * 1000;
    }).length;

    const kpiSignals = summarizeKpiSignals(kpi);
    const riskHighlight = buildRiskHighlight({
      criticalIncidents,
      breachedIncidents,
      highRiskOpenReviews,
      openReviewsTotal: openReviews.length,
      openIncidentsTotal: incidents.length,
      kpiSignals: kpiSignals.count,
    });

    const taskCandidates = [];

    if (criticalIncidents > 0) {
      taskCandidates.push(
        buildTask({
          id: 'triage_l5_incidents',
          title: `Hantera ${criticalIncidents} kritiska incidenter`,
          priority: 'P0',
          riskLevel: 'critical',
          recommendedAction: 'Tillsätt owner, eskalera och stäng kritiska incidenter inom samma dag.',
          evidence: `${criticalIncidents} öppna L5 incidenter`,
          score: 95,
        })
      );
    }

    if (breachedIncidents > 0) {
      taskCandidates.push(
        buildTask({
          id: 'close_breached_incidents',
          title: `Stäng ${breachedIncidents} incidenter med eskalerad owner-action`,
          priority: 'P1',
          riskLevel: 'high',
          recommendedAction: 'Verifiera root cause, applicera åtgärd och uppdatera incident-status.',
          evidence: `${breachedIncidents} incidenter med aktiv eskalering`,
          score: 82,
        })
      );
    }

    if (highRiskOpenReviews > 0) {
      taskCandidates.push(
        buildTask({
          id: 'review_high_risk_evaluations',
          title: `Granska ${highRiskOpenReviews} high/critical öppna risk-reviews`,
          priority: 'P1',
          riskLevel: riskHighlight.level === 'critical' ? 'critical' : 'high',
          recommendedAction: 'Prioritera owner actions på blockerade och review-required utfall.',
          evidence: `${highRiskOpenReviews}/${openReviews.length} öppna reviews risk>=4`,
          score: 78,
        })
      );
    }

    if (blockedOpenReviews > 0 || staleTemplateChanges > 0) {
      taskCandidates.push(
        buildTask({
          id: 'template_change_control',
          title: 'Stabilisera malländringar och blockerade versioner',
          priority: 'P2',
          riskLevel: riskHighlight.level === 'low' ? 'medium' : riskHighlight.level,
          recommendedAction:
            'Kör diff/rollback på senaste ändringar och säkerställ korrekt owner-signoff.',
          evidence: `${blockedOpenReviews} blockerade reviews, ${staleTemplateChanges} äldre ändringar`,
          score: 64,
        })
      );
    }

    if (kpiSignals.count > 0) {
      taskCandidates.push(
        buildTask({
          id: 'kpi_anomaly_followup',
          title: 'Följ upp KPI-avvikelser i driftpanelen',
          priority: 'P2',
          riskLevel: riskHighlight.level === 'critical' ? 'high' : 'medium',
          recommendedAction: 'Bekräfta orsaker till KPI-avvikelser och initiera korrigerande plan.',
          evidence: kpiSignals.text,
          score: 58,
        })
      );
    }

    if (taskCandidates.length === 0) {
      taskCandidates.push(
        buildTask({
          id: 'preventive_control_sweep',
          title: 'Kör preventiv kontrollsvep för risk, incidents och mallar',
          priority: 'P2',
          riskLevel: 'low',
          recommendedAction: 'Verifiera att inga nya blockerare uppstått och dokumentera status.',
          evidence: 'Inga akuta avvikelser i underlaget.',
          score: 40,
        })
      );
    }

    const requestedMaxTasks = Math.max(1, Math.min(5, toNumber(input.maxTasks, 5)));
    const includeEvidence = input.includeEvidence !== false;
    const tasks = taskCandidates
      .sort((a, b) => {
        const byPriority = priorityWeight(b.priority) - priorityWeight(a.priority);
        if (byPriority !== 0) return byPriority;
        return toNumber(b.score, 0) - toNumber(a.score, 0);
      })
      .slice(0, requestedMaxTasks)
      .map((task, index) => ({
        ...task,
        priority: task.priority || pickPriority(index),
        evidence: includeEvidence ? task.evidence : '',
      }));

    const recommendedActions = Array.from(
      new Set(tasks.map((task) => normalizeText(task.recommendedAction)).filter(Boolean))
    ).slice(0, 5);

    const summary = [
      `Taskplan genererad för tenant ${normalizeText(safeContext.tenantId) || 'unknown'}.`,
      `Risknivå: ${riskHighlight.level}.`,
      `Fokus: ${tasks.map((task) => task.title).join(' | ')}`,
    ].join(' ');

    const warnings = [];
    if (staleTemplateChanges > 0) {
      warnings.push(`Underlag innehåller ${staleTemplateChanges} äldre malländringar (>5 dagar).`);
    }
    if (openReviews.length === 0 && incidents.length === 0) {
      warnings.push('Inga öppna reviews eller incidenter hittades i snapshot.');
    }

    return {
      data: {
        tasks,
        riskHighlight,
        recommendedActions,
        summary,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: GenerateTaskPlanCapability.name,
        version: GenerateTaskPlanCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
        requestId: normalizeText(safeContext.requestId) || '',
        correlationId: normalizeText(safeContext.correlationId) || '',
      },
      warnings,
    };
  }
}

module.exports = {
  GenerateTaskPlanCapability,
  generateTaskPlanCapability: GenerateTaskPlanCapability,
};
