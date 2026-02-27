const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function capText(value, maxLength = 280) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function normalizeAction(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'handled') return 'handled';
  if (normalized === 'flag_critical') return 'flag_critical';
  return '';
}

class CcoConversationActionCapability extends BaseCapability {
  static name = 'CcoConversationAction';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = false;
  static requiresPolicyFloor = false;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'conversationId', 'messageId'],
    properties: {
      action: {
        type: 'string',
        enum: ['handled', 'flag_critical'],
      },
      conversationId: { type: 'string', minLength: 1, maxLength: 120 },
      messageId: { type: 'string', minLength: 1, maxLength: 120 },
      mailboxId: { type: 'string', minLength: 1, maxLength: 160 },
      subject: { type: 'string', minLength: 1, maxLength: 220 },
      note: { type: 'string', minLength: 1, maxLength: 260 },
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
          'action',
          'conversationId',
          'messageId',
          'status',
          'needsReplyStatus',
          'priorityLevel',
          'appliedAt',
        ],
        properties: {
          action: { type: 'string', enum: ['handled', 'flag_critical'] },
          conversationId: { type: 'string', minLength: 1, maxLength: 120 },
          messageId: { type: 'string', minLength: 1, maxLength: 120 },
          mailboxId: { type: 'string', minLength: 1, maxLength: 160 },
          subject: { type: 'string', minLength: 1, maxLength: 220 },
          status: { type: 'string', enum: ['ok'] },
          needsReplyStatus: { type: 'string', enum: ['handled', 'needs_reply'] },
          priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
          actionLabel: { type: 'string', minLength: 1, maxLength: 120 },
          note: { type: 'string', minLength: 1, maxLength: 260 },
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
    const action = normalizeAction(input.action);
    const nowIso = new Date().toISOString();
    const actionLabel = action === 'handled' ? 'Markera som hanterad' : 'Flagga som Critical';

    return {
      data: {
        action,
        conversationId: normalizeText(input.conversationId),
        messageId: normalizeText(input.messageId),
        mailboxId: normalizeText(input.mailboxId),
        subject: capText(input.subject, 220) || '(utan amne)',
        status: 'ok',
        needsReplyStatus: action === 'handled' ? 'handled' : 'needs_reply',
        priorityLevel: action === 'flag_critical' ? 'Critical' : 'Low',
        actionLabel,
        note: capText(input.note, 260) || '',
        appliedAt: nowIso,
      },
      metadata: {
        capability: CcoConversationActionCapability.name,
        version: CcoConversationActionCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
        requestId: normalizeText(safeContext.requestId) || '',
        correlationId: normalizeText(safeContext.correlationId) || '',
      },
      warnings: [],
    };
  }
}

module.exports = {
  CcoConversationActionCapability,
  ccoConversationActionCapability: CcoConversationActionCapability,
};
