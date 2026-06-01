// @ts-nocheck
const { extractEmail, resolveCounterpartyIdentity } = require('./ccoCounterpartyTruth');
const { toCanonicalMailboxConversationKey } = require('./ccoMailboxTruthWorklistReadModel');

function normalizeIdentityCarrier(value = {}) {
  const safeValue = asObject(value);
  const customerIdentity = asObject(safeValue.customerIdentity || safeValue.identity);
  const hardConflictSignals = asArray(safeValue.hardConflictSignals).filter(
    (item) => item !== null && item !== undefined
  );
  const mergeReviewDecisionsByPairId = asObject(safeValue.mergeReviewDecisionsByPairId);
  const identityProvenance = asObject(safeValue.identityProvenance || safeValue.provenance);
  return {
    customerIdentity: Object.keys(customerIdentity).length ? customerIdentity : null,
    hardConflictSignals,
    mergeReviewDecisionsByPairId,
    identityProvenance: Object.keys(identityProvenance).length ? identityProvenance : null,
  };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeMailboxId(value = '') {
  return normalizeText(value).toLowerCase();
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function maskPreview(value = '', maxLength = 360) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function normalizeDirection(value = '', folderType = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['inbound', 'outbound', 'draft'].includes(normalized)) return normalized;
  const safeFolderType = normalizeText(folderType).toLowerCase();
  if (safeFolderType === 'inbox') return 'inbound';
  if (safeFolderType === 'sent') return 'outbound';
  if (safeFolderType === 'drafts') return 'draft';
  return 'unknown';
}

function deriveCounterparty(message = {}, _mailboxId = '') {
  const direction = normalizeDirection(message.direction, message.folderType);
  const counterparty = resolveCounterpartyIdentity(message, { direction });
  const email = extractEmail(counterparty.email) || null;
  return {
    email,
    name: normalizeText(counterparty.displayName) || null,
  };
}

function resolveMessageSortIso(message = {}) {
  return (
    toIso(message.lastModifiedAt) ||
    toIso(message.receivedAt) ||
    toIso(message.sentAt) ||
    toIso(message.createdAt) ||
    null
  );
}

function resolveConversationFilterSet(conversationIds = []) {
  const filterSet = new Set();
  for (const rawId of asArray(conversationIds)) {
    const normalized = normalizeText(rawId);
    if (!normalized) continue;
    filterSet.add(normalized);
    const colonIndex = normalized.lastIndexOf(':');
    if (colonIndex > 0) {
      filterSet.add(normalized.slice(colonIndex + 1));
    }
  }
  return filterSet;
}

function conversationMatchesFilter(
  conversationKey = '',
  conversationId = '',
  filterSet = new Set()
) {
  if (!filterSet || filterSet.size === 0) return true;
  const candidates = [normalizeText(conversationKey), normalizeText(conversationId)].filter(
    Boolean
  );
  for (const candidate of candidates) {
    if (filterSet.has(candidate)) return true;
    const colonIndex = candidate.lastIndexOf(':');
    if (colonIndex > 0 && filterSet.has(candidate.slice(colonIndex + 1))) return true;
  }
  return false;
}

function buildAnalyzeInboxSnapshotFromMailboxTruth({
  ccoMailboxTruthStore = null,
  mailboxIds = [],
  lookbackDays = 365,
  conversationIds = [],
} = {}) {
  if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
    return {
      ok: false,
      reason: 'truth_store_unavailable',
      snapshot: null,
    };
  }

  const resolvedMailboxIds = asArray(mailboxIds)
    .map((item) => normalizeMailboxId(item))
    .filter(Boolean);
  const safeLookbackDays = Math.max(1, Math.min(3650, Number(lookbackDays) || 365));
  const windowStartMs = Date.now() - safeLookbackDays * 24 * 60 * 60 * 1000;
  const conversationFilter = resolveConversationFilterSet(conversationIds);
  const capturedAt = new Date().toISOString();

  const messages = ccoMailboxTruthStore.listMessages({
    mailboxIds: resolvedMailboxIds.length > 0 ? resolvedMailboxIds : undefined,
  });

  const grouped = new Map();
  let inboundMessageCount = 0;
  let outboundMessageCount = 0;

  for (const rawMessage of asArray(messages)) {
    const message = asObject(rawMessage);
    const mailboxId = normalizeMailboxId(
      message.mailboxId || message.mailboxAddress || message.userPrincipalName
    );
    if (resolvedMailboxIds.length > 0 && mailboxId && !resolvedMailboxIds.includes(mailboxId)) {
      continue;
    }

    const folderType = normalizeText(message.folderType).toLowerCase();
    if (folderType === 'deleted') continue;

    const sortIso = resolveMessageSortIso(message);
    if (sortIso && Date.parse(sortIso) < windowStartMs) continue;

    const graphMessageId = normalizeText(message.graphMessageId);
    if (!graphMessageId) continue;

    const conversationKey = toCanonicalMailboxConversationKey({
      mailboxId,
      conversationId: message.conversationId,
      mailboxConversationId: message.mailboxConversationId,
      messageId: graphMessageId,
    });
    if (!conversationKey) continue;
    if (!conversationMatchesFilter(conversationKey, message.conversationId, conversationFilter)) {
      continue;
    }

    const direction = normalizeDirection(message.direction, folderType);
    if (direction === 'draft') continue;
    const normalizedDirection = direction === 'outbound' ? 'outbound' : 'inbound';
    if (normalizedDirection === 'inbound') inboundMessageCount += 1;
    else outboundMessageCount += 1;

    const counterparty = deriveCounterparty(message, mailboxId);
    const identityCarrier = normalizeIdentityCarrier(message);
    const entry = grouped.get(conversationKey) || {
      conversationKey,
      conversationId: conversationKey,
      mailboxId: mailboxId || null,
      mailboxAddress: mailboxId || null,
      userPrincipalName: normalizeMailboxId(message.userPrincipalName || mailboxId) || mailboxId,
      subject: normalizeText(message.subject) || '(utan ämne)',
      customerEmail: counterparty.email || null,
      customerName: counterparty.name || null,
      customerIdentity: identityCarrier.customerIdentity || null,
      hardConflictSignals: identityCarrier.hardConflictSignals || [],
      mergeReviewDecisionsByPairId: identityCarrier.mergeReviewDecisionsByPairId || {},
      identityProvenance: identityCarrier.identityProvenance || null,
      lastInboundAt: null,
      lastOutboundAt: null,
      messages: [],
    };

    if (!entry.customerEmail && counterparty.email) entry.customerEmail = counterparty.email;
    if (!entry.customerName && counterparty.name) entry.customerName = counterparty.name;
    if (!entry.customerIdentity && identityCarrier.customerIdentity) {
      entry.customerIdentity = identityCarrier.customerIdentity;
    }

    const sentAt = sortIso;
    if (
      normalizedDirection === 'inbound' &&
      sentAt &&
      (!entry.lastInboundAt || sentAt > entry.lastInboundAt)
    ) {
      entry.lastInboundAt = sentAt;
    }
    if (
      normalizedDirection === 'outbound' &&
      sentAt &&
      (!entry.lastOutboundAt || sentAt > entry.lastOutboundAt)
    ) {
      entry.lastOutboundAt = sentAt;
    }

    entry.messages.push({
      messageId: graphMessageId,
      conversationId: normalizeText(message.conversationId) || conversationKey,
      subject: normalizeText(message.subject) || entry.subject,
      direction: normalizedDirection,
      isRead:
        normalizedDirection === 'inbound' && typeof message.isRead === 'boolean'
          ? message.isRead
          : null,
      sentAt,
      bodyPreview: maskPreview(message.bodyPreview, 360),
      bodyHtml: null,
      hasAttachments: message.hasAttachments === true,
      attachments: [],
      mailboxId: mailboxId || null,
      mailboxAddress: mailboxId || null,
      userPrincipalName: entry.userPrincipalName || null,
      senderEmail:
        extractEmail(message.from?.address || message.senderEmail) || counterparty.email || null,
      senderName:
        normalizeText(message.from?.name || message.senderName) || counterparty.name || null,
      recipients: asArray(message.toRecipients || message.recipients)
        .map((item) =>
          extractEmail(
            typeof item === 'string' ? item : item?.address || item?.emailAddress?.address
          )
        )
        .filter(Boolean)
        .slice(0, 20),
      replyToRecipients: asArray(message.replyToRecipients)
        .map((item) =>
          extractEmail(
            typeof item === 'string' ? item : item?.address || item?.emailAddress?.address
          )
        )
        .filter(Boolean)
        .slice(0, 20),
      internetMessageId: normalizeText(message.internetMessageId) || null,
      inReplyTo: normalizeText(message.inReplyTo) || null,
      references: [],
    });

    grouped.set(conversationKey, entry);
  }

  const conversations = Array.from(grouped.values())
    .map((entry) => {
      entry.messages.sort((left, right) =>
        String(right.sentAt || '').localeCompare(String(left.sentAt || ''))
      );
      return entry;
    })
    .sort((left, right) => {
      const leftActivity = left.lastInboundAt || left.lastOutboundAt || '';
      const rightActivity = right.lastInboundAt || right.lastOutboundAt || '';
      return String(rightActivity).localeCompare(String(leftActivity));
    });

  const messageCount = conversations.reduce(
    (total, conversation) => total + asArray(conversation.messages).length,
    0
  );

  return {
    ok: true,
    reason: null,
    snapshot: {
      snapshotVersion: 'mailbox_truth.inbox.snapshot.v1',
      source: 'mailbox_truth_store',
      timestamps: {
        capturedAt,
        sourceGeneratedAt: capturedAt,
      },
      conversations,
      metadata: {
        connector: 'MailboxTruthSnapshotBuilder',
        windowDays: safeLookbackDays,
        mailboxIds: resolvedMailboxIds,
        conversationFilterCount: conversationFilter.size,
        conversationCount: conversations.length,
        messageCount,
        inboundMessageCount,
        outboundMessageCount,
      },
    },
  };
}

module.exports = {
  buildAnalyzeInboxSnapshotFromMailboxTruth,
  maskPreview,
};
