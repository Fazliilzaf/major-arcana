'use strict';

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

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const TREATMENT_KEYWORDS = Object.freeze({
  hartransplantation: { segment: 'hair_transplant', label: 'Hartransplantation', priority: 'high' },
  fue: { segment: 'hair_transplant', label: 'FUE', priority: 'high' },
  dhi: { segment: 'hair_transplant', label: 'DHI', priority: 'high' },
  prp: { segment: 'prp', label: 'PRP-behandling', priority: 'medium' },
  microneedling: { segment: 'microneedling', label: 'Microneedling', priority: 'medium' },
  skagg: { segment: 'beard', label: 'Skaggtransplantation', priority: 'medium' },
  ogonbryn: { segment: 'eyebrow', label: 'Ogonbrynstransplantation', priority: 'low' },
  haravfall: { segment: 'hair_loss_info', label: 'Haravfall (informationssokande)', priority: 'medium' },
  pris: { segment: 'price_sensitive', label: 'Prismedveten', priority: 'high' },
  konsultation: { segment: 'consultation_ready', label: 'Konsultationsredo', priority: 'high' },
  boka: { segment: 'consultation_ready', label: 'Bokningsredo', priority: 'high' },
});

function detectSegments(text) {
  const normalized = normalizeText(text).toLowerCase();
  const found = new Map();
  for (const [keyword, meta] of Object.entries(TREATMENT_KEYWORDS)) {
    if (normalized.includes(keyword) && !found.has(meta.segment)) {
      found.set(meta.segment, meta);
    }
  }
  return Array.from(found.values());
}

class AnalyzeAudienceSegmentsCapability extends BaseCapability {
  static name = 'AnalyzeAudienceSegments';
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
      maxSegments: { type: 'integer', minimum: 1, maximum: 10 },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: { type: 'object', required: ['segments', 'summary', 'generatedAt'], additionalProperties: true },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input = asObject(safeContext.input);
    const snapshot = asObject(safeContext.systemStateSnapshot);
    const maxSegments = Math.max(1, Math.min(10, toNumber(input.maxSegments, 6)));
    const warnings = [];

    const conversations = asArray(snapshot.conversations);
    const mailInsights = asObject(snapshot.mailInsights);
    const topIntents = asArray(mailInsights.topIntents || mailInsights.inboundIntents);
    const templates = asArray(snapshot.templates);

    const segmentCounts = new Map();
    const segmentMeta = new Map();

    const allText = [
      ...topIntents.map((i) => normalizeText(i?.label || i?.intent || i)),
      ...conversations.map((c) => normalizeText(c?.subject || c?.snippet || c?.preview)),
      ...templates.map((t) => normalizeText(t?.name || t?.category)),
    ].join(' ');

    const detected = detectSegments(allText);
    for (const meta of detected) {
      const key = meta.segment;
      segmentCounts.set(key, (segmentCounts.get(key) || 0) + 1);
      if (!segmentMeta.has(key)) segmentMeta.set(key, meta);
    }

    for (const conv of conversations) {
      const text = normalizeText(conv?.subject || conv?.snippet || '');
      for (const meta of detectSegments(text)) {
        segmentCounts.set(meta.segment, (segmentCounts.get(meta.segment) || 0) + 1);
        if (!segmentMeta.has(meta.segment)) segmentMeta.set(meta.segment, meta);
      }
    }

    if (segmentCounts.size === 0) {
      for (const [, meta] of Object.entries(TREATMENT_KEYWORDS)) {
        if (!segmentCounts.has(meta.segment)) {
          segmentCounts.set(meta.segment, 0);
          segmentMeta.set(meta.segment, meta);
        }
      }
      warnings.push('Inga konversationer eller mail-intents hittades — visar alla standardsegment.');
    }

    const segments = Array.from(segmentCounts.entries())
      .map(([key, count]) => {
        const meta = segmentMeta.get(key) || {};
        return {
          id: key,
          label: meta.label || key,
          priority: meta.priority || 'medium',
          mentionCount: count,
          suggestedActions: [
            count > 5 ? `Skapa riktad kampanj for ${meta.label || key}-segmentet.` : '',
            `Sakerstall att content-kalendern inkluderar ${meta.label || key}-amnen.`,
            meta.priority === 'high' ? 'Prioritera i nasta outreach-cykel.' : '',
          ].filter(Boolean),
        };
      })
      .sort((a, b) => {
        const prio = { high: 3, medium: 2, low: 1 };
        const byPriority = (prio[b.priority] || 0) - (prio[a.priority] || 0);
        return byPriority !== 0 ? byPriority : b.mentionCount - a.mentionCount;
      })
      .slice(0, maxSegments);

    const summary = `${segments.length} malgruppssegment identifierade. ` +
      `Hogst prioriterat: ${segments[0]?.label || 'inget'}. ` +
      `Totalt ${conversations.length} konversationer och ${topIntents.length} mail-intents analyserade.`;

    return {
      data: {
        segments,
        analyzedConversations: conversations.length,
        analyzedIntents: topIntents.length,
        summary,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: AnalyzeAudienceSegmentsCapability.name,
        version: AnalyzeAudienceSegmentsCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
      },
      warnings,
    };
  }
}

module.exports = {
  AnalyzeAudienceSegmentsCapability,
};
