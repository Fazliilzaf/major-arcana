const crypto = require('node:crypto');
const { maskInboxText } = require('../privacy/inboxMasking');

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

function clampInt(value, min, max, fallback) {
  const parsed = Math.floor(toNumber(value, fallback));
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeUserScope(value, fallback = 'single') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'all' || normalized === 'single') return normalized;
  return fallback;
}

function normalizeMailboxIndexes(value = null, maxUsers = 200) {
  const tokens = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[,\s]+/)
        .map((item) => normalizeText(item))
        .filter(Boolean);
  const safeIndexes = [];
  const seen = new Set();
  for (const token of tokens) {
    const parsed = Number.parseInt(String(token ?? ''), 10);
    if (!Number.isFinite(parsed)) continue;
    if (parsed < 1 || parsed > maxUsers) continue;
    if (seen.has(parsed)) continue;
    seen.add(parsed);
    safeIndexes.push(parsed);
  }
  return safeIndexes;
}

function normalizeMailboxIds(value = null, maxItems = 200) {
  const tokens = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[,\s]+/)
        .map((item) => normalizeText(item))
        .filter(Boolean);
  const safeIds = [];
  const seen = new Set();
  for (const token of tokens) {
    const normalized = normalizeText(token).toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    if (safeIds.length >= maxItems) break;
    seen.add(normalized);
    safeIds.push(normalized);
  }
  return safeIds;
}

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function toIsoFromMs(value) {
  if (!Number.isFinite(value)) return '';
  return toIso(new Date(value));
}

function compareIsoDesc(a = '', b = '') {
  return String(b || '').localeCompare(String(a || ''));
}

function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeHeaderMessageId(value = '') {
  const raw = normalizeText(value);
  if (!raw) return '';
  const match = raw.match(/<([^>]+)>/);
  const normalized = match ? match[1] : raw;
  return normalizeText(normalized.replace(/[<>]/g, '')).toLowerCase();
}

function normalizeSubjectForCorrelation(value = '') {
  let subject = normalizeText(value).toLowerCase();
  if (!subject) return '';
  const prefixPattern = /^(re|sv|fw|fwd)\s*:\s*/i;
  let previous = '';
  while (subject && subject !== previous) {
    previous = subject;
    subject = subject.replace(prefixPattern, '').trim();
  }
  return subject.replace(/\s+/g, ' ');
}

function toRecipientList(value = []) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item) => normalizeText(item?.emailAddress?.address))
    .filter(Boolean)
    .slice(0, 20);
}

function toHeaderValue(headers = [], name = '') {
  const safeName = normalizeText(name).toLowerCase();
  if (!safeName) return '';
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const matched = safeHeaders.find(
    (entry) => normalizeText(entry?.name).toLowerCase() === safeName
  );
  return normalizeText(matched?.value);
}

function toReferenceIds(rawValue = '') {
  const source = normalizeText(rawValue);
  if (!source) return [];
  return source
    .split(/\s+/)
    .map((item) => normalizeHeaderMessageId(item))
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeEmailAddress(value = '') {
  const raw = normalizeText(value);
  if (!raw) return '';
  const bracketMatch = raw.match(/<([^>]+)>/);
  const candidate = normalizeText((bracketMatch ? bracketMatch[1] : raw).replace(/^mailto:/i, ''));
  if (!candidate) return '';
  const parts = candidate.split('@');
  if (parts.length !== 2) return '';
  const localPart = normalizeText(parts[0]).toLowerCase();
  const domainPart = normalizeText(parts[1]).toLowerCase();
  if (!localPart || !domainPart) return '';
  return `${localPart}@${domainPart}`;
}

function toEmailAliases(value = '') {
  const normalized = normalizeEmailAddress(value);
  if (!normalized) return [];
  const [localPart = '', domainPart = ''] = normalized.split('@');
  const aliases = new Set([normalized]);
  const plusNormalized = localPart.replace(/\+.*/, '');
  if (plusNormalized && plusNormalized !== localPart) {
    aliases.add(`${plusNormalized}@${domainPart}`);
  }
  const separatorless = plusNormalized.replace(/[._-]/g, '');
  if (separatorless && separatorless !== plusNormalized) {
    aliases.add(`${separatorless}@${domainPart}`);
  }
  const alnumOnly = plusNormalized.replace(/[^a-z0-9]/gi, '');
  if (alnumOnly && alnumOnly !== separatorless && alnumOnly !== plusNormalized) {
    aliases.add(`${alnumOnly}@${domainPart}`);
  }
  if (domainPart === 'gmail.com' || domainPart === 'googlemail.com') {
    const dotless = plusNormalized.replace(/\./g, '');
    if (dotless) aliases.add(`${dotless}@${domainPart}`);
  }
  const domainRootMatch = domainPart.match(/^([a-z0-9.-]+)\.(com|se|net|org)$/i);
  if (domainRootMatch) {
    const domainRoot = normalizeText(domainRootMatch[1]).toLowerCase();
    const tld = normalizeText(domainRootMatch[2]).toLowerCase();
    if (domainRoot) {
      if (tld === 'com' || tld === 'se') {
        aliases.add(`${plusNormalized}@${domainRoot}.${tld === 'com' ? 'se' : 'com'}`);
        if (separatorless) {
          aliases.add(`${separatorless}@${domainRoot}.${tld === 'com' ? 'se' : 'com'}`);
        }
      }
    }
  }
  return Array.from(aliases);
}

function extractEmailsFromHeaderValue(value = '') {
  const source = normalizeText(value);
  if (!source) return [];
  const matches = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return matches.map((item) => normalizeEmailAddress(item)).filter(Boolean);
}

function toReplyToList(value = [], internetHeaders = []) {
  const fromField = toRecipientList(value).map((item) => normalizeEmailAddress(item)).filter(Boolean);
  const fromHeader = extractEmailsFromHeaderValue(toHeaderValue(internetHeaders, 'reply-to'));
  return Array.from(new Set([...fromField, ...fromHeader])).slice(0, 20);
}

function inferCounterpartyEmails({
  direction = 'inbound',
  senderEmail = '',
  recipients = [],
  replyTo = [],
} = {}) {
  const safeRecipients = Array.isArray(recipients) ? recipients : [];
  const safeReplyTo = Array.isArray(replyTo) ? replyTo : [];
  const candidates =
    direction === 'inbound' ? [senderEmail, ...safeReplyTo] : [...safeReplyTo, ...safeRecipients];
  const aliases = new Set();
  for (const candidate of candidates) {
    for (const alias of toEmailAliases(candidate)) aliases.add(alias);
  }
  return Array.from(aliases).slice(0, 20);
}

function requiredConfig(name, value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`MicrosoftGraphReadConnector requires ${name}.`);
  }
  return normalized;
}

function parseGraphError(payload = {}, fallback = 'request_failed') {
  const graphError = payload && typeof payload.error === 'object' ? payload.error : {};
  return (
    normalizeText(graphError.message) ||
    normalizeText(payload?.error_description) ||
    normalizeText(payload?.message) ||
    fallback
  );
}

function createGraphError(message, { code = '', status = 0, retryAfterSeconds = null, details = null } = {}) {
  const error = new Error(normalizeText(message) || 'graph_request_failed');
  if (code) error.code = code;
  if (Number.isFinite(Number(status)) && Number(status) > 0) error.status = Number(status);
  const rawRetryAfter = retryAfterSeconds;
  const normalizedRetryAfter =
    rawRetryAfter === null || rawRetryAfter === undefined || rawRetryAfter === ''
      ? Number.NaN
      : Number(rawRetryAfter);
  if (Number.isFinite(normalizedRetryAfter) && normalizedRetryAfter >= 0) {
    error.retryAfterSeconds = normalizedRetryAfter;
  }
  if (details && typeof details === 'object') error.details = details;
  return error;
}

function parseRetryAfterSeconds(response) {
  const raw =
    normalizeText(response?.headers?.get?.('retry-after')) ||
    normalizeText(response?.headers?.get?.('x-ms-retry-after-ms'));
  if (!raw) return null;
  const asNumber = Number(raw);
  if (!Number.isFinite(asNumber) || asNumber < 0) return null;
  if (String(raw).includes('.') || asNumber > 1000) {
    return Math.round(asNumber / 1000);
  }
  return Math.round(asNumber);
}

async function parseJsonResponse(response, label = 'request') {
  let payload = {};
  try {
    payload = (await response.json()) || {};
  } catch (_error) {
    payload = {};
  }
  if (response?.ok) return payload;
  const status = Number(response?.status || 0);
  const message = parseGraphError(payload, 'graph_request_failed');
  throw createGraphError(`${label} failed (${status || 'n/a'}): ${message}`, {
    code: 'GRAPH_REQUEST_FAILED',
    status,
    details: payload,
  });
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 5000) {
  const safeTimeoutMs = clampInt(timeoutMs, 500, 120000, 5000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), safeTimeoutMs);
  if (typeof timer?.unref === 'function') timer.unref();

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    if (isAbort) {
      throw createGraphError(`Request timeout after ${safeTimeoutMs}ms`, {
        code: 'GRAPH_TIMEOUT',
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function sleepMs(delayMs = 0) {
  const safeDelayMs = Math.max(0, Number(delayMs || 0));
  if (!safeDelayMs) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, safeDelayMs);
    if (typeof timer?.unref === 'function') timer.unref();
  });
}

function isRetryableGraphError(error = {}) {
  const code = normalizeText(error?.code).toUpperCase();
  if (code === 'GRAPH_RATE_LIMITED' || code === 'GRAPH_TIMEOUT') return true;
  if (code === 'GRAPH_REQUEST_FAILED') {
    const status = Number(error?.status || 0);
    if (status >= 500) return true;
    if (status === 408 || status === 429) return true;
  }
  return false;
}

function toRetryDelayMs({
  error = null,
  attempt = 1,
  retryBaseDelayMs = 500,
  retryMaxDelayMs = 5000,
} = {}) {
  const rawRetryAfter = error?.retryAfterSeconds;
  const fromHeader =
    rawRetryAfter === null || rawRetryAfter === undefined || rawRetryAfter === ''
      ? Number.NaN
      : Number(rawRetryAfter);
  if (Number.isFinite(fromHeader) && fromHeader >= 0) {
    return Math.min(Math.max(0, fromHeader * 1000), Math.max(100, retryMaxDelayMs));
  }
  const safeAttempt = Math.max(1, Number(attempt || 1));
  const safeBase = clampInt(retryBaseDelayMs, 100, 10000, 500);
  const safeMax = clampInt(retryMaxDelayMs, 200, 30000, 5000);
  return Math.min(safeMax, safeBase * Math.pow(2, safeAttempt - 1));
}

const RISK_WORD_DEFS = Object.freeze([
  { code: 'akut', pattern: /\bakut\b/i },
  { code: 'andningssvarigheter', pattern: /\bandningssvarigheter\b/i },
  { code: 'feber', pattern: /\bfeber\b/i },
  { code: 'infektion', pattern: /\binfektion\b/i },
  { code: 'smarta', pattern: /\bsmarta\b/i },
  { code: 'svullnad', pattern: /\bsvullnad\b/i },
]);

function extractRiskWords(text = '') {
  const source = normalizeText(text);
  if (!source) return [];
  const hits = [];
  for (const definition of RISK_WORD_DEFS) {
    if (!definition.pattern.test(source)) continue;
    hits.push(definition.code);
  }
  return hits;
}

function toScopedConversationId(conversationId, mailboxKey) {
  const normalizedConversationId = normalizeText(conversationId);
  const normalizedMailboxKey = normalizeText(mailboxKey);
  if (!normalizedConversationId) return '';
  if (!normalizedMailboxKey) return normalizedConversationId;
  return `${normalizedMailboxKey}:${normalizedConversationId}`;
}

function toNormalizedMessage(
  raw = {},
  { mailboxId = '', mailboxKey = '', mailboxAddress = '', userPrincipalName = '', direction = 'inbound' } = {}
) {
  const messageId = normalizeText(raw.id);
  if (!messageId) return null;
  const normalizedDirection = direction === 'outbound' ? 'outbound' : 'inbound';
  const rawConversationId = normalizeText(raw.conversationId);
  const conversationId = toScopedConversationId(rawConversationId, mailboxKey) || rawConversationId;
  const subject = maskInboxText(raw.subject, 180) || '(utan amne)';
  const bodyPreview = maskInboxText(raw.bodyPreview, 360);
  const sentAt =
    toIso(
      normalizedDirection === 'outbound'
        ? raw.sentDateTime || raw.receivedDateTime
        : raw.receivedDateTime || raw.sentDateTime
    ) || null;
  const senderEmail = normalizeText(raw?.from?.emailAddress?.address);
  const senderName = normalizeText(raw?.from?.emailAddress?.name);
  const recipients = toRecipientList(raw?.toRecipients);
  const internetHeaders = Array.isArray(raw?.internetMessageHeaders) ? raw.internetMessageHeaders : [];
  const replyTo = toReplyToList(raw?.replyTo, internetHeaders);
  const inReplyTo =
    normalizeHeaderMessageId(raw?.inReplyTo) ||
    normalizeHeaderMessageId(toHeaderValue(internetHeaders, 'in-reply-to')) ||
    null;
  const references = [
    ...toReferenceIds(raw?.references),
    ...toReferenceIds(toHeaderValue(internetHeaders, 'references')),
  ];
  const dedupedReferences = Array.from(new Set(references));
  const internetMessageId = normalizeHeaderMessageId(raw?.internetMessageId) || null;
  const riskWords = extractRiskWords(`${subject}\n${bodyPreview}`);
  const normalizedSubject = normalizeSubjectForCorrelation(subject);
  const counterpartyEmails = inferCounterpartyEmails({
    direction: normalizedDirection,
    senderEmail,
    recipients,
    replyTo,
  });
  const counterpartyEmail = counterpartyEmails[0] || '';

  return {
    messageId,
    conversationId: conversationId || '',
    subject,
    normalizedSubject,
    bodyPreview,
    sentAt,
    direction: normalizedDirection,
    senderEmail: senderEmail || null,
    senderName: senderName || null,
    recipients,
    replyTo,
    counterpartyEmail: counterpartyEmail || null,
    counterpartyEmails,
    internetMessageId,
    inReplyTo,
    references: dedupedReferences,
    riskWords,
    mailboxId: normalizeText(mailboxId) || null,
    mailboxAddress: normalizeText(mailboxAddress) || null,
    userPrincipalName: normalizeText(userPrincipalName) || null,
  };
}

function toConversationSnapshots(messages = []) {
  const map = new Map();
  const conversationAlias = new Map();
  const messageIdAlias = new Map();
  const fallbackAlias = new Map();
  let syntheticCounter = 0;

  const selectPrimaryCustomerEmail = (values = []) => {
    const candidates = asArray(values)
      .map((item) => normalizeEmailAddress(item))
      .filter(Boolean);
    if (candidates.length === 0) return null;
    candidates.sort((left, right) => {
      const leftLocalPart = left.split('@')[0] || '';
      const rightLocalPart = right.split('@')[0] || '';
      const leftHasPlus = leftLocalPart.includes('+');
      const rightHasPlus = rightLocalPart.includes('+');
      if (leftHasPlus !== rightHasPlus) return leftHasPlus ? 1 : -1;
      if (left.length !== right.length) return left.length - right.length;
      return left.localeCompare(right);
    });
    return candidates[0];
  };

  const resolveFallbackKeys = (message = {}) => {
    const subject = normalizeText(message.normalizedSubject);
    const mailbox = normalizeText(message.mailboxId).toLowerCase();
    if (!subject) return [];
    const compactSubject = subject.replace(/[^a-z0-9]/gi, '');
    const emailCandidates = [
      ...asArray(message.counterpartyEmails),
      normalizeText(message.counterpartyEmail),
    ]
      .flatMap((item) => toEmailAliases(item))
      .filter(Boolean);
    const uniqueEmails = Array.from(new Set(emailCandidates));
    if (uniqueEmails.length === 0) return [];
    const keys = [];
    uniqueEmails.forEach((email) => {
      if (mailbox) keys.push(`${mailbox}|${email}|${subject}`);
      keys.push(`global|${email}|${subject}`);
      if (compactSubject) {
        if (mailbox) keys.push(`${mailbox}|${email}|${compactSubject}`);
        keys.push(`global|${email}|${compactSubject}`);
      }
    });
    return keys;
  };

  const sortedMessages = asArray(messages)
    .slice()
    .sort((left, right) => String(left?.sentAt || '').localeCompare(String(right?.sentAt || '')));

  for (const message of sortedMessages) {
    if (!message) continue;
    const rawConversationId = normalizeText(message.conversationId);
    const fallbackKeys = resolveFallbackKeys(message);
    const linkedMessageIds = [
      normalizeHeaderMessageId(message.inReplyTo),
      ...asArray(message.references).map((item) => normalizeHeaderMessageId(item)),
    ].filter(Boolean);

    let clusterId = '';
    if (rawConversationId && conversationAlias.has(rawConversationId)) {
      clusterId = conversationAlias.get(rawConversationId);
    }
    if (!clusterId) {
      const matchedLinked = linkedMessageIds.find((id) => messageIdAlias.has(id));
      if (matchedLinked) clusterId = messageIdAlias.get(matchedLinked);
    }
    if (!clusterId && fallbackKeys.length > 0) {
      const matchedFallback = fallbackKeys.find((key) => fallbackAlias.has(key));
      if (matchedFallback) clusterId = fallbackAlias.get(matchedFallback);
    }
    if (!clusterId && rawConversationId) {
      clusterId = rawConversationId;
    }
    if (!clusterId) {
      syntheticCounter += 1;
      clusterId = `cluster:${syntheticCounter}:${normalizeText(message.messageId)}`;
    }

    if (!map.has(clusterId)) {
      map.set(clusterId, {
        clusterId,
        primaryConversationId: rawConversationId || '',
        conversationIds: new Set(),
        subject: message.subject,
        status: 'open',
        lastInboundAt: message.sentAt || null,
        lastOutboundAt: null,
        messages: [],
        riskWords: [],
        mailboxId: normalizeText(message.mailboxId) || null,
        mailboxAddress: normalizeText(message.mailboxAddress) || null,
        userPrincipalName: normalizeText(message.userPrincipalName) || null,
        customerEmails: new Set(),
        customerEmailSources: new Set(),
      });
    }
    const entry = map.get(clusterId);
    if (rawConversationId) {
      entry.conversationIds.add(rawConversationId);
      conversationAlias.set(rawConversationId, clusterId);
      if (!entry.primaryConversationId) entry.primaryConversationId = rawConversationId;
    }
    for (const fallbackKey of fallbackKeys) {
      fallbackAlias.set(fallbackKey, clusterId);
    }
    if (message.internetMessageId) {
      messageIdAlias.set(message.internetMessageId, clusterId);
    }

    const messageDirection = message.direction === 'outbound' ? 'outbound' : 'inbound';
    entry.messages.push({
      messageId: message.messageId,
      direction: messageDirection,
      sentAt: message.sentAt,
      bodyPreview: message.bodyPreview,
      mailboxId: normalizeText(message.mailboxId) || null,
      mailboxAddress: normalizeText(message.mailboxAddress) || null,
      userPrincipalName: normalizeText(message.userPrincipalName) || null,
      senderEmail: normalizeText(message.senderEmail).toLowerCase() || null,
      senderName: normalizeText(message.senderName) || null,
      recipients: asArray(message.recipients).slice(0, 20),
      replyTo: asArray(message.replyTo).slice(0, 20),
      internetMessageId: normalizeHeaderMessageId(message.internetMessageId) || null,
      inReplyTo: normalizeHeaderMessageId(message.inReplyTo) || null,
      references: asArray(message.references).map((item) => normalizeHeaderMessageId(item)).filter(Boolean),
    });
    if (messageDirection === 'inbound') {
      if (message.sentAt && compareIsoDesc(entry.lastInboundAt, message.sentAt) > 0) {
        entry.lastInboundAt = message.sentAt;
      }
      const normalizedSenderEmail = normalizeEmailAddress(message.senderEmail);
      if (normalizedSenderEmail) entry.customerEmailSources.add(normalizedSenderEmail);
      for (const alias of toEmailAliases(message.senderEmail)) entry.customerEmails.add(alias);
      for (const replyToAddress of asArray(message.replyTo)) {
        const normalizedReplyTo = normalizeEmailAddress(replyToAddress);
        if (normalizedReplyTo) entry.customerEmailSources.add(normalizedReplyTo);
        for (const alias of toEmailAliases(replyToAddress)) entry.customerEmails.add(alias);
      }
    } else {
      if (message.sentAt && compareIsoDesc(entry.lastOutboundAt, message.sentAt) > 0) {
        entry.lastOutboundAt = message.sentAt;
      }
      const normalizedRecipients = asArray(message.recipients)
        .map((item) => normalizeEmailAddress(item))
        .filter(Boolean);
      for (const recipient of normalizedRecipients) {
        entry.customerEmailSources.add(recipient);
      }
      const recipients = asArray(message.recipients)
        .flatMap((item) => toEmailAliases(item));
      for (const recipient of recipients) {
        entry.customerEmails.add(recipient);
      }
      for (const replyToAddress of asArray(message.replyTo)) {
        const normalizedReplyTo = normalizeEmailAddress(replyToAddress);
        if (normalizedReplyTo) entry.customerEmailSources.add(normalizedReplyTo);
        for (const alias of toEmailAliases(replyToAddress)) entry.customerEmails.add(alias);
      }
    }
    if (
      normalizeText(entry.subject) === '(utan amne)' &&
      normalizeText(message.subject) &&
      normalizeText(message.subject) !== '(utan amne)'
    ) {
      entry.subject = message.subject;
    }
    const riskWordSet = new Set([...(entry.riskWords || []), ...(message.riskWords || [])]);
    entry.riskWords = Array.from(riskWordSet).slice(0, 20);
  }

  const conversations = Array.from(map.values());
  for (const conversation of conversations) {
    const preferredConversationId =
      normalizeText(conversation.primaryConversationId) ||
      Array.from(conversation.conversationIds.values())[0] ||
      normalizeText(conversation.clusterId);
    conversation.conversationId = preferredConversationId || `conversation:${crypto.randomUUID()}`;
    conversation.customerEmail =
      selectPrimaryCustomerEmail(Array.from(conversation.customerEmailSources.values())) ||
      selectPrimaryCustomerEmail(Array.from(conversation.customerEmails.values()));
    delete conversation.clusterId;
    delete conversation.primaryConversationId;
    delete conversation.conversationIds;
    delete conversation.customerEmails;
    delete conversation.customerEmailSources;
    conversation.messages.sort((a, b) => compareIsoDesc(a.sentAt, b.sentAt));
  }
  conversations.sort((a, b) => {
    const lastActivityComparison = compareIsoDesc(
      a.lastInboundAt || a.lastOutboundAt,
      b.lastInboundAt || b.lastOutboundAt
    );
    if (lastActivityComparison !== 0) return lastActivityComparison;
    return String(a.conversationId).localeCompare(String(b.conversationId));
  });
  return conversations;
}

function toMailboxIdentity(user = {}, fallback = '') {
  const safeUser = user && typeof user === 'object' ? user : {};
  const id = normalizeText(safeUser.id) || normalizeText(fallback);
  const mail = normalizeText(safeUser.mail);
  const userPrincipalName = normalizeText(safeUser.userPrincipalName);
  const mailboxId = mail || userPrincipalName || id;
  const mailboxKey = normalizeText(mailboxId).replace(/[^a-zA-Z0-9._@-]/g, '_').slice(0, 120) || 'mailbox';
  return {
    id,
    mailboxId,
    mailboxKey,
    mail,
    userPrincipalName,
  };
}

function matchesMailboxIdFilter(user = {}, rawFilter = '') {
  const filter = normalizeText(rawFilter).toLowerCase();
  if (!filter) return false;
  const candidates = [
    normalizeText(user?.id),
    normalizeText(user?.mail),
    normalizeText(user?.userPrincipalName),
    normalizeText(user?.mailboxId),
  ]
    .map((item) => item.toLowerCase())
    .filter(Boolean);
  return candidates.includes(filter);
}

function toInboxMessagesUrl({
  graphBaseUrl,
  userId,
  maxMessages,
  receivedSinceIso,
  includeReadMessages,
}) {
  const messagesUrl = new URL(
    `${graphBaseUrl}/users/${encodeURIComponent(userId)}/mailFolders/inbox/messages`
  );
  messagesUrl.searchParams.set('$top', String(maxMessages));
  messagesUrl.searchParams.set(
    '$select',
    [
      'id',
      'conversationId',
      'subject',
      'bodyPreview',
      'receivedDateTime',
      'sentDateTime',
      'isRead',
      'from',
      'toRecipients',
      'replyTo',
      'inReplyTo',
      'references',
      'internetMessageId',
      'internetMessageHeaders',
    ].join(',')
  );
  messagesUrl.searchParams.set('$orderby', 'receivedDateTime desc');
  const filterParts = [`receivedDateTime ge ${receivedSinceIso}`];
  if (!includeReadMessages) filterParts.push('isRead eq false');
  messagesUrl.searchParams.set('$filter', filterParts.join(' and '));
  return messagesUrl;
}

function toSentMessagesUrl({ graphBaseUrl, userId, maxMessages, sentSinceIso }) {
  const messagesUrl = new URL(
    `${graphBaseUrl}/users/${encodeURIComponent(userId)}/mailFolders/SentItems/messages`
  );
  messagesUrl.searchParams.set('$top', String(maxMessages));
  messagesUrl.searchParams.set(
    '$select',
    [
      'id',
      'conversationId',
      'subject',
      'bodyPreview',
      'receivedDateTime',
      'sentDateTime',
      'from',
      'toRecipients',
      'replyTo',
      'inReplyTo',
      'references',
      'internetMessageId',
      'internetMessageHeaders',
    ].join(',')
  );
  messagesUrl.searchParams.set('$orderby', 'sentDateTime desc');
  messagesUrl.searchParams.set('$filter', `sentDateTime ge ${sentSinceIso}`);
  return messagesUrl;
}

function createMicrosoftGraphReadConnector(config = {}) {
  const tenantId = requiredConfig('tenantId', config.tenantId);
  const clientId = requiredConfig('clientId', config.clientId);
  const clientSecret = requiredConfig('clientSecret', config.clientSecret);
  const configuredFullTenant = toBoolean(config.fullTenant, false);
  const configuredUserScope = normalizeUserScope(config.userScope, configuredFullTenant ? 'all' : 'single');
  const userId = normalizeText(config.userId);
  if (!(configuredFullTenant && configuredUserScope === 'all')) {
    requiredConfig('userId', userId);
  }

  const fetchImpl = typeof config.fetchImpl === 'function' ? config.fetchImpl : global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('MicrosoftGraphReadConnector requires fetch implementation.');
  }

  const authorityHost = trimTrailingSlash(
    normalizeText(config.authorityHost) || 'https://login.microsoftonline.com'
  );
  const graphBaseUrl = trimTrailingSlash(
    normalizeText(config.graphBaseUrl) || 'https://graph.microsoft.com/v1.0'
  );
  const scope = normalizeText(config.scope) || 'https://graph.microsoft.com/.default';
  const now = typeof config.now === 'function' ? config.now : () => Date.now();
  const sleep = typeof config.sleep === 'function' ? config.sleep : sleepMs;

  async function fetchAccessToken() {
    const tokenUrl = `${authorityHost}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope,
      grant_type: 'client_credentials',
    });
    const response = await fetchWithTimeout(
      fetchImpl,
      tokenUrl,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
      clampInt(config.tokenTimeoutMs, 1000, 30000, 5000)
    );
    const payload = await parseJsonResponse(response, 'Microsoft Graph token request');
    const accessToken = normalizeText(payload.access_token);
    if (!accessToken) {
      throw createGraphError('Microsoft Graph token request succeeded but access_token is missing.', {
        code: 'GRAPH_TOKEN_MISSING',
      });
    }
    return accessToken;
  }

  async function fetchGraphPageWithRetry({
    url,
    accessToken,
    label,
    timeoutMs,
    requestMaxRetries = 2,
    retryBaseDelayMs = 500,
    retryMaxDelayMs = 5000,
  }) {
    const safeRetries = clampInt(requestMaxRetries, 0, 6, 2);
    const maxAttempts = safeRetries + 1;
    let attempt = 0;
    let lastError = null;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const response = await fetchWithTimeout(
          fetchImpl,
          url,
          {
            method: 'GET',
            headers: {
              authorization: `Bearer ${accessToken}`,
            },
          },
          timeoutMs
        );

        if (Number(response?.status || 0) === 429) {
          throw createGraphError(`${label} failed (429): rate_limit_hit`, {
            code: 'GRAPH_RATE_LIMITED',
            status: 429,
            retryAfterSeconds: parseRetryAfterSeconds(response),
          });
        }
        return await parseJsonResponse(response, label);
      } catch (error) {
        lastError = error;
        if (!isRetryableGraphError(error) || attempt >= maxAttempts) {
          throw error;
        }
        const delayMs = toRetryDelayMs({
          error,
          attempt,
          retryBaseDelayMs,
          retryMaxDelayMs,
        });
        await sleep(delayMs);
      }
    }
    throw lastError || new Error(`${label} failed without explicit error.`);
  }

  async function fetchGraphCollection({
    initialUrl,
    accessToken,
    label,
    timeoutMs,
    maxItems = 200,
    maxPages = 200,
    requestMaxRetries = 2,
    retryBaseDelayMs = 500,
    retryMaxDelayMs = 5000,
  }) {
    const safeMaxItems = clampInt(maxItems, 1, 10000, 200);
    const safeMaxPages = clampInt(maxPages, 1, 2000, 200);
    const value = [];
    const seenPageUrls = new Set();
    let nextUrl = normalizeText(initialUrl);
    let pageCount = 0;
    let truncatedByLimit = false;

    while (nextUrl) {
      const normalizedPageUrl = normalizeText(nextUrl);
      if (!normalizedPageUrl) break;
      if (seenPageUrls.has(normalizedPageUrl)) {
        throw createGraphError(`${label} pagination loop detected.`, {
          code: 'GRAPH_PAGINATION_LOOP_DETECTED',
        });
      }
      seenPageUrls.add(normalizedPageUrl);
      pageCount += 1;
      if (pageCount > safeMaxPages) {
        throw createGraphError(
          `${label} exceeded pagination page limit (${safeMaxPages}).`,
          {
            code: 'GRAPH_PAGINATION_PAGE_LIMIT',
          }
        );
      }

      const payload = await fetchGraphPageWithRetry({
        url: normalizedPageUrl,
        accessToken,
        label,
        timeoutMs,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });

      const pageItems = Array.isArray(payload?.value) ? payload.value : [];
      for (const item of pageItems) {
        value.push(item);
        if (value.length >= safeMaxItems) {
          truncatedByLimit = true;
          break;
        }
      }
      if (truncatedByLimit) break;
      nextUrl = normalizeText(payload?.['@odata.nextLink']);
    }

    return {
      value,
      pageCount,
      truncatedByLimit,
    };
  }

  async function fetchInboxSnapshot(options = {}) {
    const nowMs = Number(now());
    if (!Number.isFinite(nowMs)) {
      throw new Error('MicrosoftGraphReadConnector now() must return a finite timestamp.');
    }

    const windowDays = clampInt(options.days, 1, 30, 14);
    const maxMessages = clampInt(options.maxMessages, 1, 200, 100);
    const splitDefault = Math.max(1, Math.floor(maxMessages / 2));
    const defaultInboxMaxMessages = Math.max(1, maxMessages - splitDefault);
    const defaultSentMaxMessages = splitDefault;
    const includeReadMessages = options.includeRead === true;
    const receivedSinceIso = toIsoFromMs(nowMs - windowDays * 24 * 60 * 60 * 1000);
    const sentSinceIso = receivedSinceIso;

    const fullTenant = toBoolean(options.fullTenant, configuredFullTenant);
    const userScope = normalizeUserScope(options.userScope, configuredUserScope);
    const fullTenantMode = fullTenant && userScope === 'all';
    const maxUsers = clampInt(options.maxUsers, 1, 200, 50);
    const maxMessagesPerUser = clampInt(options.maxMessagesPerUser, 1, 200, 50);
    const splitPerUserDefault = Math.max(1, Math.floor(maxMessagesPerUser / 2));
    const defaultInboxMaxMessagesPerUser = Math.max(1, maxMessagesPerUser - splitPerUserDefault);
    const defaultSentMaxMessagesPerUser = splitPerUserDefault;
    const maxInboxMessages = clampInt(
      options.maxInboxMessages,
      1,
      200,
      defaultInboxMaxMessages
    );
    const maxSentMessages = clampInt(
      options.maxSentMessages,
      1,
      200,
      defaultSentMaxMessages
    );
    const maxInboxMessagesPerUser = clampInt(
      options.maxInboxMessagesPerUser,
      1,
      200,
      defaultInboxMaxMessagesPerUser
    );
    const maxSentMessagesPerUser = clampInt(
      options.maxSentMessagesPerUser,
      1,
      200,
      defaultSentMaxMessagesPerUser
    );
    const mailboxTimeoutMs = clampInt(options.mailboxTimeoutMs, 1000, 15000, 5000);
    const runTimeoutMs = clampInt(options.runTimeoutMs, 5000, 120000, 30000);
    const maxMailboxErrors = clampInt(options.maxMailboxErrors, 1, 20, 5);
    const mailboxIndexes = normalizeMailboxIndexes(options.mailboxIndexes, maxUsers);
    const mailboxIdFilter = normalizeMailboxIds(options.mailboxIds, 500);
    const requestMaxRetries = clampInt(options.requestMaxRetries, 0, 6, 2);
    const retryBaseDelayMs = clampInt(options.retryBaseDelayMs, 100, 10000, 500);
    const retryMaxDelayMs = clampInt(options.retryMaxDelayMs, 200, 30000, 5000);
    const maxPagesPerCollection = clampInt(options.maxPagesPerCollection, 1, 2000, 200);

    const accessToken = await fetchAccessToken();
    const capturedAt = toIsoFromMs(nowMs) || new Date(nowMs).toISOString();

    let conversations = [];
    let fetchedMessages = 0;
    let inboundMessageCount = 0;
    let outboundMessageCount = 0;
    let mailboxCount = 0;
    let mailboxErrors = 0;
    const warnings = [];

    if (!fullTenantMode) {
      const identity = toMailboxIdentity({}, userId);
      const inboxPayload = await fetchGraphCollection({
        initialUrl: toInboxMessagesUrl({
          graphBaseUrl,
          userId: userId,
          maxMessages: maxInboxMessages,
          receivedSinceIso,
          includeReadMessages,
        }).toString(),
        accessToken,
        label: 'Microsoft Graph inbox request',
        timeoutMs: mailboxTimeoutMs,
        maxItems: maxInboxMessages,
        maxPages: maxPagesPerCollection,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });
      const sentPayload = await fetchGraphCollection({
        initialUrl: toSentMessagesUrl({
          graphBaseUrl,
          userId: userId,
          maxMessages: maxSentMessages,
          sentSinceIso,
        }).toString(),
        accessToken,
        label: 'Microsoft Graph sent-items request',
        timeoutMs: mailboxTimeoutMs,
        maxItems: maxSentMessages,
        maxPages: maxPagesPerCollection,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });

      const normalizedInboundMessages = Array.isArray(inboxPayload.value)
        ? inboxPayload.value
            .map((raw) =>
              toNormalizedMessage(raw, {
                mailboxId: identity.mailboxId,
                mailboxKey: '',
                mailboxAddress: identity.mail,
                userPrincipalName: identity.userPrincipalName,
                direction: 'inbound',
              })
            )
            .filter(Boolean)
        : [];
      const normalizedOutboundMessages = Array.isArray(sentPayload.value)
        ? sentPayload.value
            .map((raw) =>
              toNormalizedMessage(raw, {
                mailboxId: identity.mailboxId,
                mailboxKey: '',
                mailboxAddress: identity.mail,
                userPrincipalName: identity.userPrincipalName,
                direction: 'outbound',
              })
            )
            .filter(Boolean)
        : [];

      const normalizedMessages = [...normalizedInboundMessages, ...normalizedOutboundMessages];

      conversations = toConversationSnapshots(normalizedMessages);
      fetchedMessages = normalizedMessages.length;
      inboundMessageCount = normalizedInboundMessages.length;
      outboundMessageCount = normalizedOutboundMessages.length;
      mailboxCount = 1;
    } else {
      const runStartedAt = Date.now();
      const usersUrl = new URL(`${graphBaseUrl}/users`);
      usersUrl.searchParams.set('$top', String(maxUsers));
      usersUrl.searchParams.set('$select', 'id,mail,userPrincipalName');

      const usersPayload = await fetchGraphCollection({
        initialUrl: usersUrl.toString(),
        accessToken,
        label: 'Microsoft Graph user listing request',
        timeoutMs: mailboxTimeoutMs,
        maxItems: maxUsers,
        maxPages: maxPagesPerCollection,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });

      const users = Array.isArray(usersPayload.value)
        ? usersPayload.value.map((rawUser) => toMailboxIdentity(rawUser)).filter((item) => item.id)
        : [];
      const limitedUsers = users.slice(0, maxUsers);
      const selectedUsers = (() => {
        if (mailboxIndexes.length === 0 && mailboxIdFilter.length === 0) return limitedUsers;
        const selected = [];
        const seen = new Set();
        const includeUser = (user) => {
          if (!user || !user.id) return;
          if (seen.has(user.id)) return;
          seen.add(user.id);
          selected.push(user);
        };
        if (mailboxIndexes.length > 0) {
          mailboxIndexes
            .map((index) => limitedUsers[index - 1])
            .filter(Boolean)
            .forEach(includeUser);
        }
        if (mailboxIdFilter.length > 0) {
          mailboxIdFilter.forEach((mailboxId) => {
            const matched = limitedUsers.find((user) => matchesMailboxIdFilter(user, mailboxId));
            if (matched) includeUser(matched);
          });
        }
        return selected;
      })();

      for (const user of selectedUsers) {
        const elapsedMs = Date.now() - runStartedAt;
        if (elapsedMs > runTimeoutMs) {
          throw createGraphError(`Full-tenant ingest exceeded run timeout (${runTimeoutMs}ms).`, {
            code: 'GRAPH_RUN_TIMEOUT',
          });
        }

        try {
          const inboxPayload = await fetchGraphCollection({
            initialUrl: toInboxMessagesUrl({
              graphBaseUrl,
              userId: user.id,
              maxMessages: maxInboxMessagesPerUser,
              receivedSinceIso,
              includeReadMessages,
            }).toString(),
            accessToken,
            label: `Microsoft Graph inbox request (${user.mailboxId || user.id})`,
            timeoutMs: mailboxTimeoutMs,
            maxItems: maxInboxMessagesPerUser,
            maxPages: maxPagesPerCollection,
            requestMaxRetries,
            retryBaseDelayMs,
            retryMaxDelayMs,
          });
          const sentPayload = await fetchGraphCollection({
            initialUrl: toSentMessagesUrl({
              graphBaseUrl,
              userId: user.id,
              maxMessages: maxSentMessagesPerUser,
              sentSinceIso,
            }).toString(),
            accessToken,
            label: `Microsoft Graph sent-items request (${user.mailboxId || user.id})`,
            timeoutMs: mailboxTimeoutMs,
            maxItems: maxSentMessagesPerUser,
            maxPages: maxPagesPerCollection,
            requestMaxRetries,
            retryBaseDelayMs,
            retryMaxDelayMs,
          });

          const normalizedInboundMessages = Array.isArray(inboxPayload.value)
            ? inboxPayload.value
                .map((raw) =>
                  toNormalizedMessage(raw, {
                    ...user,
                    mailboxAddress: user.mail,
                    direction: 'inbound',
                  })
                )
                .filter(Boolean)
            : [];
          const normalizedOutboundMessages = Array.isArray(sentPayload.value)
            ? sentPayload.value
                .map((raw) =>
                  toNormalizedMessage(raw, {
                    ...user,
                    mailboxAddress: user.mail,
                    direction: 'outbound',
                  })
                )
                .filter(Boolean)
            : [];
          const normalizedMessages = [...normalizedInboundMessages, ...normalizedOutboundMessages];

          fetchedMessages += normalizedMessages.length;
          inboundMessageCount += normalizedInboundMessages.length;
          outboundMessageCount += normalizedOutboundMessages.length;
          mailboxCount += 1;
          conversations.push(...normalizedMessages.map((message) => ({ ...message })));
        } catch (error) {
          mailboxErrors += 1;

          if (error?.code === 'GRAPH_RUN_TIMEOUT') {
            throw error;
          }

          warnings.push(
            `Mailbox ${normalizeText(user.mailboxId) || 'unknown'} kunde inte lasas (${normalizeText(
              error?.message
            ) || 'request_failed'}).`
          );

          if (mailboxErrors > maxMailboxErrors) {
            throw createGraphError(
              `Full-tenant ingest aborted: mailbox error budget exceeded (${mailboxErrors}/${maxMailboxErrors}).`,
              {
                code: 'GRAPH_MAILBOX_ERROR_BUDGET_EXCEEDED',
              }
            );
          }
        }
      }

      if (selectedUsers.length === 0) {
        warnings.push('Full-tenant ingest hittade inga mailbox-anvandare i user-listing.');
      } else if (mailboxIndexes.length > 0) {
        const matchedIndexes = selectedUsers.map((user) =>
          limitedUsers.findIndex((candidate) => candidate.id === user.id) + 1
        );
        if (matchedIndexes.length < mailboxIndexes.length) {
          warnings.push(
            `Mailbox-indexfilter matchade ${matchedIndexes.length} av ${mailboxIndexes.length} valda index.`
          );
        }
      }
      if (mailboxIdFilter.length > 0) {
        const matchedMailboxIds = mailboxIdFilter.filter((mailboxId) =>
          selectedUsers.some((user) => matchesMailboxIdFilter(user, mailboxId))
        );
        if (matchedMailboxIds.length < mailboxIdFilter.length) {
          warnings.push(
            `Mailbox-idfilter matchade ${matchedMailboxIds.length} av ${mailboxIdFilter.length} valda mailboxId.`
          );
        }
      }
    }

    if (fullTenantMode) {
      conversations = toConversationSnapshots(conversations);
    }

    const snapshot = {
      snapshotVersion: 'graph.inbox.snapshot.v2',
      source: 'microsoft-graph',
      timestamps: {
        capturedAt,
        sourceGeneratedAt: capturedAt,
      },
      conversations,
      metadata: {
        connector: 'MicrosoftGraphReadConnector',
        windowDays,
        maxMessages,
        maxInboxMessages,
        maxSentMessages,
        maxMessagesPerUser,
        maxInboxMessagesPerUser,
        maxSentMessagesPerUser,
        includeReadMessages,
        fullTenantMode,
        userScope,
        maxUsers,
        mailboxTimeoutMs,
        runTimeoutMs,
        maxMailboxErrors,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
        maxPagesPerCollection,
        mailboxIndexes,
        mailboxIdFilter,
        mailboxIds:
          fullTenantMode && Array.isArray(conversations)
            ? Array.from(
                new Set(
                  conversations
                    .map((item) => normalizeText(item?.mailboxId))
                    .filter(Boolean)
                )
              )
            : [normalizeText(userId)].filter(Boolean),
        mailboxErrors,
        mailboxCount,
        fetchedMessages,
        inboundMessageCount,
        outboundMessageCount,
        messageCount: fetchedMessages,
      },
    };

    if (warnings.length > 0) {
      snapshot.warnings = warnings.slice(0, 20);
    }

    return snapshot;
  }

  return {
    fetchInboxSnapshot,
  };
}

module.exports = {
  createMicrosoftGraphReadConnector,
};
