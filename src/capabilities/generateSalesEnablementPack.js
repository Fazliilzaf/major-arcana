'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const { buildCcoHandoffContext } = require('../ops/cmoOrchestrationGate');
const {
  normalizeText,
  asObject,
  asArray,
  brandLabel,
  targetAudienceLabel,
  capabilityMeta,
  CMO_DRAFT_DISCLAIMER,
} = require('./cmoCapabilityHelpers');

class GenerateSalesEnablementPackCapability extends BaseCapability {
  static name = 'GenerateSalesEnablementPack';
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
      maxBattlecards: { type: 'integer', minimum: 1, maximum: 10 },
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
    const maxBattlecards = Math.max(1, Math.min(10, Number(input.maxBattlecards) || 4));
    const brand = brandLabel(snapshot);
    const audience = targetAudienceLabel(snapshot, input);
    const handoff = buildCcoHandoffContext(snapshot);
    const segments = asArray(snapshot.audienceSegments);

    const objections = [
      {
        id: 'price',
        objection: 'Det är för dyrt just nu.',
        response: `Fokusera på ROI och riskreduktion — ${brand} minskar admin overhead, inte klinisk behandlingskvalitet.`,
      },
      {
        id: 'timing',
        objection: 'Vi är inte redo att byta system.',
        response: 'Erbjud pilot/onboarding i etapper med tydlig DoD och OWNER-godkännande per fas.',
      },
      {
        id: 'security',
        objection: 'Hur hanteras patientdata?',
        response: 'Lyft spårbarhet, audit och dataskydd — undvik kliniska löften utan verifierad policy.',
      },
    ];

    const battlecards = segments.slice(0, maxBattlecards).map((segment, index) => ({
      id: normalizeText(segment.id) || `segment-${index + 1}`,
      segment: normalizeText(segment.label) || `Segment ${index + 1}`,
      persona: normalizeText(segment.persona) || 'Beslutsfattare',
      painPoints: asArray(segment.painPoints).length
        ? asArray(segment.painPoints)
        : ['Manuell admin', 'Saknad spårbarhet', 'Compliance-risk i kommunikation'],
      valueProps: [
        `${brand} ger strukturerad vårdadministration.`,
        'Copilot-modell med OWNER-godkännande före extern output.',
      ],
      talkTrack: `För ${audience}: visa hur ${brand} minskar admin friktion utan att ge kliniska råd.`,
      objections: objections.slice(0, 2),
      requiresOwnerApproval: true,
    }));

    if (!battlecards.length) {
      battlecards.push({
        id: 'default',
        segment: audience,
        persona: 'Klinikledning',
        painPoints: ['Fragmenterade processer', 'Svår uppföljning'],
        valueProps: [`${brand} — trygg admin-orkestrering.`],
        talkTrack: 'Lead with operational safety and owner-controlled approvals.',
        objections,
        requiresOwnerApproval: true,
      });
    }

    return {
      data: {
        outputType: 'SalesEnablementPack',
        mqlDefinition: handoff.mqlDefinition,
        sqlDefinition: handoff.sqlDefinition,
        pipelineStages: handoff.pipelineStages,
        battlecards,
        objectionHandling: objections,
        summary: `${battlecards.length} battlecards med delad MQL/SQL-definition för ${audience}. ${CMO_DRAFT_DISCLAIMER}`,
        generatedAt: new Date().toISOString(),
        readOnly: true,
        autoPublish: false,
      },
      metadata: capabilityMeta(GenerateSalesEnablementPackCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  GenerateSalesEnablementPackCapability,
};
