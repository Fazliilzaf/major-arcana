'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const TONE_VARIANTS = Object.freeze(['professional', 'warm', 'short']);

function buildDraftFromConversation(conversation, { tone = 'professional', templates = [] } = {}) {
  const customerName = normalizeText(conversation?.customerName || conversation?.from?.name || 'kund');
  const subject = normalizeText(conversation?.subject || '');
  const lastMessage = normalizeText(conversation?.latestInboundBody || conversation?.snippet || '');
  const intent = normalizeText(conversation?.detectedIntent || conversation?.intent || 'general');

  const matchingTemplate = templates.find((t) =>
    normalizeText(t?.category).toLowerCase() === intent.toLowerCase() ||
    (subject && normalizeText(t?.name).toLowerCase().includes(subject.toLowerCase().slice(0, 20)))
  );

  const greeting = tone === 'short' ? `Hej ${customerName},` : `Hej ${customerName},\n`;
  const closing = tone === 'short' ? '\nMvh'
    : tone === 'warm' ? `\nVarma hälsningar,`
    : `\nMed vänlig hälsning,`;

  let body;
  if (matchingTemplate?.content) {
    body = normalizeText(matchingTemplate.content)
      .replace(/\{\{first_name\}\}/g, customerName)
      .replace(/\{\{clinic_name\}\}/g, 'Hair TP Clinic');
  } else if (intent === 'booking' || /bok|tid|appointment/i.test(lastMessage)) {
    body = `Tack för ditt meddelande. Jag återkommer med förslag på tider för din konsultation.\n\nOm du har specifika önskemål om dag eller tid, hör gärna av dig direkt.`;
  } else if (intent === 'aftercare' || /eftervård|efter.*behandling/i.test(lastMessage)) {
    body = `Tack för att du hör av dig. Det låter som att allt går enligt plan.\n\nOm du har ytterligare frågor om din eftervård, tveka inte att kontakta oss.`;
  } else {
    body = `Tack för ditt meddelande. Jag har tagit del av det och återkommer inom kort med ett utförligt svar.\n\nHör gärna av dig om du har ytterligare frågor under tiden.`;
  }

  return {
    conversationId: normalizeText(conversation?.conversationId || conversation?.id),
    customerEmail: normalizeText(conversation?.customerEmail),
    customerName,
    subject,
    intent,
    tone,
    draft: `${greeting}\n${body}${closing}`,
    templateUsed: matchingTemplate ? normalizeText(matchingTemplate?.name || matchingTemplate?.id) : null,
    confidence: matchingTemplate ? 'high' : 'medium',
  };
}

class PrepareResponseDraftsCapability extends BaseCapability {
  static name = 'PrepareResponseDrafts';
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
      maxDrafts: { type: 'integer', minimum: 1, maximum: 10 },
      tone: { type: 'string', enum: ['professional', 'warm', 'short'] },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: { type: 'object', required: ['drafts', 'summary', 'generatedAt'], additionalProperties: true },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input = asObject(safeContext.input);
    const snapshot = asObject(safeContext.systemStateSnapshot);
    const maxDrafts = Math.max(1, Math.min(10, toNumber(input.maxDrafts, 5)));
    const tone = TONE_VARIANTS.includes(normalizeText(input.tone)) ? normalizeText(input.tone) : 'professional';
    const warnings = [];

    const conversations = asArray(snapshot.conversations);
    const templates = asArray(snapshot.templates);

    const needsReply = conversations.filter((c) => {
      const status = normalizeText(c?.status || c?.actionRequired).toLowerCase();
      return status === 'needs_reply' || status === 'unread' || status === 'inbound' || c?.needsReply === true;
    });

    if (needsReply.length === 0 && conversations.length > 0) {
      warnings.push('Inga konversationer markerade som needs_reply hittades. Visar drafts för senaste inbound.');
      needsReply.push(
        ...conversations
          .filter((c) => normalizeText(c?.direction).toLowerCase() === 'inbound')
          .slice(0, maxDrafts)
      );
    }

    if (needsReply.length === 0) {
      warnings.push('Inga konversationer att förbereda drafts för.');
    }

    const drafts = needsReply.slice(0, maxDrafts).map((conversation) =>
      buildDraftFromConversation(conversation, { tone, templates })
    );

    const highConfidence = drafts.filter((d) => d.confidence === 'high').length;
    const summary = `${drafts.length} svarsutkast förberedda (ton: ${tone}). ` +
      `${highConfidence} med hög konfidens (template-matchade). ` +
      `${drafts.length - highConfidence} med medel konfidens (generiska).`;

    return {
      data: {
        drafts,
        totalConversations: conversations.length,
        needsReplyCount: needsReply.length,
        preparedCount: drafts.length,
        tone,
        summary,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: PrepareResponseDraftsCapability.name,
        version: PrepareResponseDraftsCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId: normalizeText(safeContext.tenantId) || 'unknown',
      },
      warnings,
    };
  }
}

module.exports = {
  PrepareResponseDraftsCapability,
};
