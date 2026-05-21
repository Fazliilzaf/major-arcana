'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  normalizeText,
  asObject,
  pickTopics,
  brandLabel,
  capabilityMeta,
  CMO_DRAFT_DISCLAIMER,
} = require('./cmoCapabilityHelpers');

class RepurposeContentCapability extends BaseCapability {
  static name = 'RepurposeContent';
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
      sourceContent: { type: 'string', maxLength: 8000 },
      sourceType: { type: 'string', maxLength: 40 },
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
    const sourceType = normalizeText(input.sourceType).toLowerCase() || 'blog';
    let sourceTitle = normalizeText(input.sourceContent);
    if (!sourceTitle) {
      sourceTitle = pickTopics(snapshot, 1)[0]?.topic || `${brand} release notes`;
      warnings.push('Ingen sourceContent angiven — använder första content-topic.');
    } else if (sourceTitle.length > 120) {
      sourceTitle = `${sourceTitle.slice(0, 117)}...`;
    }

    const variants = [
      {
        channel: 'linkedin',
        format: 'post',
        text: `${sourceTitle}\n\nKort sammanfattning för LinkedIn. ${brand} — utkast.`,
      },
      {
        channel: 'instagram',
        format: 'carousel',
        slides: [
          `Slide 1: ${sourceTitle}`,
          'Slide 2: Nyckelinsikt',
          'Slide 3: CTA — boka demo',
        ],
      },
      {
        channel: 'email',
        format: 'newsletter_blurb',
        subject: `Nytt från ${brand}: ${sourceTitle}`,
        preview: sourceTitle,
      },
      {
        channel: 'x',
        format: 'thread',
        tweets: [
          sourceTitle.slice(0, 240),
          'Tråd 2/3: Varför det spelar roll för kliniker.',
          'Tråd 3/3: Läs mer (länk efter godkännande).',
        ],
      },
    ];

    return {
      data: {
        sourceType,
        sourceTitle,
        variants,
        summary: `${variants.length} kanalvarianter från ${sourceType}.`,
        disclaimer: CMO_DRAFT_DISCLAIMER,
        generatedAt: new Date().toISOString(),
      },
      metadata: capabilityMeta(RepurposeContentCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  RepurposeContentCapability,
};
