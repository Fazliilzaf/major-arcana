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

class GenerateNurtureSequenceCapability extends BaseCapability {
  static name = 'GenerateNurtureSequence';
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
      maxTouches: { type: 'integer', minimum: 2, maximum: 12 },
      segment: { type: 'string', maxLength: 80 },
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
    const segment = normalizeText(input.segment) || audience;
    const maxTouches = Math.max(2, Math.min(12, Number(input.maxTouches) || 5));
    const warnings = ['Nurture-sekvens är utkast only — ingen auto-send i v2.'];

    const templates = [
      { dayOffset: 0, channel: 'email', theme: 'Intro + pain points' },
      { dayOffset: 3, channel: 'email', theme: 'Case study / social proof (whitelist only)' },
      { dayOffset: 7, channel: 'linkedin', theme: 'Thought leadership' },
      { dayOffset: 14, channel: 'email', theme: 'ROI / admin efficiency' },
      { dayOffset: 21, channel: 'email', theme: 'Meeting CTA' },
    ];

    const touches = templates.slice(0, maxTouches).map((item, index) => ({
      id: `nurture-${index + 1}`,
      dayOffset: item.dayOffset,
      channel: item.channel,
      segment,
      subject: `${brand} — ${item.theme} (del ${index + 1})`,
      outline: `Utbildande touch för ${segment}: ${item.theme}. Undvik kliniska löften.`,
      requiresOwnerApproval: true,
    }));

    return {
      data: {
        outputType: 'NurtureSequence',
        segment,
        touches,
        touchCount: touches.length,
        summary: `${touches.length}-stegs nurture-utkast för ${segment}. ${CMO_DRAFT_DISCLAIMER}`,
        readOnly: true,
        autoPublish: false,
        autoSend: false,
        generatedAt: new Date().toISOString(),
      },
      metadata: capabilityMeta(GenerateNurtureSequenceCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  GenerateNurtureSequenceCapability,
};
