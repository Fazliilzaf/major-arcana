const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function capText(value, maxLength = 3200) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function splitSentences(value = '') {
  const text = normalizeText(value);
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensureGreeting(text = '') {
  const normalized = normalizeText(text);
  if (!normalized) return 'Hej, tack för ditt meddelande.';
  if (/^hej[,!]?/i.test(normalized)) return normalized;
  return `Hej, ${normalized}`;
}

function applyInstruction({ draft = '', instruction = 'improve' } = {}) {
  const normalizedDraft = normalizeText(draft);
  const normalizedInstruction = normalizeText(instruction).toLowerCase();
  if (!normalizedDraft) return '';

  if (normalizedInstruction === 'shorten') {
    const sentences = splitSentences(normalizedDraft).slice(0, 4);
    return capText(sentences.join(' '), 900);
  }

  if (normalizedInstruction === 'professional') {
    let polished = ensureGreeting(normalizedDraft);
    polished = polished.replace(/\bjag tror\b/gi, 'vi bedomer');
    polished = polished.replace(/\bkanse\b/gi, 'troligen');
    polished = polished.replace(/\bsnalla\b/gi, 'vanligen');
    return capText(polished, 1800);
  }

  const improved = ensureGreeting(normalizedDraft);
  return capText(`${improved}\n\nVi foljer upp skyndsamt med nasta steg.`, 1800);
}

class RefineReplyDraftCapability extends BaseCapability {
  static name = 'RefineReplyDraft';
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
    required: ['conversationId', 'messageId', 'subject', 'draft', 'instruction'],
    properties: {
      conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
      messageId: { type: 'string', minLength: 1, maxLength: 1024 },
      mailboxId: { type: 'string', minLength: 1, maxLength: 320 },
      subject: { type: 'string', minLength: 1, maxLength: 220 },
      draft: { type: 'string', minLength: 1, maxLength: 3000 },
      instruction: {
        type: 'string',
        enum: ['improve', 'shorten', 'professional'],
      },
    },
  };

  static outputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['data', 'metadata', 'warnings'],
    properties: {
      data: {
        type: 'object',
        additionalProperties: false,
        required: [
          'conversationId',
          'messageId',
          'mailboxId',
          'subject',
          'instruction',
          'refinedReply',
          'appliedAt',
        ],
        properties: {
          conversationId: { type: 'string', minLength: 1, maxLength: 1024 },
          messageId: { type: 'string', minLength: 1, maxLength: 1024 },
          mailboxId: { type: 'string', minLength: 1, maxLength: 320 },
          subject: { type: 'string', minLength: 1, maxLength: 220 },
          instruction: { type: 'string', enum: ['improve', 'shorten', 'professional'] },
          refinedReply: { type: 'string', minLength: 1, maxLength: 3200 },
          appliedAt: { type: 'string', minLength: 1, maxLength: 50 },
        },
      },
      metadata: {
        type: 'object',
        additionalProperties: false,
        required: ['capability', 'version', 'channel', 'tenantId'],
        properties: {
          capability: { type: 'string', minLength: 1, maxLength: 120 },
          version: { type: 'string', minLength: 1, maxLength: 40 },
          channel: { type: 'string', minLength: 1, maxLength: 40 },
          tenantId: { type: 'string', minLength: 1, maxLength: 120 },
          requestId: { type: 'string', minLength: 1, maxLength: 120 },
          correlationId: { type: 'string', minLength: 1, maxLength: 120 },
        },
      },
      warnings: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string', minLength: 1, maxLength: 200 },
      },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input = safeContext.input && typeof safeContext.input === 'object' ? safeContext.input : {};
    const refinedReply = applyInstruction({
      draft: input.draft,
      instruction: input.instruction,
    });

    return {
      data: {
        conversationId: normalizeText(input.conversationId),
        messageId: normalizeText(input.messageId),
        mailboxId: normalizeText(input.mailboxId) || 'okand-postlada',
        subject: capText(input.subject, 220) || '(utan ämne)',
        instruction: normalizeText(input.instruction).toLowerCase(),
        refinedReply,
        appliedAt: new Date().toISOString(),
      },
      metadata: {
        capability: RefineReplyDraftCapability.name,
        version: RefineReplyDraftCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'okand',
        requestId: normalizeText(safeContext.requestId) || '',
        correlationId: normalizeText(safeContext.correlationId) || '',
      },
      warnings: [],
    };
  }
}

module.exports = {
  RefineReplyDraftCapability,
  refineReplyDraftCapability: RefineReplyDraftCapability,
};
