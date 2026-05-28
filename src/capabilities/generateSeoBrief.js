'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  normalizeText,
  toNumber,
  asObject,
  pickTopics,
  brandLabel,
  targetAudienceLabel,
  capabilityMeta,
  CMO_DRAFT_DISCLAIMER,
} = require('./cmoCapabilityHelpers');
const { groundingReferences } = require('../ops/knowledgeGrounding');

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9åäö\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

class GenerateSeoBriefCapability extends BaseCapability {
  static name = 'GenerateSeoBrief';
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
      maxArticles: { type: 'integer', minimum: 1, maximum: 10 },
      targetAudience: { type: 'string', maxLength: 100 },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: { type: 'object', additionalProperties: true },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);
    const snapshot = asObject(safeContext.systemStateSnapshot);
    const warnings = [];
    const maxArticles = Math.max(1, Math.min(10, toNumber(input.maxArticles, 5)));
    const audience = targetAudienceLabel(snapshot, input);
    const brand = brandLabel(snapshot);
    const topics = pickTopics(snapshot, maxArticles);

    const articles = topics.map((item, index) => {
      const primaryKeyword = normalizeText(item.topic).slice(0, 60) || `arcana ${index + 1}`;
      const slug = slugify(primaryKeyword) || `artikel-${index + 1}`;
      return {
        id: `seo-${index + 1}`,
        primaryKeyword,
        secondaryKeywords: [
          `${brand} ${audience}`,
          'digital vårdadministration',
          'säker dokumentation',
        ],
        title: `${primaryKeyword} | ${brand}`,
        metaDescription: `${primaryKeyword} — en guide för ${audience}. Utkast, kräver granskning före publicering.`,
        slug,
        headingStructure: ['H1: Rubrik', 'H2: Problem', 'H2: Lösning', 'H2: Så kommer ni igång', 'H2: FAQ'],
        internalLinks: ['/produkt', '/säkerhet', '/kontakt'],
        landingPageIdea: slug,
        faqSuggestions: [
          `Vad är ${primaryKeyword}?`,
          `Hur hjälper ${brand} ${audience}?`,
        ],
        status: 'draft',
      };
    });

    const gaps = [
      'Long-tail: "administration klinik digital plattform"',
      'Jämförelse: problem → lösning för vårdadministration',
      'Trust: säkerhet och compliance för vård-SaaS',
    ];

    const references = await groundingReferences('seo sökmotor content strategi marknadsföring');

    return {
      data: {
        articles,
        keywordGaps: gaps,
        summary: `${articles.length} SEO-briefs för ${audience}.`,
        references,
        disclaimer: CMO_DRAFT_DISCLAIMER,
        generatedAt: new Date().toISOString(),
      },
      metadata: capabilityMeta(GenerateSeoBriefCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  GenerateSeoBriefCapability,
};
