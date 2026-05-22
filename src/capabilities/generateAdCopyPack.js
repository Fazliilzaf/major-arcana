'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  normalizeText,
  toNumber,
  asArray,
  asObject,
  pickTopics,
  brandLabel,
  targetAudienceLabel,
  capabilityMeta,
  CMO_DRAFT_DISCLAIMER,
} = require('./cmoCapabilityHelpers');

const AD_CHANNELS = Object.freeze([
  { id: 'google_search', label: 'Google Ads (sök)' },
  { id: 'google_display', label: 'Google Ads (display)' },
  { id: 'meta', label: 'Meta Ads' },
  { id: 'linkedin', label: 'LinkedIn Ads' },
]);

class GenerateAdCopyPackCapability extends BaseCapability {
  static name = 'GenerateAdCopyPack';
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
      maxAds: { type: 'integer', minimum: 1, maximum: 20 },
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
    const maxAds = Math.max(1, Math.min(20, toNumber(input.maxAds, 8)));
    const audience = targetAudienceLabel(snapshot, input);
    const brand = brandLabel(snapshot);
    const topics = pickTopics(snapshot, 3);
    const segments = asArray(snapshot.audienceSegments);
    const topSegment = segments[0]?.label || audience;

    const ads = [];
    for (const channel of AD_CHANNELS) {
      for (const topic of topics) {
        if (ads.length >= maxAds) break;
        ads.push({
          id: `${channel.id}-${ads.length + 1}`,
          channel: channel.id,
          channelLabel: channel.label,
          campaignStructure: {
            campaign: `${brand} — ${topic.topic}`,
            adGroup: topSegment,
            audienceHint: topSegment,
          },
          headlines: [
            `${brand}: ${topic.topic}`.slice(0, 30),
            'Trygg vårdadministration',
            'Boka demo idag',
          ],
          descriptions: [
            `För ${audience}. ${topic.topic}. Utkast — godkänn före spend.`,
            `${brand} strukturerar admin, mallar och kvalitet.`,
          ],
          cta: 'Läs mer',
          negativeKeywords: ['gratis', 'jobb', 'utbildning'],
          budgetHint: 'Föreslagen testbudget — kräver CFO/OWNER-godkännande.',
          abTestIdeas: ['Rubrik A: problem', 'Rubrik B: resultat'],
          status: 'draft',
          requiresOwnerApproval: true,
        });
      }
    }

    return {
      data: {
        ads: ads.slice(0, maxAds),
        summary: `${ads.length} annonsutkast across ${AD_CHANNELS.length} kanaler.`,
        disclaimer: CMO_DRAFT_DISCLAIMER,
        generatedAt: new Date().toISOString(),
      },
      metadata: capabilityMeta(GenerateAdCopyPackCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  GenerateAdCopyPackCapability,
};
