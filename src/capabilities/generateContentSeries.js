'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  normalizeText,
  asObject,
  brandLabel,
  targetAudienceLabel,
  capabilityMeta,
  CMO_DRAFT_DISCLAIMER,
} = require('./cmoCapabilityHelpers');

const TRUST_SERIES_THEMES = Object.freeze([
  'Säkerhet & integritet i patientresan',
  'Transparens kring behandlingsprocess',
  'Teamets kompetens och erfarenhet',
  'Före/efter — förväntningar och realistiska resultat',
]);

class GenerateContentSeriesCapability extends BaseCapability {
  static name = 'GenerateContentSeries';
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
      seriesName: { type: 'string', maxLength: 120 },
      episodeCount: { type: 'integer', minimum: 2, maximum: 12 },
      pillar: { type: 'string', maxLength: 80 },
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
    const brand = brandLabel(snapshot);
    const audience = targetAudienceLabel(snapshot, input);
    const seriesName = normalizeText(input.seriesName) || `${brand} content-serie`;
    const pillar = normalizeText(input.pillar) || 'trust';
    const episodeCount = Math.max(2, Math.min(12, Number(input.episodeCount) || 4));
    const warnings = [`Content-serie är utkast only. ${CMO_DRAFT_DISCLAIMER}`];

    const themes =
      pillar === 'trust' ? TRUST_SERIES_THEMES : TRUST_SERIES_THEMES.map((theme) => `${theme} (${pillar})`);

    const episodes = themes.slice(0, episodeCount).map((theme, index) => ({
      id: `series-${index + 1}`,
      order: index + 1,
      title: `${seriesName} — del ${index + 1}`,
      theme,
      audience,
      channels: index % 2 === 0 ? ['linkedin', 'email'] : ['blog', 'linkedin'],
      outline: `Episod ${index + 1}: ${theme}. Fokus på ${audience}. Undvik medicinska löften.`,
      requiresOwnerApproval: true,
      complianceRequired: true,
    }));

    return {
      data: {
        outputType: 'ContentSeries',
        seriesName,
        pillar,
        episodes,
        episodeCount: episodes.length,
        summary: `${episodes.length}-delars serie "${seriesName}" för ${audience}. ${CMO_DRAFT_DISCLAIMER}`,
        readOnly: true,
        autoPublish: false,
        generatedAt: new Date().toISOString(),
      },
      metadata: capabilityMeta(GenerateContentSeriesCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  GenerateContentSeriesCapability,
  TRUST_SERIES_THEMES,
};
