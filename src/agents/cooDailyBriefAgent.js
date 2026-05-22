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

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toSeverityBreakdown(source = {}) {
  const safe = asObject(source);
  return {
    L3: Math.max(0, toNumber(safe.L3, 0)),
    L4: Math.max(0, toNumber(safe.L4, 0)),
    L5: Math.max(0, toNumber(safe.L5, 0)),
  };
}

function pickPriorityLevel({ incidentRisk = '', taskRisk = '', tasks = [] } = {}) {
  const normalizedIncidentRisk = normalizeText(incidentRisk).toLowerCase();
  const normalizedTaskRisk = normalizeText(taskRisk).toLowerCase();
  const hasP0 = asArray(tasks).some((task) => normalizeText(task?.priority).toUpperCase() === 'P0');
  const hasP1 = asArray(tasks).some((task) => normalizeText(task?.priority).toUpperCase() === 'P1');

  if (
    normalizedIncidentRisk === 'kritisk' ||
    normalizedIncidentRisk === 'critical' ||
    normalizedIncidentRisk === 'hog' ||
    normalizedIncidentRisk === 'high' ||
    normalizedTaskRisk === 'critical' ||
    normalizedTaskRisk === 'high' ||
    hasP0
  ) {
    return 'High';
  }

  if (
    normalizedIncidentRisk === 'medel' ||
    normalizedIncidentRisk === 'medium' ||
    normalizedTaskRisk === 'medium' ||
    hasP1
  ) {
    return 'Medium';
  }

  return 'Low';
}

function createExecutiveSummary({
  incidentSummary = {},
  taskPlan = {},
  priorityLevel = 'Low',
} = {}) {
  const incidentRisk = normalizeText(incidentSummary.escalationRisk) || 'okand';
  const severity = toSeverityBreakdown(incidentSummary.severityBreakdown);
  const tasks = asArray(taskPlan.tasks);
  const topTask = normalizeText(tasks[0]?.title);
  const recommended = asArray(incidentSummary.recommendations)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 1)[0];

  const segments = [
    `Daily brief priority ${priorityLevel}.`,
    `Incidentrisk ${incidentRisk} med L5=${severity.L5}, L4=${severity.L4}, L3=${severity.L3}.`,
    `${tasks.length} prioriterade task(s) finns i planen.`,
  ];

  if (topTask) segments.push(`Hogst prioriterad aktivitet: ${topTask}.`);
  if (recommended) segments.push(`Forsta rekommendation: ${recommended}.`);

  return segments.join(' ');
}

const COO_AGENT_NAME = 'COO';
const COO_DAILY_BRIEF_CAPABILITY_REF = 'COO.DailyBrief';

const cooDailyBriefInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    includeClosed: { type: 'boolean' },
    timeframeDays: { type: 'number', minimum: 1, maximum: 90 },
    maxTasks: { type: 'integer', minimum: 1, maximum: 5 },
    includeEvidence: { type: 'boolean' },
  },
});

const cooDailyBriefOutputSchema = Object.freeze({
  type: 'object',
  required: ['data', 'metadata', 'warnings'],
  additionalProperties: false,
  properties: {
    data: {
      type: 'object',
      required: ['incidentSummary', 'taskPlan', 'executiveSummary', 'priorityLevel', 'generatedAt'],
      additionalProperties: false,
      properties: {
        incidentSummary: {
          type: 'object',
          required: ['summary', 'severityBreakdown', 'escalationRisk', 'recommendations', 'generatedAt'],
          additionalProperties: true,
          properties: {
            summary: { type: 'string', minLength: 1, maxLength: 700 },
            severityBreakdown: {
              type: 'object',
              required: ['L3', 'L4', 'L5'],
              additionalProperties: false,
              properties: {
                L3: { type: 'number', minimum: 0 },
                L4: { type: 'number', minimum: 0 },
                L5: { type: 'number', minimum: 0 },
              },
            },
            escalationRisk: { type: 'string', minLength: 1, maxLength: 30 },
            recommendations: {
              type: 'array',
              maxItems: 5,
              items: { type: 'string', minLength: 1, maxLength: 240 },
            },
            generatedAt: { type: 'string', minLength: 1, maxLength: 50 },
          },
        },
        taskPlan: {
          type: 'object',
          required: ['tasks', 'riskHighlight', 'recommendedActions', 'summary', 'generatedAt'],
          additionalProperties: true,
          properties: {
            tasks: {
              type: 'array',
              maxItems: 5,
              items: { type: 'object' },
            },
            riskHighlight: {
              type: 'object',
              additionalProperties: true,
            },
            recommendedActions: {
              type: 'array',
              maxItems: 5,
              items: { type: 'string', minLength: 1, maxLength: 240 },
            },
            summary: { type: 'string', minLength: 1, maxLength: 700 },
            generatedAt: { type: 'string', minLength: 1, maxLength: 50 },
          },
        },
        executiveSummary: { type: 'string', minLength: 1, maxLength: 1200 },
        priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High'] },
        generatedAt: { type: 'string', minLength: 1, maxLength: 50 },
      },
    },
    metadata: {
      type: 'object',
      required: ['agent', 'version', 'channel'],
      additionalProperties: true,
      properties: {
        agent: { type: 'string', minLength: 1, maxLength: 80 },
        version: { type: 'string', minLength: 1, maxLength: 40 },
        channel: { type: 'string', minLength: 1, maxLength: 40 },
        tenantId: { type: 'string', minLength: 1, maxLength: 120 },
        correlationId: { type: 'string', minLength: 1, maxLength: 120 },
      },
    },
    warnings: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 240 },
    },
  },
});

function composeCooDailyBrief({
  incidentOutput = null,
  taskPlanOutput = null,
  channel = 'admin',
  tenantId = '',
  correlationId = '',
} = {}) {
  const incidentData = asObject(asObject(incidentOutput).data);
  const taskData = asObject(asObject(taskPlanOutput).data);
  const incidentWarnings = asArray(asObject(incidentOutput).warnings);
  const taskWarnings = asArray(asObject(taskPlanOutput).warnings);

  const incidentSummary = {
    summary: normalizeText(incidentData.summary) || 'Ingen incidentsammanfattning tillganglig.',
    severityBreakdown: toSeverityBreakdown(incidentData.severityBreakdown),
    recurringPatterns: asArray(incidentData.recurringPatterns)
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 3),
    escalationRisk: normalizeText(incidentData.escalationRisk) || 'Lag',
    recommendations: asArray(incidentData.recommendations)
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 5),
    generatedAt: normalizeText(incidentData.generatedAt) || new Date().toISOString(),
  };

  const tasks = asArray(taskData.tasks).slice(0, 5);
  const taskPlan = {
    tasks,
    riskHighlight: asObject(taskData.riskHighlight),
    recommendedActions: asArray(taskData.recommendedActions)
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 5),
    summary: normalizeText(taskData.summary) || 'Ingen taskplan tillganglig.',
    generatedAt: normalizeText(taskData.generatedAt) || new Date().toISOString(),
  };

  const priorityLevel = pickPriorityLevel({
    incidentRisk: incidentSummary.escalationRisk,
    taskRisk: normalizeText(taskPlan.riskHighlight?.level),
    tasks,
  });

  const executiveSummary = createExecutiveSummary({
    incidentSummary,
    taskPlan,
    priorityLevel,
  });

  const warnings = Array.from(
    new Set(
      [...incidentWarnings, ...taskWarnings]
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  ).slice(0, 20);

  return {
    data: {
      incidentSummary,
      taskPlan,
      executiveSummary,
      priorityLevel,
      generatedAt: new Date().toISOString(),
    },
    metadata: {
      agent: COO_AGENT_NAME,
      version: '1.0.0',
      channel: normalizeText(channel) || 'admin',
      tenantId: normalizeText(tenantId) || 'unknown',
      correlationId: normalizeText(correlationId) || '',
      sources: ['SummarizeIncidents', 'GenerateTaskPlan'],
    },
    warnings,
  };
}

module.exports = {
  COO_AGENT_NAME,
  COO_DAILY_BRIEF_CAPABILITY_REF,
  cooDailyBriefInputSchema,
  cooDailyBriefOutputSchema,
  composeCooDailyBrief,
};
