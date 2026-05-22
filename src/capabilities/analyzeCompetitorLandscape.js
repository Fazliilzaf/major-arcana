'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  normalizeText,
  asObject,
  asArray,
  brandLabel,
  targetAudienceLabel,
  capabilityMeta,
  CMO_DRAFT_DISCLAIMER,
} = require('./cmoCapabilityHelpers');

const DEFAULT_COMPETITORS = Object.freeze([
  {
    id: 'legacy-admin',
    name: 'Legacy admin suite',
    category: 'horizontal_software',
    positioning: 'Generisk praktikadministration',
    strengths: ['Etablerat varumärke', 'Brett funktionsutbud'],
    weaknesses: ['Lång implementation', 'Svag AI-orkestrering'],
  },
  {
    id: 'point-solution',
    name: 'Point solution inbox',
    category: 'communication',
    positioning: 'Enkel inbox-automation',
    strengths: ['Snabb onboarding', 'Låg initial kostnad'],
    weaknesses: ['Saknar compliance-gate', 'Fragmenterad governance'],
  },
]);

class AnalyzeCompetitorLandscapeCapability extends BaseCapability {
  static name = 'AnalyzeCompetitorLandscape';
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
      maxCompetitors: { type: 'integer', minimum: 1, maximum: 8 },
      focusArea: { type: 'string', maxLength: 80 },
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
    const brand = brandLabel(snapshot);
    const audience = targetAudienceLabel(snapshot, input);
    const focusArea = normalizeText(input.focusArea) || 'vårdadministration och compliance';
    const maxCompetitors = Math.max(1, Math.min(8, Number(input.maxCompetitors) || 4));

    const sourceProfiles = asArray(snapshot.competitorProfiles).length
      ? asArray(snapshot.competitorProfiles)
      : DEFAULT_COMPETITORS;

    const competitors = sourceProfiles.slice(0, maxCompetitors).map((profile, index) => {
      const item = asObject(profile);
      return {
        id: normalizeText(item.id) || `competitor-${index + 1}`,
        name: normalizeText(item.name) || `Competitor ${index + 1}`,
        category: normalizeText(item.category) || 'unknown',
        positioning: normalizeText(item.positioning) || 'Okänd positionering',
        strengths: asArray(item.strengths).length ? asArray(item.strengths) : ['Okänd styrka'],
        weaknesses: asArray(item.weaknesses).length ? asArray(item.weaknesses) : ['Okänd svaghet'],
        differentiationAngle: `${brand} fokuserar på OWNER-godkännande och compliance-gate — inte autonom publicering.`,
        evidenceRequired: true,
      };
    });

    if (!asArray(snapshot.competitorProfiles).length) {
      warnings.push('Ingen competitorProfiles i snapshot — använder heuristiska default-profiler.');
    }
    warnings.push('Konkurrentpåståenden kräver manuell verifiering före extern användning.');

    return {
      data: {
        outputType: 'CompetitorLandscape',
        focusArea,
        targetAudience: audience,
        competitors,
        positioningMatrix: competitors.map((c) => ({
          name: c.name,
          axis: { governance: 'medium', automation: c.category === 'communication' ? 'high' : 'low' },
        })),
        recommendedTalkTrack: `${brand} differentierar sig med trygg admin-orkestrering och compliance-first för ${audience}.`,
        summary: `${competitors.length} konkurrentprofiler analyserade för ${focusArea}. ${CMO_DRAFT_DISCLAIMER}`,
        readOnly: true,
        autoPublish: false,
        requiresOwnerApproval: true,
        generatedAt: new Date().toISOString(),
      },
      metadata: capabilityMeta(AnalyzeCompetitorLandscapeCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  AnalyzeCompetitorLandscapeCapability,
};
