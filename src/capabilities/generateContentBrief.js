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

class GenerateContentBriefCapability extends BaseCapability {
  static name = 'GenerateContentBrief';
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
      maxTopics: { type: 'integer', minimum: 1, maximum: 10 },
      targetAudience: { type: 'string', maxLength: 100 },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: {
        type: 'object',
        required: ['topics', 'contentCalendar', 'summary', 'generatedAt'],
        additionalProperties: true,
      },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input = asObject(safeContext.input);
    const snapshot = asObject(safeContext.systemStateSnapshot);
    const maxTopics = Math.max(1, Math.min(10, toNumber(input.maxTopics, 5)));
    const targetAudience = normalizeText(input.targetAudience) || 'potentiella patienter';
    const warnings = [];

    const templates = asArray(snapshot.templates);
    const faqData = asArray(snapshot.faqTopics);
    const mailInsights = asObject(snapshot.mailInsights);
    const topInboundIntents = asArray(mailInsights.topIntents || mailInsights.inboundIntents);

    const topicCandidates = [];

    for (const intent of topInboundIntents.slice(0, 10)) {
      const label = normalizeText(intent?.label || intent?.intent || intent);
      if (label) {
        topicCandidates.push({
          topic: label,
          source: 'mail_inbound_intent',
          relevance: 'high',
          suggestedFormat: 'artikel',
          rationale: `Vanlig fraga fran patienter via mail.`,
        });
      }
    }

    for (const faq of faqData.slice(0, 10)) {
      const question = normalizeText(faq?.question || faq);
      if (question) {
        topicCandidates.push({
          topic: question,
          source: 'faq',
          relevance: 'medium',
          suggestedFormat: 'faq_artikel',
          rationale: 'Baserat pa vanliga fragor i kunskapsbasen.',
        });
      }
    }

    const categorySet = new Set(templates.map((t) => normalizeText(t?.category).toLowerCase()).filter(Boolean));
    const categoryTopics = [
      { category: 'BOOKING', topic: 'Sa forbereder du dig infor din konsultation', format: 'guide' },
      { category: 'AFTERCARE', topic: 'Eftervard efter hartransplantation — vecka for vecka', format: 'guide' },
      { category: 'CONSULTATION', topic: 'Vanliga fragor infor ditt forsta besok', format: 'faq_artikel' },
      { category: 'LEAD', topic: 'Varfor valja Hair TP Clinic — 5 anledningar', format: 'artikel' },
    ];
    for (const ct of categoryTopics) {
      if (categorySet.has(ct.category.toLowerCase())) {
        topicCandidates.push({
          topic: ct.topic,
          source: 'template_category',
          relevance: 'medium',
          suggestedFormat: ct.format,
          rationale: `Baserat pa att ni har aktiva ${ct.category}-mallar.`,
        });
      }
    }

    const trustTopics = [
      'Sakerhet och integritet i patientresan',
      'Transparens kring behandlingsprocess och forvantningar',
      'Teamets kompetens och erfarenhet',
    ];
    for (const trustTopic of trustTopics) {
      topicCandidates.push({
        topic: trustTopic,
        source: 'trust_template',
        relevance: 'medium',
        suggestedFormat: 'artikel',
        rationale: 'Product & trust marketing — stodjer trygghet utan kliniska lofenden.',
      });
    }

    if (topicCandidates.length === 0) {
      topicCandidates.push(
        { topic: 'Hartransplantation — vad du behover veta', source: 'default', relevance: 'medium', suggestedFormat: 'artikel', rationale: 'Standard-amne for harkliniker.' },
        { topic: 'PRP-behandling — resultat och forvantan', source: 'default', relevance: 'medium', suggestedFormat: 'artikel', rationale: 'Standard-amne for harkliniker.' },
        { topic: 'DHI vs FUE — vilken metod passar dig?', source: 'default', relevance: 'medium', suggestedFormat: 'jamforelse', rationale: 'Vanlig sokning bland potentiella patienter.' }
      );
      warnings.push('Inga mail-insights eller FAQ hittades — anvander standard-amnen.');
    }

    const topics = topicCandidates.slice(0, maxTopics);

    const now = new Date();
    const contentCalendar = topics.map((t, i) => ({
      week: i + 1,
      topic: t.topic,
      format: t.suggestedFormat,
      targetDate: new Date(now.getTime() + (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'planned',
    }));

    const summary = `${topics.length} content-amnen identifierade for ${targetAudience}. ` +
      `Kallor: ${[...new Set(topics.map((t) => t.source))].join(', ')}. ` +
      `Forsta amne: ${topics[0]?.topic || 'inget'}.`;

    return {
      data: {
        topics,
        contentCalendar,
        targetAudience,
        summary,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: GenerateContentBriefCapability.name,
        version: GenerateContentBriefCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
      },
      warnings,
    };
  }
}

module.exports = {
  GenerateContentBriefCapability,
};
