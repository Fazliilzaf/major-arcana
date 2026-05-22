function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function extractEmail(value = '') {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return '';
  const match = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0].toLowerCase() : '';
}

function normalizeMailboxId(value = '') {
  return normalizeText(value).toLowerCase();
}

function titleCaseParts(parts = []) {
  return parts
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function humanizeCounterpartyEmail(email = '') {
  const normalizedEmail = extractEmail(email);
  if (!normalizedEmail) return '';
  const [localPart = '', domainPart = ''] = normalizedEmail.split('@');
  const normalizedLocalPart = normalizeMailboxId(localPart);
  const genericLocalParts = new Set([
    'info',
    'support',
    'contact',
    'kontakt',
    'hello',
    'mail',
    'mailer',
    'news',
    'newsletter',
    'noreply',
    'no-reply',
    'reply',
    'service',
    'team',
    'admin',
    'booking',
    'bokning',
    'order',
    'orders',
    'receipt',
    'receipts',
  ]);
  const technicalDomainParts = new Set([
    'app',
    'cdn',
    'email',
    'img',
    'image',
    'mail',
    'mailer',
    'news',
    'newsletter',
    'noreply',
    'no-reply',
    'reply',
    'support',
    'kontakt',
    'contact',
    'www',
    'e',
  ]);

  if (!genericLocalParts.has(normalizedLocalPart)) {
    return titleCaseParts(localPart.split(/[._+-]+/g));
  }

  const domainTokens = domainPart.split('.').filter(Boolean);
  if (domainTokens.length >= 2) {
    const suffix = domainTokens[domainTokens.length - 1];
    const baseTokens = domainTokens.slice(0, -1).filter(Boolean);
    const meaningfulBase =
      [...baseTokens]
        .reverse()
        .find((part) => {
          const normalizedPart = normalizeMailboxId(part);
          return (
            normalizedPart &&
            normalizedPart.length > 1 &&
            !technicalDomainParts.has(normalizedPart)
          );
        }) || baseTokens[baseTokens.length - 1];
    if (meaningfulBase) {
      return titleCaseParts([meaningfulBase, suffix]);
    }
  }

  return titleCaseParts(localPart.split(/[._+-]+/g));
}

function resolveCounterpartyDisplayName(name = '', email = '') {
  const normalizedName = normalizeText(name);
  const normalizedEmail = extractEmail(email);
  const extractedNameEmail = extractEmail(normalizedName);
  if (normalizedName && (!extractedNameEmail || extractedNameEmail !== normalizedEmail)) {
    return normalizedName;
  }
  return humanizeCounterpartyEmail(normalizedEmail) || normalizedName || null;
}

function buildMailboxIdentitySet(message = {}, mailboxId = '', mailboxIds = []) {
  const safeMessage = asObject(message);
  return new Set(
    [
      mailboxId,
      ...asArray(mailboxIds),
      safeMessage.mailboxId,
      safeMessage.mailboxAddress,
      safeMessage.userPrincipalName,
    ]
      .map((item) => extractEmail(item))
      .filter(Boolean)
  );
}

function normalizeCounterpartyDirection(direction = '') {
  const normalized = normalizeText(direction).toLowerCase();
  if (normalized === 'draft') return 'outbound';
  if (normalized === 'inbound' || normalized === 'outbound') return normalized;
  return 'unknown';
}

function resolveCounterpartyIdentity(message = {}, { mailboxId = '', mailboxIds = [], direction = '' } = {}) {
  const safeMessage = asObject(message);
  const mailboxIdentitySet = buildMailboxIdentitySet(safeMessage, mailboxId, mailboxIds);
  const safeDirection = normalizeCounterpartyDirection(direction);
  const sender = asObject(safeMessage.from);
  const recipientCandidates = [
    ...asArray(safeMessage.replyToRecipients),
    ...asArray(safeMessage.toRecipients),
    ...asArray(safeMessage.ccRecipients),
    ...asArray(safeMessage.bccRecipients),
  ].map((item) => asObject(item));

  const fromIdentity = {
    email: extractEmail(sender.address) || null,
    rawName: normalizeText(sender.name) || null,
  };

  if (safeDirection === 'inbound') {
    const displayName = resolveCounterpartyDisplayName(fromIdentity.rawName, fromIdentity.email);
    return {
      email: fromIdentity.email,
      rawName: fromIdentity.rawName,
      name: displayName,
      displayName,
      fallbackLabel: displayName || fromIdentity.email || null,
    };
  }

  const recipient = recipientCandidates
    .map((item) => ({
      email: extractEmail(item.address) || null,
      rawName: normalizeText(item.name) || null,
    }))
    .find((item) => item.email && !mailboxIdentitySet.has(item.email));

  if (recipient) {
    const displayName = resolveCounterpartyDisplayName(recipient.rawName, recipient.email);
    return {
      email: recipient.email,
      rawName: recipient.rawName,
      name: displayName,
      displayName,
      fallbackLabel: displayName || recipient.email || null,
    };
  }

  if (fromIdentity.email && !mailboxIdentitySet.has(fromIdentity.email)) {
    const displayName = resolveCounterpartyDisplayName(fromIdentity.rawName, fromIdentity.email);
    return {
      email: fromIdentity.email,
      rawName: fromIdentity.rawName,
      name: displayName,
      displayName,
      fallbackLabel: displayName || fromIdentity.email || null,
    };
  }

  return {
    email: null,
    rawName: null,
    name: null,
    displayName: null,
    fallbackLabel: null,
  };
}

module.exports = {
  extractEmail,
  humanizeCounterpartyEmail,
  normalizeCounterpartyDirection,
  resolveCounterpartyDisplayName,
  resolveCounterpartyIdentity,
};
