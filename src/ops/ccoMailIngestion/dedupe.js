const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function buildDedupeKey({
  mailboxId = '',
  folderId = '',
  graphMessageId = '',
  immutableGraphId = '',
  internetMessageId = '',
  conversationId = '',
  receivedDateTime = '',
  subject = '',
  fromEmail = '',
} = {}) {
  const stableId =
    normalizeText(immutableGraphId) ||
    normalizeText(internetMessageId) ||
    normalizeText(graphMessageId);
  if (stableId) {
    return [
      normalizeEmail(mailboxId),
      normalizeText(folderId),
      stableId.toLowerCase(),
    ]
      .filter(Boolean)
      .join(':');
  }

  const fallbackPayload = [
    normalizeEmail(mailboxId),
    normalizeText(folderId),
    normalizeText(conversationId),
    normalizeText(receivedDateTime),
    normalizeEmail(fromEmail),
    normalizeText(subject).toLowerCase(),
  ]
    .filter(Boolean)
    .join('|');

  return `hash:${crypto.createHash('sha256').update(fallbackPayload).digest('hex')}`;
}

function buildDedupeKeyFromTruthMessage(message = {}) {
  const from =
    message.from && typeof message.from === 'object'
      ? message.from
      : { address: message.fromEmail || message.senderEmail || '' };

  return buildDedupeKey({
    mailboxId: message.mailboxId,
    folderId: message.folderId,
    graphMessageId: message.graphMessageId,
    immutableGraphId: message.immutableGraphId,
    internetMessageId: message.internetMessageId,
    conversationId: message.conversationId || message.mailboxConversationId,
    receivedDateTime: message.receivedAt || message.receivedDateTime,
    subject: message.subject,
    fromEmail: from.address || from.email || message.fromEmail,
  });
}

module.exports = {
  buildDedupeKey,
  buildDedupeKeyFromTruthMessage,
};
