const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function inTimeframe(incident = {}, timeframeDays = 14) {
  const safeDays = Math.max(1, Math.min(90, toNumber(timeframeDays, 14)));
  const thresholdMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  const ts = Date.parse(String(incident.updatedAt || incident.openedAt || ''));
  if (!Number.isFinite(ts)) return true;
  return ts >= thresholdMs;
}

function isOpenIncident(status = '') {
  const normalized = normalizeText(status).toLowerCase();
  return normalized === 'open' || normalized === 'escalated';
}

function toSeverityLevel(incident = {}) {
  const severity = normalizeText(incident.severity).toUpperCase();
  if (severity === 'L5') return 'L5';
  if (severity === 'L4') return 'L4';
  if (severity === 'L3') return 'L3';

  const riskLevel = toNumber(incident.riskLevel, 0);
  if (riskLevel >= 5) return 'L5';
  if (riskLevel >= 4) return 'L4';
  if (riskLevel >= 3) return 'L3';
  return '';
}

function safeSnapshot(source = {}) {
  const snapshot = asObject(source);
  return {
    incidents: asArray(snapshot.incidents),
    slaStatus: asObject(snapshot.slaStatus),
    timestamps: asObject(snapshot.timestamps),
  };
}

function pushRecommendation(target = [], value = '') {
  const normalized = normalizeText(value);
  if (!normalized) return;
  if (target.includes(normalized)) return;
  if (target.length >= 5) return;
  target.push(normalized);
}

class SummarizeIncidentsCapability extends BaseCapability {
  static name = 'SummarizeIncidents';
  static capabilityName = 'SummarizeIncidents';
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
      includeClosed: { type: 'boolean' },
      timeframeDays: { type: 'number', minimum: 1, maximum: 90 },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: {
        type: 'object',
        required: [
          'summary',
          'severityBreakdown',
          'recurringPatterns',
          'escalationRisk',
          'recommendations',
          'generatedAt',
        ],
        additionalProperties: false,
        properties: {
          summary: { type: 'string', minLength: 1, maxLength: 600 },
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
          recurringPatterns: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 180 },
          },
          escalationRisk: {
            type: 'string',
            enum: ['Lag', 'Medel', 'Hog', 'Kritisk'],
          },
          recommendations: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: { type: 'string', minLength: 1, maxLength: 220 },
          },
          generatedAt: { type: 'string', minLength: 1, maxLength: 50 },
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
        items: { type: 'string', minLength: 1, maxLength: 220 },
      },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);
    const snapshot = safeSnapshot(safeContext.systemStateSnapshot);
    const includeClosed = input.includeClosed === true;
    const timeframeDays = Math.max(1, Math.min(90, toNumber(input.timeframeDays, 14)));

    const incidents = snapshot.incidents.filter((incident) => {
      if (!inTimeframe(incident, timeframeDays)) return false;
      if (includeClosed) return true;
      return isOpenIncident(incident?.status);
    });

    const severityBreakdown = { L3: 0, L4: 0, L5: 0 };
    const categoryCounts = new Map();
    const reasonCounts = new Map();
    const slaCounts = new Map();
    let breachedCount = 0;

    for (const incident of incidents) {
      const severity = toSeverityLevel(incident);
      if (severity && Object.prototype.hasOwnProperty.call(severityBreakdown, severity)) {
        severityBreakdown[severity] += 1;
      }

      const category = normalizeText(incident?.category).toUpperCase();
      if (category) categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);

      const reasonCodes = asArray(incident?.reasonCodes);
      for (const code of reasonCodes) {
        const normalizedCode = normalizeText(code).toUpperCase();
        if (!normalizedCode) continue;
        reasonCounts.set(normalizedCode, (reasonCounts.get(normalizedCode) || 0) + 1);
      }

      const slaState = normalizeText(incident?.sla?.state).toLowerCase();
      if (slaState) slaCounts.set(slaState, (slaCounts.get(slaState) || 0) + 1);
      const breached = incident?.sla?.breached === true || slaState === 'breached';
      if (breached) breachedCount += 1;
    }

    const recurringPatterns = [];
    const topCategories = Array.from(categoryCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const topReasons = Array.from(reasonCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const topSlaStates = Array.from(slaCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    topCategories.forEach(([category, count]) => {
      recurringPatterns.push(`Upprepade incidenter i kategori ${category} (${count})`);
    });
    topReasons.forEach(([code, count]) => {
      recurringPatterns.push(`Aterkommande reason code ${code} (${count})`);
    });
    topSlaStates.forEach(([slaState, count]) => {
      recurringPatterns.push(`SLA-status ${slaState} aterkommer (${count})`);
    });

    const l5 = severityBreakdown.L5;
    const l4 = severityBreakdown.L4;
    const escalationRisk =
      l5 >= 2 || breachedCount >= 2
        ? 'Kritisk'
        : l5 >= 1 || l4 >= 4
          ? 'Hog'
          : l4 >= 2 || incidents.length >= 6
            ? 'Medel'
            : 'Lag';

    const recommendations = [];
    if (l5 > 0) {
      pushRecommendation(recommendations, `Eskalera ${l5} st L5-incidenter till OWNER omedelbart.`);
    }
    if (breachedCount > 0) {
      pushRecommendation(
        recommendations,
        `Prioritera ${breachedCount} incidenter med SLA-brott och säkra owner-action.`
      );
    }
    if (topCategories[0]) {
      pushRecommendation(
        recommendations,
        `Gor rotorsaksanalys i ${topCategories[0][0]} dar incidenter aterkommer.`
      );
    }
    if (topReasons[0]) {
      pushRecommendation(
        recommendations,
        `Verifiera policy/disclaimer för reason code ${topReasons[0][0]}.`
      );
    }
    if (recommendations.length === 0) {
      pushRecommendation(
        recommendations,
        'Fortsatt med daglig incidenttriage och bevaka nya SLA-avvikelser.'
      );
    }

    const summary = [
      `Incidentanalys for ${timeframeDays} dagar (${includeClosed ? 'inklusive stangda' : 'endast oppna'}).`,
      `Totalt i underlag: ${incidents.length}.`,
      `Severity L3=${severityBreakdown.L3}, L4=${severityBreakdown.L4}, L5=${severityBreakdown.L5}.`,
      `Eskaleringsrisk: ${escalationRisk}.`,
    ].join(' ');

    const warnings = [];
    if (incidents.length === 0) {
      warnings.push('Inga incidenter hittades i valt tidsfonster.');
    }
    if (!toIso(snapshot?.timestamps?.capturedAt)) {
      warnings.push('systemStateSnapshot saknar tydlig capturedAt timestamp.');
    }

    return {
      data: {
        summary,
        severityBreakdown,
        recurringPatterns: recurringPatterns.slice(0, 5),
        escalationRisk,
        recommendations: recommendations.slice(0, 5),
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: SummarizeIncidentsCapability.name,
        version: SummarizeIncidentsCapability.version,
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
  SummarizeIncidentsCapability,
  summarizeIncidentsCapability: SummarizeIncidentsCapability,
};
