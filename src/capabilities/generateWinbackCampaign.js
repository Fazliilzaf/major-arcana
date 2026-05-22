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

class GenerateWinbackCampaignCapability extends BaseCapability {
  static name = 'GenerateWinbackCampaign';
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
      inactivityDays: { type: 'integer', minimum: 14, maximum: 365 },
      maxTouches: { type: 'integer', minimum: 2, maximum: 6 },
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
    const inactivityDays = Math.max(14, Math.min(365, Number(input.inactivityDays) || 60));
    const maxTouches = Math.max(2, Math.min(6, Number(input.maxTouches) || 3));
    const warnings = ['Winback-kampanj är utkast only — ingen auto-send i v2.'];

    const touches = [
      {
        id: 'winback-1',
        channel: 'email',
        headline: `Vi saknar er — ${brand} har uppdaterats`,
        body: `Re-engagement för inaktiva kontakter (${inactivityDays}+ dagar).`,
      },
      {
        id: 'winback-2',
        channel: 'email',
        headline: 'Nytt: tryggare admin-workflows',
        body: 'Lyft compliance-gate och OWNER-godkännande — inga kliniska löften.',
      },
      {
        id: 'winback-3',
        channel: 'linkedin',
        headline: 'Sista påminnelse + mötes-CTA',
        body: 'Erbjud kort check-in med klinikledning.',
      },
    ].slice(0, maxTouches);

    return {
      data: {
        outputType: 'WinbackCampaign',
        inactivityDays,
        targetAudience: audience,
        touches,
        campaign: {
          id: 'winback-default',
          name: `Winback ${inactivityDays}d`,
          channel: 'multi',
          readiness: 'draft',
          requiresOwnerApproval: true,
        },
        summary: `Winback-utkast med ${touches.length} touches för ${audience}. ${CMO_DRAFT_DISCLAIMER}`,
        readOnly: true,
        autoPublish: false,
        autoSend: false,
        generatedAt: new Date().toISOString(),
      },
      metadata: capabilityMeta(GenerateWinbackCampaignCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  GenerateWinbackCampaignCapability,
};
