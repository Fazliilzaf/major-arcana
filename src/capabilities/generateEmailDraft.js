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

const EMAIL_TYPES = Object.freeze({
  newsletter: {
    label: 'Nyhetsbrev',
    subject: 'Veckans insikter från {{brand}}',
    preheader: 'Nyheter, tips och uppdateringar',
  },
  nurture: {
    label: 'Nurture-sekvens',
    subject: 'Del {{n}}: Så strukturerar ni admin tryggt',
    preheader: 'Utbildande serie — utkast',
  },
  onboarding: {
    label: 'Onboarding',
    subject: 'Välkommen till {{brand}}',
    preheader: 'Kom igång på 3 steg',
  },
});

class GenerateEmailDraftCapability extends BaseCapability {
  static name = 'GenerateEmailDraft';
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
      emailType: { type: 'string', maxLength: 30 },
      maxEmails: { type: 'integer', minimum: 1, maximum: 10 },
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
    const maxEmails = Math.max(1, Math.min(10, toNumber(input.maxEmails, 3)));
    const emailType = normalizeText(input.emailType).toLowerCase() || 'newsletter';
    const template = EMAIL_TYPES[emailType] || EMAIL_TYPES.newsletter;
    if (!EMAIL_TYPES[emailType]) {
      warnings.push(`Okänd emailType "${emailType}" — använder newsletter.`);
    }
    const brand = brandLabel(snapshot);
    const audience = targetAudienceLabel(snapshot, input);
    const topics = pickTopics(snapshot, maxEmails);
    const campaigns = asArray(snapshot.campaigns);

    const emails = topics.map((topic, index) => ({
      id: `email-${index + 1}`,
      type: emailType,
      typeLabel: template.label,
      subject: template.subject.replace('{{brand}}', brand).replace('{{n}}', String(index + 1)),
      preheader: template.preheader,
      bodyOutline: [
        `Hej ${audience},`,
        `Huvudbudskap: ${topic.topic}`,
        'Värde/insikt (2–3 stycken)',
        'CTA — boka demo / läs mer',
        `Signatur ${brand}`,
      ],
      segmentHint: campaigns[0]?.targetSegment || 'general',
      status: 'draft',
      requiresOwnerApproval: true,
    }));

    return {
      data: {
        emails: emails.slice(0, maxEmails),
        summary: `${emails.length} e-postutkast (${template.label}).`,
        disclaimer: CMO_DRAFT_DISCLAIMER,
        generatedAt: new Date().toISOString(),
      },
      metadata: capabilityMeta(GenerateEmailDraftCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  GenerateEmailDraftCapability,
};
