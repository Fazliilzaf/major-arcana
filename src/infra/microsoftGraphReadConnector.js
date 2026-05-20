const crypto = require('node:crypto');
const { maskInboxText } = require('../privacy/inboxMasking');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const DEFAULT_STORED_BODY_HTML_MAX_LENGTH = 24000;
const INLINE_IMAGE_BODY_HTML_MAX_LENGTH = 240000;

function resolveStoredBodyHtmlMaxLength(value = '') {
  const html = normalizeText(value);
  if (!html) return DEFAULT_STORED_BODY_HTML_MAX_LENGTH;
  return /<img\b|data:image\/|cid:/i.test(html)
    ? INLINE_IMAGE_BODY_HTML_MAX_LENGTH
    : DEFAULT_STORED_BODY_HTML_MAX_LENGTH;
}

function sanitizeStoredBodyHtml(value = '') {
  const html = normalizeText(value);
  if (!html) return '';
  const sanitized = html
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link|base)[^>]*\/?\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s(src|href)\s*=\s*(['"])\s*(javascript:|data:text\/html)[\s\S]*?\2/gi, ' $1="#"');
  const maxLength = resolveStoredBodyHtmlMaxLength(sanitized);
  return sanitized.length <= maxLength ? sanitized : sanitized.slice(0, maxLength);
}

function extractInlineCidReferences(bodyHtml = '') {
  const html = normalizeText(bodyHtml);
  if (!html) return [];
  const matches = Array.from(html.matchAll(/<img\b[^>]*\bsrc\s*=\s*(['"])\s*cid:([^'"]+)\1/gi));
  const values = new Set();
  for (const match of matches) {
    const raw = normalizeText(match?.[2]);
    if (!raw) continue;
    values.add(raw);
  }
  return Array.from(values);
}

function normalizeInlineCidValue(value = '') {
  const normalized = normalizeText(value)
    .replace(/^cid:/i, '')
    .replace(/^<|>$/g, '')
    .trim()
    .toLowerCase();
  if (!normalized) return [];
  const candidates = new Set([normalized]);
  if (normalized.includes('/')) {
    candidates.add(normalized.split('/')[0]);
  }
  return Array.from(candidates).filter(Boolean);
}

function buildInlineAttachmentReplacementMap(attachments = []) {
  const replacements = new Map();
  for (const attachment of asArray(attachments)) {
    const contentType = normalizeText(attachment?.contentType).toLowerCase();
    const contentBytes = normalizeText(attachment?.contentBytes);
    if (!contentType.startsWith('image/') || !contentBytes) continue;
    const cidCandidates = [
      ...normalizeInlineCidValue(attachment?.contentId),
      ...normalizeInlineCidValue(attachment?.id),
      ...normalizeInlineCidValue(attachment?.name),
    ];
    if (!cidCandidates.length) continue;
    const dataUrl = `data:${contentType};base64,${contentBytes}`;
    cidCandidates.forEach((candidate) => {
      if (!replacements.has(candidate)) replacements.set(candidate, dataUrl);
    });
  }
  return replacements;
}

function resolveInlineCidImages(bodyHtml = '', attachments = []) {
  const html = normalizeText(bodyHtml);
  if (!html) return '';
  const replacementMap = buildInlineAttachmentReplacementMap(attachments);
  if (replacementMap.size === 0) return html;
  return html.replace(
    /(<img\b[^>]*\bsrc\s*=\s*['"])\s*cid:([^'"]+)(['"][^>]*>)/gi,
    (match, prefix, rawCid, suffix) => {
      const cidCandidates = normalizeInlineCidValue(rawCid);
      const resolved = cidCandidates.find((candidate) => replacementMap.has(candidate));
      if (!resolved) return match;
      return `${prefix}${replacementMap.get(resolved)}${suffix}`;
    }
  );
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toSafeAttachmentMetadata(attachments = []) {
  return asArray(attachments).map((item) => ({
    id: normalizeText(item?.id) || null,
    name: normalizeText(item?.name) || null,
    contentType: normalizeText(item?.contentType) || null,
    contentId: normalizeText(item?.contentId) || null,
    isInline: item?.isInline === true,
    size: toNumber(item?.size, 0),
    sourceType:
      normalizeText(item?.sourceType || item?.['@odata.type'] || 'graph_file_attachment') ||
      'graph_file_attachment',
    contentBytesAvailable: Boolean(normalizeText(item?.contentBytes)),
  }));
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

function toNamedRecipients(value = []) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item) => {
      const address = normalizeText(item?.emailAddress?.address).toLowerCase();
      const name = normalizeText(item?.emailAddress?.name);
      if (!address && !name) return null;
      return {
        address: address || null,
        name: name || null,
      };
    })
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
  const domainRootMatch = domainPart.match(/^([a-z0-9.-]+)\.(com|se)$/i);
  if (domainRootMatch) {
    const domainRoot = normalizeText(domainRootMatch[1]).toLowerCase();
    const tld = normalizeText(domainRootMatch[2]).toLowerCase();
    if (domainRoot) {
      aliases.add(`${plusNormalized}@${domainRoot}.${tld === 'com' ? 'se' : 'com'}`);
      if (separatorless) aliases.add(`${separatorless}@${domainRoot}.${tld === 'com' ? 'se' : 'com'}`);
    }
  }
  return Array.from(aliases);
}

function inferCounterpartyEmail({
  direction = 'inbound',
  senderEmail = '',
  recipients = [],
  replyToRecipients = [],
} = {}) {
  const safeReplyTo = Array.isArray(replyToRecipients) ? replyToRecipients : [];
  if (direction === 'inbound') {
    const replyTo = normalizeText(safeReplyTo[0]).toLowerCase();
    if (replyTo) return replyTo;
    return normalizeText(senderEmail).toLowerCase() || '';
  }
  const safeRecipients = Array.isArray(recipients) ? recipients : [];
  const recipient = normalizeText(safeRecipients[0]).toLowerCase();
  if (recipient) return recipient;
  return normalizeText(safeReplyTo[0]).toLowerCase() || '';
}

function toReplyToList(value = []) {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item) => normalizeText(item?.emailAddress?.address))
    .filter(Boolean)
    .slice(0, 20);
}

function isSubjectFuzzyMatch(left = '', right = '') {
  const a = normalizeSubjectForCorrelation(left);
  const b = normalizeSubjectForCorrelation(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 12 && b.includes(a)) return true;
  if (b.length >= 12 && a.includes(b)) return true;
  if (Math.abs(a.length - b.length) > 3) return false;
  const distance = computeLevenshteinDistance(a, b, 2);
  return Number.isFinite(distance) && distance <= 2;
}

function computeLevenshteinDistance(left = '', right = '', maxDistance = 2) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a) return b.length;
  if (!b) return a.length;
  const max = Math.max(0, Number(maxDistance || 0));
  if (Math.abs(a.length - b.length) > max) return Number.POSITIVE_INFINITY;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let minInRow = current[0];
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost
      );
      current.push(value);
      if (value < minInRow) minInRow = value;
    }
    if (minInRow > max) return Number.POSITIVE_INFINITY;
    previous = current;
  }
  return previous[b.length];
}

function toEmailAliasFingerprint(value = '') {
  const email = normalizeEmailAddress(value);
  if (!email) return null;
  const [rawLocal = '', rawDomain = ''] = email.split('@');
  const local = normalizeText(rawLocal)
    .toLowerCase()
    .replace(/\+.*/, '')
    .replace(/[._-]/g, '');
  if (!local) return null;
  const domain = normalizeText(rawDomain).toLowerCase();
  if (!domain) return null;
  const domainMatch = domain.match(/^([a-z0-9.-]+)\.(com|se)$/i);
  const domainKey = domainMatch ? normalizeText(domainMatch[1]).toLowerCase() : domain;
  return {
    local,
    domainKey,
  };
}

function isEmailAliasFuzzyMatch(left = '', right = '') {
  const a = toEmailAliasFingerprint(left);
  const b = toEmailAliasFingerprint(right);
  if (!a || !b) return false;
  if (a.domainKey !== b.domainKey) return false;
  if (a.local === b.local) return true;
  const lengthGap = Math.abs(a.local.length - b.local.length);
  if (lengthGap > 2) return false;
  const maxDistance = Math.max(1, Math.min(2, Math.floor(Math.max(a.local.length, b.local.length) / 6)));
  const distance = computeLevenshteinDistance(a.local, b.local, maxDistance);
  return Number.isFinite(distance) && distance <= maxDistance;
}

function toEmailAliasCandidates(values = []) {
  const aliases = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    for (const alias of toEmailAliases(value)) {
      const normalizedAlias = normalizeText(alias).toLowerCase();
      if (!normalizedAlias) continue;
      aliases.add(normalizedAlias);
    }
    const normalizedValue = normalizeEmailAddress(value);
    if (normalizedValue) aliases.add(normalizedValue);
  }
  return Array.from(aliases);
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

function parseGraphServiceCode(payload = {}) {
  const graphError = payload && typeof payload.error === 'object' ? payload.error : {};
  return normalizeText(graphError.code || payload?.error || '');
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

async function parseTextResponse(response, label = 'request') {
  let payload = '';
  try {
    payload = (await response.text()) || '';
  } catch (_error) {
    payload = '';
  }
  if (response?.ok) {
    return {
      text: payload,
      contentType: normalizeText(response?.headers?.get('content-type')) || null,
    };
  }
  const status = Number(response?.status || 0);
  throw createGraphError(
    `${label} failed (${status || 'n/a'}): ${normalizeText(payload) || 'graph_request_failed'}`,
    {
      code: 'GRAPH_REQUEST_FAILED',
      status,
      details: { body: payload },
    }
  );
}

async function parseBinaryResponse(response, label = 'request') {
  let payload = null;
  try {
    const buffer = await response.arrayBuffer();
    payload = Buffer.from(buffer);
  } catch (_error) {
    payload = null;
  }
  if (response?.ok) {
    return {
      buffer: payload || Buffer.alloc(0),
      contentType: normalizeText(response?.headers?.get('content-type')) || null,
      contentDisposition: normalizeText(response?.headers?.get('content-disposition')) || null,
    };
  }
  const status = Number(response?.status || 0);
  throw createGraphError(`${label} failed (${status || 'n/a'}): graph_request_failed`, {
    code: 'GRAPH_REQUEST_FAILED',
    status,
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

function buildConversationIdFilterSet(rawIds = []) {
  const filterSet = new Set();
  for (const rawId of asArray(rawIds)) {
    const normalized = normalizeText(rawId).toLowerCase();
    if (!normalized) continue;
    filterSet.add(normalized);
    const colonIndex = normalized.lastIndexOf(':');
    if (colonIndex > 0 && colonIndex < normalized.length - 1) {
      filterSet.add(normalized.slice(colonIndex + 1));
    }
  }
  return filterSet;
}

function conversationMatchesIdFilter(conversation = {}, filterSet = new Set()) {
  if (!filterSet || filterSet.size === 0) return true;
  const conversationId = normalizeText(conversation?.conversationId).toLowerCase();
  if (!conversationId) return false;
  if (filterSet.has(conversationId)) return true;
  const colonIndex = conversationId.lastIndexOf(':');
  if (colonIndex > 0 && filterSet.has(conversationId.slice(colonIndex + 1))) return true;
  return false;
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
  const bodyHtml = sanitizeStoredBodyHtml(raw?.body?.content);
  const sentAt =
    toIso(
      normalizedDirection === 'outbound'
        ? raw.sentDateTime || raw.receivedDateTime
        : raw.receivedDateTime || raw.sentDateTime
    ) || null;
  const senderEmail = normalizeText(raw?.from?.emailAddress?.address);
  const senderName = normalizeText(raw?.from?.emailAddress?.name);
  const recipients = toRecipientList(raw?.toRecipients);
  const replyToRecipients = toReplyToList(raw?.replyTo);
  const internetHeaders = Array.isArray(raw?.internetMessageHeaders) ? raw.internetMessageHeaders : [];
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
  const counterpartyEmail = inferCounterpartyEmail({
    direction: normalizedDirection,
    senderEmail,
    recipients,
    replyToRecipients,
  });
  const attachments = toSafeAttachmentMetadata(raw?.attachments);

  return {
    messageId,
    conversationId: conversationId || '',
    subject,
    normalizedSubject,
    bodyPreview,
    bodyHtml: bodyHtml || null,
    sentAt,
    direction: normalizedDirection,
    hasAttachments: raw?.hasAttachments === true || attachments.length > 0,
    isRead:
      normalizedDirection === 'inbound' && typeof raw?.isRead === 'boolean'
        ? raw.isRead
        : null,
    senderEmail: senderEmail || null,
    senderName: senderName || null,
    recipients,
    replyToRecipients,
    counterpartyEmail: counterpartyEmail || null,
    internetMessageId,
    inReplyTo,
    references: dedupedReferences,
    attachments,
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
  const emailAlias = new Map();
  let syntheticCounter = 0;

  const toActivityBucket = (value = '') => {
    const iso = normalizeText(value);
    if (!iso) return 'unknown-window';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'unknown-window';
    const bucketSizeMs = 48 * 60 * 60 * 1000;
    const bucket = Math.floor(date.getTime() / bucketSizeMs);
    return `h48-${bucket}`;
  };

  const isWithinCorrelationWindow = (left = '', right = '', maxHours = 96) => {
    const leftDate = new Date(normalizeText(left));
    const rightDate = new Date(normalizeText(right));
    if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return true;
    return Math.abs(leftDate.getTime() - rightDate.getTime()) <= maxHours * 60 * 60 * 1000;
  };

  const resolveFallbackKey = (message = {}) => {
    const subject = normalizeText(message.normalizedSubject);
    const counterpartyEmail = normalizeText(message.counterpartyEmail).toLowerCase();
    const activityBucket = toActivityBucket(message.sentAt);
    if (!subject || !counterpartyEmail) return '';
    return `${counterpartyEmail}|${subject}|${activityBucket}`;
  };

  const sortedMessages = asArray(messages)
    .slice()
    .sort((left, right) => String(left?.sentAt || '').localeCompare(String(right?.sentAt || '')));

  for (const message of sortedMessages) {
    if (!message) continue;
    const rawConversationId = normalizeText(message.conversationId);
    const fallbackKey = resolveFallbackKey(message);
    const linkedMessageIds = [
      normalizeHeaderMessageId(message.internetMessageId),
      normalizeHeaderMessageId(message.inReplyTo),
      ...asArray(message.references).map((item) => normalizeHeaderMessageId(item)),
    ].filter(Boolean);
    const aliasCandidates = toEmailAliasCandidates([
      message.counterpartyEmail,
      message.senderEmail,
      ...(Array.isArray(message.recipients) ? message.recipients : []),
      ...(Array.isArray(message.replyToRecipients) ? message.replyToRecipients : []),
    ]);

    let clusterId = '';
    if (rawConversationId && conversationAlias.has(rawConversationId)) {
      clusterId = conversationAlias.get(rawConversationId);
    }
    if (!clusterId) {
      const matchedLinked = linkedMessageIds.find((id) => messageIdAlias.has(id));
      if (matchedLinked) clusterId = messageIdAlias.get(matchedLinked);
    }
    if (!clusterId && fallbackKey && fallbackAlias.has(fallbackKey)) {
      clusterId = fallbackAlias.get(fallbackKey);
    }
    if (!clusterId && aliasCandidates.length > 0) {
      let matchedAlias = aliasCandidates.find((alias) => {
        const candidateClusterId = emailAlias.get(alias);
        if (!candidateClusterId || !map.has(candidateClusterId)) return false;
        const candidate = map.get(candidateClusterId);
        return (
          isSubjectFuzzyMatch(candidate?.subject, message.subject) &&
          isWithinCorrelationWindow(candidate?.latestActivityAt, message.sentAt)
        );
      });
      if (!matchedAlias) {
        for (const [knownAlias, candidateClusterId] of emailAlias.entries()) {
          if (!candidateClusterId || !map.has(candidateClusterId)) continue;
          const candidate = map.get(candidateClusterId);
          if (!isSubjectFuzzyMatch(candidate?.subject, message.subject)) continue;
          if (!isWithinCorrelationWindow(candidate?.latestActivityAt, message.sentAt)) continue;
          const fuzzyHit = aliasCandidates.some((alias) =>
            isEmailAliasFuzzyMatch(alias, knownAlias)
          );
          if (!fuzzyHit) continue;
          matchedAlias = knownAlias;
          break;
        }
      }
      if (matchedAlias) clusterId = emailAlias.get(matchedAlias);
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
        latestActivityAt: message.sentAt || null,
        messages: [],
        riskWords: [],
        mailboxId: normalizeText(message.mailboxId) || null,
        mailboxAddress: normalizeText(message.mailboxAddress) || null,
        userPrincipalName: normalizeText(message.userPrincipalName) || null,
        customerEmails: new Set(),
      });
    }
    const entry = map.get(clusterId);
    if (rawConversationId) {
      entry.conversationIds.add(rawConversationId);
      conversationAlias.set(rawConversationId, clusterId);
      if (!entry.primaryConversationId) entry.primaryConversationId = rawConversationId;
    }
    if (fallbackKey) fallbackAlias.set(fallbackKey, clusterId);
    if (message.internetMessageId) {
      messageIdAlias.set(message.internetMessageId, clusterId);
    }
    for (const aliasCandidate of aliasCandidates) {
      emailAlias.set(aliasCandidate, clusterId);
    }

    const messageDirection = message.direction === 'outbound' ? 'outbound' : 'inbound';
    entry.messages.push({
      messageId: message.messageId,
      direction: messageDirection,
      isRead: typeof message.isRead === 'boolean' ? message.isRead : null,
      sentAt: message.sentAt,
      bodyPreview: message.bodyPreview,
      bodyHtml: normalizeText(message.bodyHtml) || null,
      hasAttachments: message.hasAttachments === true,
      attachments: toSafeAttachmentMetadata(message.attachments),
      mailboxId: normalizeText(message.mailboxId) || null,
      mailboxAddress: normalizeText(message.mailboxAddress) || null,
      userPrincipalName: normalizeText(message.userPrincipalName) || null,
      senderEmail: normalizeText(message.senderEmail).toLowerCase() || null,
      senderName: normalizeText(message.senderName) || null,
      recipients: asArray(message.recipients).slice(0, 20),
      replyToRecipients: asArray(message.replyToRecipients).slice(0, 20),
      internetMessageId: normalizeHeaderMessageId(message.internetMessageId) || null,
      inReplyTo: normalizeHeaderMessageId(message.inReplyTo) || null,
      references: asArray(message.references).map((item) => normalizeHeaderMessageId(item)).filter(Boolean),
    });
    if (messageDirection === 'inbound') {
      if (message.sentAt && compareIsoDesc(entry.lastInboundAt, message.sentAt) > 0) {
        entry.lastInboundAt = message.sentAt;
      }
      if (normalizeText(message.senderEmail)) {
        entry.customerEmails.add(normalizeText(message.senderEmail).toLowerCase());
      }
    } else {
      if (message.sentAt && compareIsoDesc(entry.lastOutboundAt, message.sentAt) > 0) {
        entry.lastOutboundAt = message.sentAt;
      }
      const recipients = asArray(message.recipients)
        .map((item) => normalizeText(item).toLowerCase())
        .filter(Boolean);
      for (const recipient of recipients) {
        entry.customerEmails.add(recipient);
      }
    }
    if (
      normalizeText(message.sentAt) &&
      (!normalizeText(entry.latestActivityAt) ||
        compareIsoDesc(entry.latestActivityAt, message.sentAt) > 0)
    ) {
      entry.latestActivityAt = message.sentAt;
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
      Array.from(conversation.customerEmails.values())
        .map((item) => normalizeText(item).toLowerCase())
        .find(Boolean) || null;
    delete conversation.clusterId;
    delete conversation.primaryConversationId;
    delete conversation.conversationIds;
    delete conversation.customerEmails;
    delete conversation.latestActivityAt;
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
  const filterAliases = new Set(
    toEmailAliases(rawFilter).map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
  );
  const normalizedFilter = normalizeText(rawFilter).toLowerCase();
  if (normalizedFilter) filterAliases.add(normalizedFilter);
  if (filterAliases.size === 0) return false;

  const candidates = [
    normalizeText(user?.id),
    normalizeText(user?.mail),
    normalizeText(user?.userPrincipalName),
    normalizeText(user?.mailboxId),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const candidateAliases = toEmailAliases(candidate)
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean);
    const normalizedCandidate = normalizeText(candidate).toLowerCase();
    if (normalizedCandidate) candidateAliases.push(normalizedCandidate);
    if (candidateAliases.some((alias) => filterAliases.has(alias))) {
      return true;
    }
  }
  return false;
}

const MAILBOX_TRUTH_FOLDER_SPECS = Object.freeze([
  Object.freeze({
    folderType: 'inbox',
    graphFolderName: 'inbox',
    fallbackDisplayName: 'Inbox',
    dateField: 'receivedDateTime',
    orderBy: 'receivedDateTime desc',
    includeReadFilterSupported: true,
  }),
  Object.freeze({
    folderType: 'sent',
    graphFolderName: 'SentItems',
    fallbackDisplayName: 'Sent Items',
    dateField: 'sentDateTime',
    orderBy: 'sentDateTime desc',
    includeReadFilterSupported: false,
  }),
  Object.freeze({
    folderType: 'drafts',
    graphFolderName: 'Drafts',
    fallbackDisplayName: 'Drafts',
    dateField: 'lastModifiedDateTime',
    orderBy: 'lastModifiedDateTime desc',
    includeReadFilterSupported: false,
  }),
  Object.freeze({
    folderType: 'deleted',
    graphFolderName: 'DeletedItems',
    fallbackDisplayName: 'Deleted Items',
    dateField: 'lastModifiedDateTime',
    orderBy: 'lastModifiedDateTime desc',
    includeReadFilterSupported: false,
  }),
]);

function resolveMailboxTruthFolderSpecs(requestedFolders = null) {
  const requested = Array.isArray(requestedFolders)
    ? requestedFolders
        .map((item) => normalizeText(item).toLowerCase())
        .filter(Boolean)
    : [];
  if (requested.length === 0) return MAILBOX_TRUTH_FOLDER_SPECS.slice();
  const requestedSet = new Set(requested);
  return MAILBOX_TRUTH_FOLDER_SPECS.filter((item) => requestedSet.has(item.folderType));
}

function toFolderMetadataUrl({
  graphBaseUrl,
  userId,
  graphFolderName,
}) {
  const folderUrl = new URL(
    `${graphBaseUrl}/users/${encodeURIComponent(userId)}/mailFolders/${encodeURIComponent(
      graphFolderName
    )}`
  );
  folderUrl.searchParams.set(
    '$select',
    ['id', 'displayName', 'totalItemCount', 'unreadItemCount'].join(',')
  );
  return folderUrl;
}

function toFolderMessagesUrl({
  graphBaseUrl,
  userId,
  graphFolderName,
  maxMessages,
  dateField,
  startIso,
  endIso,
  orderBy,
  includeReadMessages,
  includeReadFilterSupported,
  includeCount = false,
}) {
  const messagesUrl = new URL(
    `${graphBaseUrl}/users/${encodeURIComponent(userId)}/mailFolders/${encodeURIComponent(
      graphFolderName
    )}/messages`
  );
  messagesUrl.searchParams.set('$top', String(maxMessages));
  messagesUrl.searchParams.set(
    '$select',
    [
      'id',
      'conversationId',
      'subject',
      'bodyPreview',
      'body',
      'receivedDateTime',
      'sentDateTime',
      'createdDateTime',
      'lastModifiedDateTime',
      'isRead',
      'isDraft',
      'from',
      'toRecipients',
      'ccRecipients',
      'bccRecipients',
      'replyTo',
      'internetMessageId',
      'internetMessageHeaders',
      'hasAttachments',
      'parentFolderId',
    ].join(',')
  );
  messagesUrl.searchParams.set('$orderby', orderBy);
  const filterParts = [];
  const safeStartIso = normalizeText(startIso);
  if (safeStartIso) filterParts.push(`${dateField} ge ${safeStartIso}`);
  const safeEndIso = normalizeText(endIso);
  if (safeEndIso) filterParts.push(`${dateField} lt ${safeEndIso}`);
  if (includeReadFilterSupported && !includeReadMessages) filterParts.push('isRead eq false');
  if (filterParts.length > 0) {
    messagesUrl.searchParams.set('$filter', filterParts.join(' and '));
  }
  if (includeCount) {
    messagesUrl.searchParams.set('$count', 'true');
  }
  return messagesUrl;
}

function toFolderMessagesDeltaUrl({
  graphBaseUrl,
  userId,
  graphFolderName,
  maxMessages,
}) {
  const messagesUrl = new URL(
    `${graphBaseUrl}/users/${encodeURIComponent(userId)}/mailFolders/${encodeURIComponent(
      graphFolderName
    )}/messages/delta`
  );
  messagesUrl.searchParams.set('$top', String(maxMessages));
  messagesUrl.searchParams.set(
    '$select',
    [
      'id',
      'conversationId',
      'subject',
      'bodyPreview',
      'body',
      'receivedDateTime',
      'sentDateTime',
      'createdDateTime',
      'lastModifiedDateTime',
      'isRead',
      'isDraft',
      'from',
      'toRecipients',
      'ccRecipients',
      'bccRecipients',
      'replyTo',
      'internetMessageId',
      'internetMessageHeaders',
      'hasAttachments',
      'parentFolderId',
    ].join(',')
  );
  return messagesUrl;
}

function inferMailboxTruthDirection({
  raw = {},
  folderType = 'unknown',
  mailboxAliases = [],
}) {
  if (folderType === 'inbox') return 'inbound';
  if (folderType === 'sent') return 'outbound';
  if (folderType === 'drafts') return 'draft';

  const safeAliases = Array.isArray(mailboxAliases)
    ? mailboxAliases.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
    : [];
  const sender = normalizeText(raw?.from?.emailAddress?.address).toLowerCase();
  if (sender && safeAliases.includes(sender)) return 'outbound';

  const recipients = [
    ...toRecipientList(raw?.toRecipients),
    ...toRecipientList(raw?.ccRecipients),
    ...toRecipientList(raw?.bccRecipients),
    ...toReplyToList(raw?.replyTo),
  ]
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean);
  if (recipients.some((item) => safeAliases.includes(item))) return 'inbound';
  return 'unknown';
}

function toMailboxTruthRawMessage(
  raw = {},
  {
    folderType = 'unknown',
    folderId = '',
    folderName = '',
    wellKnownName = '',
    mailboxId = '',
    mailboxAddress = '',
    userPrincipalName = '',
  } = {}
) {
  const graphMessageId = normalizeText(raw.id);
  if (!graphMessageId) return null;

  const internetHeaders = Array.isArray(raw?.internetMessageHeaders)
    ? raw.internetMessageHeaders
    : [];
  const inReplyTo =
    normalizeHeaderMessageId(raw?.inReplyTo) ||
    normalizeHeaderMessageId(toHeaderValue(internetHeaders, 'in-reply-to')) ||
    null;
  const references = [
    ...toReferenceIds(raw?.references),
    ...toReferenceIds(toHeaderValue(internetHeaders, 'references')),
  ];
  const mailboxAliases = [mailboxId, mailboxAddress, userPrincipalName];
  const attachments = toSafeAttachmentMetadata(raw?.attachments);

  return {
    graphMessageId,
    mailboxId: normalizeText(mailboxId).toLowerCase() || null,
    mailboxAddress: normalizeText(mailboxAddress).toLowerCase() || null,
    userPrincipalName: normalizeText(userPrincipalName).toLowerCase() || null,
    folderId: normalizeText(raw.parentFolderId || folderId) || null,
    folderName: normalizeText(folderName) || null,
    folderType,
    wellKnownName: normalizeText(wellKnownName) || null,
    conversationId: normalizeText(raw.conversationId) || null,
    subject: maskInboxText(raw.subject, 180) || '(utan amne)',
    bodyPreview: maskInboxText(raw.bodyPreview, 360),
    bodyHtml: sanitizeStoredBodyHtml(raw?.body?.content) || null,
    direction: inferMailboxTruthDirection({
      raw,
      folderType,
      mailboxAliases,
    }),
    isRead: typeof raw?.isRead === 'boolean' ? raw.isRead : null,
    isDraft: raw?.isDraft === true || folderType === 'drafts',
    hasAttachments: raw?.hasAttachments === true || attachments.length > 0,
    receivedAt: toIso(raw?.receivedDateTime) || null,
    sentAt: toIso(raw?.sentDateTime) || null,
    createdAt: toIso(raw?.createdDateTime) || null,
    lastModifiedAt: toIso(raw?.lastModifiedDateTime) || null,
    from: {
      address: normalizeText(raw?.from?.emailAddress?.address).toLowerCase() || null,
      name: normalizeText(raw?.from?.emailAddress?.name) || null,
    },
    toRecipients: toNamedRecipients(raw?.toRecipients),
    ccRecipients: toNamedRecipients(raw?.ccRecipients),
    bccRecipients: toNamedRecipients(raw?.bccRecipients),
    replyToRecipients: toNamedRecipients(raw?.replyTo),
    internetMessageId: normalizeHeaderMessageId(raw?.internetMessageId) || null,
    inReplyTo,
    references: Array.from(new Set(references)).filter(Boolean),
    attachments,
  };
}

function toMailboxTruthDeltaChange(
  raw = {},
  {
    folderType = 'unknown',
    folderId = '',
    folderName = '',
    wellKnownName = '',
    mailboxId = '',
    mailboxAddress = '',
    userPrincipalName = '',
  } = {}
) {
  const graphMessageId = normalizeText(raw?.id);
  if (!graphMessageId) return null;
  const removed = raw && typeof raw === 'object' ? raw['@removed'] : null;
  if (removed && typeof removed === 'object') {
    return {
      changeType: 'deleted',
      graphMessageId,
      mailboxId: normalizeText(mailboxId).toLowerCase() || null,
      mailboxAddress: normalizeText(mailboxAddress).toLowerCase() || null,
      userPrincipalName: normalizeText(userPrincipalName).toLowerCase() || null,
      folderId: normalizeText(folderId) || null,
      folderName: normalizeText(folderName) || null,
      folderType,
      wellKnownName: normalizeText(wellKnownName) || null,
      removalReason: normalizeText(removed?.reason) || 'deleted',
    };
  }
  const normalizedMessage = toMailboxTruthRawMessage(raw, {
    folderType,
    folderId,
    folderName,
    wellKnownName,
    mailboxId,
    mailboxAddress,
    userPrincipalName,
  });
  if (!normalizedMessage) return null;
  return {
    changeType: 'upsert',
    graphMessageId: normalizedMessage.graphMessageId,
    mailboxId: normalizedMessage.mailboxId,
    mailboxAddress: normalizedMessage.mailboxAddress,
    userPrincipalName: normalizedMessage.userPrincipalName,
    folderType: normalizedMessage.folderType,
    message: normalizedMessage,
  };
}

function toInboxMessagesUrl({
  graphBaseUrl,
  userId,
  maxMessages,
  receivedSinceIso,
  receivedUntilIso,
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
      'body',
      'receivedDateTime',
      'sentDateTime',
      'isRead',
      'from',
      'toRecipients',
      'replyTo',
      'internetMessageId',
      'internetMessageHeaders',
    ].join(',')
  );
  messagesUrl.searchParams.set('$orderby', 'receivedDateTime desc');
  const filterParts = [`receivedDateTime ge ${receivedSinceIso}`];
  const safeReceivedUntilIso = normalizeText(receivedUntilIso);
  if (safeReceivedUntilIso) filterParts.push(`receivedDateTime lt ${safeReceivedUntilIso}`);
  if (!includeReadMessages) filterParts.push('isRead eq false');
  messagesUrl.searchParams.set('$filter', filterParts.join(' and '));
  return messagesUrl;
}

function toSentMessagesUrl({
  graphBaseUrl,
  userId,
  maxMessages,
  sentSinceIso,
  sentUntilIso,
}) {
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
      'body',
      'receivedDateTime',
      'sentDateTime',
      'from',
      'toRecipients',
      'replyTo',
      'internetMessageId',
      'internetMessageHeaders',
    ].join(',')
  );
  messagesUrl.searchParams.set('$orderby', 'sentDateTime desc');
  const filterParts = [`sentDateTime ge ${sentSinceIso}`];
  const safeSentUntilIso = normalizeText(sentUntilIso);
  if (safeSentUntilIso) filterParts.push(`sentDateTime lt ${safeSentUntilIso}`);
  messagesUrl.searchParams.set('$filter', filterParts.join(' and '));
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

  async function fetchGraphTextWithRetry({
    url,
    accessToken,
    label,
    timeoutMs,
    requestMaxRetries = 2,
    retryBaseDelayMs = 500,
    retryMaxDelayMs = 5000,
    accept = 'message/rfc822',
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
              accept,
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
        return await parseTextResponse(response, label);
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

  async function fetchGraphBinaryWithRetry({
    url,
    accessToken,
    label,
    timeoutMs,
    requestMaxRetries = 2,
    retryBaseDelayMs = 500,
    retryMaxDelayMs = 5000,
    accept = '*/*',
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
              accept,
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
        return await parseBinaryResponse(response, label);
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

  async function fetchMessageAttachments({
    graphBaseUrl,
    userId,
    messageId,
    accessToken,
    label,
    timeoutMs,
    requestMaxRetries = 2,
    retryBaseDelayMs = 500,
    retryMaxDelayMs = 5000,
  }) {
    const safeUserId = normalizeText(userId);
    const safeMessageId = normalizeText(messageId);
    if (!safeUserId || !safeMessageId) return [];
    const url = new URL(
      `${graphBaseUrl}/users/${encodeURIComponent(safeUserId)}/messages/${encodeURIComponent(
        safeMessageId
      )}/attachments`
    );
    const payload = await fetchGraphCollection({
      initialUrl: url.toString(),
      accessToken,
      label,
      timeoutMs,
      maxItems: 20,
      maxPages: 2,
      requestMaxRetries,
      retryBaseDelayMs,
      retryMaxDelayMs,
    });
    const attachments = Array.isArray(payload?.value) ? payload.value : [];
    const maxInlineImageBytes = 1024 * 1024;
    const maxTotalInlineImageBytes = Math.floor(2.5 * 1024 * 1024);
    let totalInlineImageBytes = 0;
    return attachments
      .map((item) => ({
        id: normalizeText(item?.id) || null,
        name: normalizeText(item?.name) || null,
        contentType: normalizeText(item?.contentType) || null,
        contentId: normalizeText(item?.contentId) || null,
        isInline: item?.isInline === true,
        size: toNumber(item?.size, 0),
        sourceType: normalizeText(item?.['@odata.type'] || 'graph_file_attachment') || 'graph_file_attachment',
        contentBytes: (() => {
          const contentType = normalizeText(item?.contentType).toLowerCase();
          const contentBytes = normalizeText(item?.contentBytes);
          const size = toNumber(item?.size, 0);
          if (!contentType.startsWith('image/')) return null;
          if (item?.isInline !== true) return null;
          if (!contentBytes) return null;
          if (size <= 0 || size > maxInlineImageBytes) return null;
          if (totalInlineImageBytes + size > maxTotalInlineImageBytes) return null;
          totalInlineImageBytes += size;
          return contentBytes;
        })(),
      }))
      .filter(
        (item) =>
          Boolean(item?.id || item?.name || item?.contentType || item?.contentId || item?.size)
      );
  }

  async function fetchMessageMimeContent({
    userId,
    messageId,
    label = 'Microsoft Graph open-mail MIME request',
    timeoutMs = 7000,
    requestMaxRetries = 2,
    retryBaseDelayMs = 500,
    retryMaxDelayMs = 5000,
  }) {
    const safeUserId = normalizeText(userId);
    const safeMessageId = normalizeText(messageId);
    if (!safeUserId || !safeMessageId) {
      return {
        rawMime: '',
        contentType: null,
      };
    }
    const accessToken = await fetchAccessToken();
    const url = `${graphBaseUrl}/users/${encodeURIComponent(safeUserId)}/messages/${encodeURIComponent(
      safeMessageId
    )}/$value`;
    const payload = await fetchGraphTextWithRetry({
      url,
      accessToken,
      label,
      timeoutMs,
      requestMaxRetries,
      retryBaseDelayMs,
      retryMaxDelayMs,
      accept: 'message/rfc822',
    });
    return {
      rawMime: normalizeText(payload?.text),
      contentType: normalizeText(payload?.contentType) || null,
    };
  }

  async function fetchMessageAttachmentContent({
    userId,
    messageId,
    attachmentId,
    label = 'Microsoft Graph open-mail attachment request',
    timeoutMs = 7000,
    requestMaxRetries = 2,
    retryBaseDelayMs = 500,
    retryMaxDelayMs = 5000,
  }) {
    const safeUserId = normalizeText(userId);
    const safeMessageId = normalizeText(messageId);
    const safeAttachmentId = normalizeText(attachmentId);
    if (!safeUserId || !safeMessageId || !safeAttachmentId) {
      return {
        attachmentId: safeAttachmentId || null,
        name: null,
        contentType: null,
        size: 0,
        isInline: false,
        contentId: null,
        buffer: Buffer.alloc(0),
        sourceType: null,
      };
    }
    const accessToken = await fetchAccessToken();
    const metadataUrl = `${graphBaseUrl}/users/${encodeURIComponent(
      safeUserId
    )}/messages/${encodeURIComponent(safeMessageId)}/attachments/${encodeURIComponent(
      safeAttachmentId
    )}`;
    const metadata = await fetchGraphPageWithRetry({
      url: metadataUrl,
      accessToken,
      label,
      timeoutMs,
      requestMaxRetries,
      retryBaseDelayMs,
      retryMaxDelayMs,
    });

    const contentBytes = normalizeText(metadata?.contentBytes);
    const contentBuffer = contentBytes
      ? Buffer.from(contentBytes, 'base64')
      : (
          await fetchGraphBinaryWithRetry({
            url: `${metadataUrl}/$value`,
            accessToken,
            label: `${label} binary`,
            timeoutMs,
            requestMaxRetries,
            retryBaseDelayMs,
            retryMaxDelayMs,
            accept: normalizeText(metadata?.contentType) || '*/*',
          })
        ).buffer;

    return {
      attachmentId: safeAttachmentId,
      name: normalizeText(metadata?.name) || null,
      contentType: normalizeText(metadata?.contentType) || null,
      size: toNumber(metadata?.size, contentBuffer.length),
      isInline: metadata?.isInline === true,
      contentId: normalizeText(metadata?.contentId) || null,
      buffer: contentBuffer,
      sourceType:
        normalizeText(metadata?.sourceType || metadata?.['@odata.type'] || 'graph_file_attachment') ||
        'graph_file_attachment',
    };
  }

  async function fetchInlineImageAttachments(options = {}) {
    const attachments = await fetchMessageAttachments(options);
    return attachments.filter((item) => {
      const contentType = normalizeText(item?.contentType).toLowerCase();
      return contentType.startsWith('image/') && normalizeText(item?.contentBytes);
    });
  }

  function sanitizeResolvedAttachmentMetadata(attachments = []) {
    return toSafeAttachmentMetadata(attachments);
  }

  async function enrichMessagesWithInlineHtmlAssets({
    rawMessages = [],
    graphBaseUrl,
    userId,
    accessToken,
    timeoutMs,
    label,
    requestMaxRetries = 2,
    retryBaseDelayMs = 500,
    retryMaxDelayMs = 5000,
  }) {
    const safeMessages = Array.isArray(rawMessages) ? rawMessages : [];
    const enriched = [];
    for (const rawMessage of safeMessages) {
      const safeMessage = rawMessage && typeof rawMessage === 'object' ? { ...rawMessage } : rawMessage;
      const bodyContent = normalizeText(safeMessage?.body?.content);
      const cidReferences = extractInlineCidReferences(bodyContent);
      const shouldFetchAttachments =
        safeMessage?.hasAttachments === true || cidReferences.length > 0;
      if (!shouldFetchAttachments) {
        enriched.push(safeMessage);
        continue;
      }
      try {
        const resolvedAttachments = await fetchMessageAttachments({
          graphBaseUrl,
          userId,
          messageId: safeMessage?.id,
          accessToken,
          label,
          timeoutMs,
          requestMaxRetries,
          retryBaseDelayMs,
          retryMaxDelayMs,
        });
        if (resolvedAttachments.length) {
          safeMessage.attachments = sanitizeResolvedAttachmentMetadata(resolvedAttachments);
        }
        if (cidReferences.length && resolvedAttachments.length) {
          safeMessage.body = {
            ...(safeMessage?.body && typeof safeMessage.body === 'object' ? safeMessage.body : {}),
            content: resolveInlineCidImages(bodyContent, resolvedAttachments),
          };
        }
      } catch (_error) {
      }
      enriched.push(safeMessage);
    }
    return enriched;
  }

  async function enrichStoredMessagesWithInlineHtmlAssets({
    messages = [],
    timeoutMs = 5000,
    label = 'Microsoft Graph stored inline attachment repair',
    requestMaxRetries = 2,
    retryBaseDelayMs = 500,
    retryMaxDelayMs = 5000,
  } = {}) {
    return enrichStoredMessagesWithMailAssets({
      messages,
      timeoutMs,
      label,
      requestMaxRetries,
      retryBaseDelayMs,
      retryMaxDelayMs,
    });
  }

  async function enrichStoredMessagesWithMailAssets({
    messages = [],
    timeoutMs = 5000,
    label = 'Microsoft Graph stored mail asset enrichment',
    requestMaxRetries = 2,
    retryBaseDelayMs = 500,
    retryMaxDelayMs = 5000,
  } = {}) {
    const safeMessages = Array.isArray(messages) ? messages : [];
    if (safeMessages.length === 0) return [];
    const accessToken = await fetchAccessToken();
    const enriched = [];
    for (const message of safeMessages) {
      const safeMessage = message && typeof message === 'object' ? { ...message } : message;
      const graphMessageId = normalizeText(
        safeMessage?.graphMessageId || safeMessage?.messageId
      );
      const targetUserId = normalizeText(
        safeMessage?.userPrincipalName ||
          safeMessage?.mailboxAddress ||
          safeMessage?.mailboxId ||
          userId
      );
      const bodyHtml = normalizeText(safeMessage?.bodyHtml);
      const cidReferences = extractInlineCidReferences(bodyHtml);
      const shouldFetchAttachments =
        safeMessage?.hasAttachments === true || cidReferences.length > 0;
      if (!graphMessageId || !targetUserId || !shouldFetchAttachments) {
        enriched.push(safeMessage);
        continue;
      }
      try {
        const resolvedAttachments = await fetchMessageAttachments({
          graphBaseUrl,
          userId: targetUserId,
          messageId: graphMessageId,
          accessToken,
          label,
          timeoutMs,
          requestMaxRetries,
          retryBaseDelayMs,
          retryMaxDelayMs,
        });
        if (resolvedAttachments.length) {
          safeMessage.attachments = sanitizeResolvedAttachmentMetadata(resolvedAttachments);
        }
        if (cidReferences.length && resolvedAttachments.length) {
          safeMessage.bodyHtml = sanitizeStoredBodyHtml(
            resolveInlineCidImages(bodyHtml, resolvedAttachments)
          );
        }
      } catch (_error) {
      }
      enriched.push(safeMessage);
    }
    return enriched;
  }

  async function fetchMailboxTruthFolderPage(options = {}) {
    const nowMs = Number(now());
    if (!Number.isFinite(nowMs)) {
      throw new Error('MicrosoftGraphReadConnector now() must return a finite timestamp.');
    }

    const targetUserId = normalizeText(options.userId || userId);
    if (!targetUserId) {
      throw new Error('MicrosoftGraphReadConnector fetchMailboxTruthFolderPage requires userId.');
    }
    const requestedFolderType = normalizeText(options.folderType).toLowerCase();
    const folderSpec = resolveMailboxTruthFolderSpecs([requestedFolderType])[0];
    if (!folderSpec) {
      throw new Error(`MicrosoftGraphReadConnector unknown mailbox truth folderType: ${requestedFolderType || 'missing'}.`);
    }

    const includeReadMessages = options.includeRead !== false;
    const explicitSinceIso = toIso(options.sinceIso);
    const explicitUntilIso = toIso(options.untilIso);
    if (
      explicitSinceIso &&
      explicitUntilIso &&
      Date.parse(explicitUntilIso) <= Date.parse(explicitSinceIso)
    ) {
      throw new Error('MicrosoftGraphReadConnector untilIso must be later than sinceIso.');
    }

    const windowDays = clampInt(options.days, 1, 180, 30);
    const fallbackSinceIso = toIsoFromMs(nowMs - windowDays * 24 * 60 * 60 * 1000);
    const startIso = explicitSinceIso || fallbackSinceIso;
    const endIso = explicitUntilIso || '';
    const pageSize = clampInt(options.pageSize, 1, 500, 200);
    const mailboxTimeoutMs = clampInt(options.mailboxTimeoutMs, 1000, 15000, 5000);
    const requestMaxRetries = clampInt(options.requestMaxRetries, 0, 6, 2);
    const retryBaseDelayMs = clampInt(options.retryBaseDelayMs, 100, 10000, 500);
    const retryMaxDelayMs = clampInt(options.retryMaxDelayMs, 200, 30000, 5000);
    const nextPageUrl = normalizeText(options.nextPageUrl);

    const providedIdentity = {
      id: normalizeText(options.graphUserId) || targetUserId,
      mail:
        normalizeText(options.mailboxAddress) ||
        normalizeText(options.mailboxId) ||
        targetUserId,
      userPrincipalName: normalizeText(options.userPrincipalName) || targetUserId,
    };
    const identity = toMailboxIdentity(providedIdentity, targetUserId);
    const accessToken = await fetchAccessToken();

    let folderMetadata = options.folderMetadata && typeof options.folderMetadata === 'object'
      ? {
          folderId: normalizeText(options.folderMetadata.folderId || options.folderMetadata.id) || null,
          folderName:
            normalizeText(options.folderMetadata.folderName || options.folderMetadata.displayName) ||
            folderSpec.fallbackDisplayName,
          wellKnownName:
            normalizeText(options.folderMetadata.wellKnownName) || folderSpec.graphFolderName,
          totalItemCount: toNumber(options.folderMetadata.totalItemCount, 0),
          unreadItemCount: toNumber(options.folderMetadata.unreadItemCount, 0),
        }
      : null;

    if (!folderMetadata || !normalizeText(folderMetadata.folderId)) {
      const metadataPayload = await fetchGraphPageWithRetry({
        url: toFolderMetadataUrl({
          graphBaseUrl,
          userId: targetUserId,
          graphFolderName: folderSpec.graphFolderName,
        }).toString(),
        accessToken,
        label: `Microsoft Graph folder metadata request (${identity.mailboxId || targetUserId} · ${folderSpec.folderType})`,
        timeoutMs: mailboxTimeoutMs,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });
      folderMetadata = {
        folderId: normalizeText(metadataPayload?.id) || null,
        folderName:
          normalizeText(metadataPayload?.displayName) || folderSpec.fallbackDisplayName,
        wellKnownName:
          normalizeText(metadataPayload?.wellKnownName) || folderSpec.graphFolderName,
        totalItemCount: toNumber(metadataPayload?.totalItemCount, 0),
        unreadItemCount: toNumber(metadataPayload?.unreadItemCount, 0),
      };
    }

    const pageUrl = nextPageUrl
      ? nextPageUrl
      : toFolderMessagesUrl({
          graphBaseUrl,
          userId: targetUserId,
          graphFolderName: folderSpec.graphFolderName,
          maxMessages: pageSize,
          dateField: folderSpec.dateField,
          startIso,
          endIso,
          orderBy: folderSpec.orderBy,
          includeReadMessages,
          includeReadFilterSupported: folderSpec.includeReadFilterSupported,
          includeCount: true,
        }).toString();

    const payload = await fetchGraphPageWithRetry({
      url: pageUrl,
      accessToken,
      label: `Microsoft Graph mailbox truth page request (${identity.mailboxId || targetUserId} · ${folderSpec.folderType})`,
      timeoutMs: mailboxTimeoutMs,
      requestMaxRetries,
      retryBaseDelayMs,
      retryMaxDelayMs,
    });

    const enrichedRawMessages = await enrichMessagesWithInlineHtmlAssets({
      rawMessages: payload?.value,
      graphBaseUrl,
      userId: targetUserId,
      accessToken,
      timeoutMs: mailboxTimeoutMs,
      label: `Microsoft Graph inline attachment request (${identity.mailboxId || targetUserId} · ${folderSpec.folderType})`,
      requestMaxRetries,
      retryBaseDelayMs,
      retryMaxDelayMs,
    });

    const messages = Array.isArray(enrichedRawMessages)
      ? enrichedRawMessages
          .map((raw) =>
            toMailboxTruthRawMessage(raw, {
              folderType: folderSpec.folderType,
              folderId: folderMetadata.folderId,
              folderName: folderMetadata.folderName,
              wellKnownName: folderMetadata.wellKnownName,
              mailboxId: identity.mailboxId,
              mailboxAddress: identity.mail,
              userPrincipalName: identity.userPrincipalName,
            })
          )
          .filter(Boolean)
      : [];

    return {
      account: {
        graphUserId: identity.id,
        mailboxId: identity.mailboxId,
        mailboxAddress: identity.mail,
        userPrincipalName: identity.userPrincipalName,
      },
      folder: {
        folderType: folderSpec.folderType,
        folderId: folderMetadata.folderId,
        folderName: folderMetadata.folderName,
        wellKnownName: folderMetadata.wellKnownName,
        fetchStatus: 'success',
        totalItemCount: folderMetadata.totalItemCount,
        unreadItemCount: folderMetadata.unreadItemCount,
        messageCollectionCount: toNumber(payload?.['@odata.count'], NaN),
      },
      page: {
        fetchedMessageCount: messages.length,
        nextPageUrl: normalizeText(payload?.['@odata.nextLink']) || null,
        pageSize,
        complete: !normalizeText(payload?.['@odata.nextLink']),
        sourcePageUrl: pageUrl,
        windowStartIso: startIso,
        windowEndIso: endIso || null,
      },
      messages,
    };
  }

  async function fetchMailboxTruthFolderDeltaPage(options = {}) {
    const targetUserId = normalizeText(options.userId || userId);
    if (!targetUserId) {
      throw new Error('MicrosoftGraphReadConnector fetchMailboxTruthFolderDeltaPage requires userId.');
    }
    const requestedFolderType = normalizeText(options.folderType).toLowerCase();
    const folderSpec = resolveMailboxTruthFolderSpecs([requestedFolderType])[0];
    if (!folderSpec) {
      throw new Error(
        `MicrosoftGraphReadConnector unknown mailbox truth delta folderType: ${requestedFolderType || 'missing'}.`
      );
    }

    const pageSize = clampInt(options.pageSize, 1, 500, 200);
    const mailboxTimeoutMs = clampInt(options.mailboxTimeoutMs, 1000, 15000, 5000);
    const requestMaxRetries = clampInt(options.requestMaxRetries, 0, 6, 2);
    const retryBaseDelayMs = clampInt(options.retryBaseDelayMs, 100, 10000, 500);
    const retryMaxDelayMs = clampInt(options.retryMaxDelayMs, 200, 30000, 5000);
    const cursorUrl = normalizeText(options.cursorUrl || options.nextPageUrl || options.deltaLink);
    const refreshFolderMetadata = options.refreshFolderMetadata === true || !cursorUrl;

    const providedIdentity = {
      id: normalizeText(options.graphUserId) || targetUserId,
      mail:
        normalizeText(options.mailboxAddress) ||
        normalizeText(options.mailboxId) ||
        targetUserId,
      userPrincipalName: normalizeText(options.userPrincipalName) || targetUserId,
    };
    const identity = toMailboxIdentity(providedIdentity, targetUserId);
    const accessToken = await fetchAccessToken();

    let folderMetadata =
      options.folderMetadata && typeof options.folderMetadata === 'object'
        ? {
            folderId: normalizeText(options.folderMetadata.folderId || options.folderMetadata.id) || null,
            folderName:
              normalizeText(options.folderMetadata.folderName || options.folderMetadata.displayName) ||
              folderSpec.fallbackDisplayName,
            wellKnownName:
              normalizeText(options.folderMetadata.wellKnownName) || folderSpec.graphFolderName,
            totalItemCount: toNumber(options.folderMetadata.totalItemCount, 0),
            unreadItemCount: toNumber(options.folderMetadata.unreadItemCount, 0),
          }
        : null;

    if (refreshFolderMetadata || !folderMetadata || !normalizeText(folderMetadata.folderId)) {
      const metadataPayload = await fetchGraphPageWithRetry({
        url: toFolderMetadataUrl({
          graphBaseUrl,
          userId: targetUserId,
          graphFolderName: folderSpec.graphFolderName,
        }).toString(),
        accessToken,
        label: `Microsoft Graph folder metadata request (${identity.mailboxId || targetUserId} · ${folderSpec.folderType} delta)`,
        timeoutMs: mailboxTimeoutMs,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });
      folderMetadata = {
        folderId: normalizeText(metadataPayload?.id) || null,
        folderName:
          normalizeText(metadataPayload?.displayName) || folderSpec.fallbackDisplayName,
        wellKnownName:
          normalizeText(metadataPayload?.wellKnownName) || folderSpec.graphFolderName,
        totalItemCount: toNumber(metadataPayload?.totalItemCount, 0),
        unreadItemCount: toNumber(metadataPayload?.unreadItemCount, 0),
      };
    }

    const pageUrl = cursorUrl
      ? cursorUrl
      : toFolderMessagesDeltaUrl({
          graphBaseUrl,
          userId: targetUserId,
          graphFolderName: folderSpec.graphFolderName,
          maxMessages: pageSize,
        }).toString();

    let payload = null;
    try {
      payload = await fetchGraphPageWithRetry({
        url: pageUrl,
        accessToken,
        label: `Microsoft Graph mailbox truth delta request (${identity.mailboxId || targetUserId} · ${folderSpec.folderType})`,
        timeoutMs: mailboxTimeoutMs,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });
    } catch (error) {
      const graphServiceCode = parseGraphServiceCode(error?.details).toLowerCase();
      if (
        Number(error?.status || 0) === 410 ||
        graphServiceCode === 'syncstatenotfound' ||
        graphServiceCode === 'syncstateinvalid'
      ) {
        throw createGraphError(
          `Microsoft Graph mailbox truth delta request (${identity.mailboxId || targetUserId} · ${folderSpec.folderType}) failed: delta token invalid`,
          {
            code: 'GRAPH_DELTA_TOKEN_INVALID',
            status: Number(error?.status || 410),
            details: error?.details || null,
          }
        );
      }
      throw error;
    }

    const rawDeltaEntries = Array.isArray(payload?.value) ? payload.value : [];
    const rawDeltaUpserts = rawDeltaEntries.filter((item) => {
      const safeItem = item && typeof item === 'object' ? item : null;
      return !(safeItem && typeof safeItem['@removed'] === 'object');
    });
    const enrichedDeltaUpserts = await enrichMessagesWithInlineHtmlAssets({
      rawMessages: rawDeltaUpserts,
      graphBaseUrl,
      userId: targetUserId,
      accessToken,
      timeoutMs: mailboxTimeoutMs,
      label: `Microsoft Graph inline attachment request (${identity.mailboxId || targetUserId} · ${folderSpec.folderType} delta)`,
      requestMaxRetries,
      retryBaseDelayMs,
      retryMaxDelayMs,
    });
    const enrichedDeltaUpsertMap = new Map(
      asArray(enrichedDeltaUpserts)
        .map((item) => [normalizeText(item?.id), item])
        .filter((entry) => entry[0])
    );

    const changes = rawDeltaEntries.length
      ? rawDeltaEntries
          .map((raw) => {
            const rawId = normalizeText(raw?.id);
            const safeRaw =
              raw &&
              typeof raw === 'object' &&
              !(raw['@removed'] && typeof raw['@removed'] === 'object') &&
              rawId &&
              enrichedDeltaUpsertMap.has(rawId)
                ? enrichedDeltaUpsertMap.get(rawId)
                : raw;
            return toMailboxTruthDeltaChange(safeRaw, {
              folderType: folderSpec.folderType,
              folderId: folderMetadata.folderId,
              folderName: folderMetadata.folderName,
              wellKnownName: folderMetadata.wellKnownName,
              mailboxId: identity.mailboxId,
              mailboxAddress: identity.mail,
              userPrincipalName: identity.userPrincipalName,
            });
          })
          .filter(Boolean)
      : [];

    const nextDeltaPageUrl = normalizeText(payload?.['@odata.nextLink']) || null;
    const deltaLink = normalizeText(payload?.['@odata.deltaLink']) || null;

    return {
      account: {
        graphUserId: identity.id,
        mailboxId: identity.mailboxId,
        mailboxAddress: identity.mail,
        userPrincipalName: identity.userPrincipalName,
      },
      folder: {
        folderType: folderSpec.folderType,
        folderId: folderMetadata.folderId,
        folderName: folderMetadata.folderName,
        wellKnownName: folderMetadata.wellKnownName,
        fetchStatus: 'success',
        totalItemCount: folderMetadata.totalItemCount,
        unreadItemCount: folderMetadata.unreadItemCount,
      },
      page: {
        changeCount: changes.length,
        upsertCount: changes.filter((item) => item.changeType === 'upsert').length,
        deleteCount: changes.filter((item) => item.changeType === 'deleted').length,
        nextPageUrl: nextDeltaPageUrl,
        deltaLink,
        pageSize,
        complete: Boolean(deltaLink) && !nextDeltaPageUrl,
        sourcePageUrl: pageUrl,
      },
      changes,
    };
  }

  async function fetchInboxSnapshot(options = {}) {
    const nowMs = Number(now());
    if (!Number.isFinite(nowMs)) {
      throw new Error('MicrosoftGraphReadConnector now() must return a finite timestamp.');
    }

    const windowDays = clampInt(options.days, 1, 90, 14);
    const maxMessages = clampInt(options.maxMessages, 1, 200, 100);
    const splitDefault = Math.max(1, Math.floor(maxMessages / 2));
    const defaultInboxMaxMessages = Math.max(1, maxMessages - splitDefault);
    const defaultSentMaxMessages = splitDefault;
    const includeReadMessages = options.includeRead === true;
    const explicitSinceIso = toIso(options.sinceIso);
    const explicitUntilIso = toIso(options.untilIso);
    if (explicitSinceIso && explicitUntilIso && Date.parse(explicitUntilIso) <= Date.parse(explicitSinceIso)) {
      throw new Error('MicrosoftGraphReadConnector untilIso must be later than sinceIso.');
    }
    const fallbackSinceIso = toIsoFromMs(nowMs - windowDays * 24 * 60 * 60 * 1000);
    const receivedSinceIso = explicitSinceIso || fallbackSinceIso;
    const receivedUntilIso = explicitUntilIso || '';
    const sentSinceIso = receivedSinceIso;
    const sentUntilIso = receivedUntilIso;
    const windowReferenceEndMs = explicitUntilIso ? Date.parse(explicitUntilIso) : nowMs;
    const effectiveWindowDays =
      explicitSinceIso && Number.isFinite(windowReferenceEndMs)
        ? Math.max(
            1,
            Math.ceil((windowReferenceEndMs - Date.parse(explicitSinceIso)) / (24 * 60 * 60 * 1000))
          )
        : windowDays;

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
    const processedMailboxIds = new Set();

    if (!fullTenantMode) {
      const identity = toMailboxIdentity({}, userId);
      const inboxPayload = await fetchGraphCollection({
        initialUrl: toInboxMessagesUrl({
          graphBaseUrl,
          userId: userId,
          maxMessages: maxInboxMessages,
          receivedSinceIso,
          receivedUntilIso,
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
          sentUntilIso,
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

      const enrichedInboundRawMessages = await enrichMessagesWithInlineHtmlAssets({
        rawMessages: inboxPayload.value,
        graphBaseUrl,
        userId,
        accessToken,
        timeoutMs: mailboxTimeoutMs,
        label: `Microsoft Graph inline attachment request (${identity.mailboxId || userId} · inbox)`,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });
      const enrichedOutboundRawMessages = await enrichMessagesWithInlineHtmlAssets({
        rawMessages: sentPayload.value,
        graphBaseUrl,
        userId,
        accessToken,
        timeoutMs: mailboxTimeoutMs,
        label: `Microsoft Graph inline attachment request (${identity.mailboxId || userId} · sent)`,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });

      const normalizedInboundMessages = Array.isArray(enrichedInboundRawMessages)
        ? enrichedInboundRawMessages
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
      const normalizedOutboundMessages = Array.isArray(enrichedOutboundRawMessages)
        ? enrichedOutboundRawMessages
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
      [
        normalizeText(identity.mailboxId),
        normalizeText(identity.mail),
        normalizeText(identity.userPrincipalName),
        normalizeText(userId),
      ]
        .filter(Boolean)
        .forEach((mailboxId) => processedMailboxIds.add(mailboxId));

      conversations = toConversationSnapshots(normalizedMessages);
      fetchedMessages = normalizedMessages.length;
      inboundMessageCount = normalizedInboundMessages.length;
      outboundMessageCount = normalizedOutboundMessages.length;
      mailboxCount = 1;
    } else {
      const runStartedAt = Date.now();
      const mailboxIdFilterActive = mailboxIdFilter.length > 0;
      const usersListingTop = mailboxIdFilterActive ? Math.max(200, maxUsers) : maxUsers;
      const usersListingMaxItems = mailboxIdFilterActive ? Math.max(500, usersListingTop) : maxUsers;

      const usersUrl = new URL(`${graphBaseUrl}/users`);
      usersUrl.searchParams.set('$top', String(Math.min(999, usersListingTop)));
      usersUrl.searchParams.set('$select', 'id,mail,userPrincipalName');

      const usersPayload = await fetchGraphCollection({
        initialUrl: usersUrl.toString(),
        accessToken,
        label: 'Microsoft Graph user listing request',
        timeoutMs: mailboxTimeoutMs,
        maxItems: usersListingMaxItems,
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
          const mailboxMatchPool = users.length > 0 ? users : limitedUsers;
          mailboxIdFilter.forEach((mailboxId) => {
            const matched = mailboxMatchPool.find((user) => matchesMailboxIdFilter(user, mailboxId));
            if (matched) includeUser(matched);
          });
        }
        return selected;
      })();
      selectedUsers.forEach((user) => {
        [normalizeText(user.mailboxId), normalizeText(user.mail), normalizeText(user.userPrincipalName)]
          .filter(Boolean)
          .forEach((mailboxId) => processedMailboxIds.add(mailboxId));
      });

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
              receivedUntilIso,
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
              sentUntilIso,
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

          const enrichedInboundRawMessages = await enrichMessagesWithInlineHtmlAssets({
            rawMessages: inboxPayload.value,
            graphBaseUrl,
            userId: user.id,
            accessToken,
            timeoutMs: mailboxTimeoutMs,
            label: `Microsoft Graph inline attachment request (${user.mailboxId || user.id} · inbox)`,
            requestMaxRetries,
            retryBaseDelayMs,
            retryMaxDelayMs,
          });
          const enrichedOutboundRawMessages = await enrichMessagesWithInlineHtmlAssets({
            rawMessages: sentPayload.value,
            graphBaseUrl,
            userId: user.id,
            accessToken,
            timeoutMs: mailboxTimeoutMs,
            label: `Microsoft Graph inline attachment request (${user.mailboxId || user.id} · sent)`,
            requestMaxRetries,
            retryBaseDelayMs,
            retryMaxDelayMs,
          });

          const normalizedInboundMessages = Array.isArray(enrichedInboundRawMessages)
            ? enrichedInboundRawMessages
                .map((raw) =>
                  toNormalizedMessage(raw, {
                    ...user,
                    mailboxAddress: user.mail,
                    direction: 'inbound',
                  })
                )
                .filter(Boolean)
            : [];
          const normalizedOutboundMessages = Array.isArray(enrichedOutboundRawMessages)
            ? enrichedOutboundRawMessages
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
          [normalizeText(user.mailboxId), normalizeText(user.mail), normalizeText(user.userPrincipalName)]
            .filter(Boolean)
            .forEach((mailboxId) => processedMailboxIds.add(mailboxId));

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

    const conversationIdFilter = buildConversationIdFilterSet(options.conversationIds);
    if (conversationIdFilter.size > 0 && Array.isArray(conversations)) {
      conversations = conversations.filter((conversation) =>
        conversationMatchesIdFilter(conversation, conversationIdFilter)
      );
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
        windowDays: effectiveWindowDays,
        windowStartIso: receivedSinceIso,
        windowEndIso: receivedUntilIso || null,
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
          (() => {
            const fromConversations = Array.isArray(conversations)
              ? conversations.map((item) => normalizeText(item?.mailboxId)).filter(Boolean)
              : [];
            return Array.from(new Set([...processedMailboxIds, ...fromConversations]));
          })(),
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

  async function fetchMailboxTruthSnapshot(options = {}) {
    const nowMs = Number(now());
    if (!Number.isFinite(nowMs)) {
      throw new Error('MicrosoftGraphReadConnector now() must return a finite timestamp.');
    }

    const windowDays = clampInt(options.days, 1, 180, 30);
    const includeReadMessages = options.includeRead !== false;
    const explicitSinceIso = toIso(options.sinceIso);
    const explicitUntilIso = toIso(options.untilIso);
    if (
      explicitSinceIso &&
      explicitUntilIso &&
      Date.parse(explicitUntilIso) <= Date.parse(explicitSinceIso)
    ) {
      throw new Error('MicrosoftGraphReadConnector untilIso must be later than sinceIso.');
    }
    const fallbackSinceIso = toIsoFromMs(nowMs - windowDays * 24 * 60 * 60 * 1000);
    const startIso = explicitSinceIso || fallbackSinceIso;
    const endIso = explicitUntilIso || '';
    const fullTenant = toBoolean(options.fullTenant, configuredFullTenant);
    const userScope = normalizeUserScope(options.userScope, configuredUserScope);
    const fullTenantMode = fullTenant && userScope === 'all';
    const maxUsers = clampInt(options.maxUsers, 1, 200, 50);
    const mailboxIdFilter = normalizeMailboxIds(options.mailboxIds, 500);
    const mailboxIndexes = normalizeMailboxIndexes(options.mailboxIndexes, maxUsers);
    const requestMaxRetries = clampInt(options.requestMaxRetries, 0, 6, 2);
    const retryBaseDelayMs = clampInt(options.retryBaseDelayMs, 100, 10000, 500);
    const retryMaxDelayMs = clampInt(options.retryMaxDelayMs, 200, 30000, 5000);
    const mailboxTimeoutMs = clampInt(options.mailboxTimeoutMs, 1000, 15000, 5000);
    const runTimeoutMs = clampInt(options.runTimeoutMs, 5000, 120000, 30000);
    const maxMailboxErrors = clampInt(options.maxMailboxErrors, 1, 20, 5);
    const maxPagesPerCollection = clampInt(options.maxPagesPerCollection, 1, 2000, 200);
    const maxMessagesPerFolder = clampInt(options.maxMessagesPerFolder, 1, 500, 200);
    const maxMessagesPerFolderPerUser = clampInt(
      options.maxMessagesPerFolderPerUser,
      1,
      500,
      maxMessagesPerFolder
    );
    const folderSpecs = resolveMailboxTruthFolderSpecs(options.folders);
    const accessToken = await fetchAccessToken();
    const capturedAt = toIsoFromMs(nowMs) || new Date(nowMs).toISOString();

    const warnings = [];
    const accounts = [];
    const processedMailboxIds = new Set();
    let mailboxErrors = 0;
    let folderErrors = 0;
    let fetchedMessages = 0;
    let truncatedFolderCount = 0;

    const fetchFolderPayload = async ({
      user,
      folderSpec,
      maxMessages,
    }) => {
      const metadataPayload = await fetchGraphPageWithRetry({
        url: toFolderMetadataUrl({
          graphBaseUrl,
          userId: user.id,
          graphFolderName: folderSpec.graphFolderName,
        }).toString(),
        accessToken,
        label: `Microsoft Graph folder metadata request (${user.mailboxId || user.id} · ${folderSpec.folderType})`,
        timeoutMs: mailboxTimeoutMs,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });

      const messagesPayload = await fetchGraphCollection({
        initialUrl: toFolderMessagesUrl({
          graphBaseUrl,
          userId: user.id,
          graphFolderName: folderSpec.graphFolderName,
          maxMessages,
          dateField: folderSpec.dateField,
          startIso,
          endIso,
          orderBy: folderSpec.orderBy,
          includeReadMessages,
          includeReadFilterSupported: folderSpec.includeReadFilterSupported,
        }).toString(),
        accessToken,
        label: `Microsoft Graph mailbox truth request (${user.mailboxId || user.id} · ${folderSpec.folderType})`,
        timeoutMs: mailboxTimeoutMs,
        maxItems: maxMessages,
        maxPages: maxPagesPerCollection,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
      });

      return {
        metadata: metadataPayload,
        messages: messagesPayload,
      };
    };

    const normalizeAccountFolders = async (user, maxMessages) => {
      const folders = [];
      let successfulFolderCount = 0;
      for (const folderSpec of folderSpecs) {
        try {
          const payload = await fetchFolderPayload({
            user,
            folderSpec,
            maxMessages,
          });
          const folderMetadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
          const enrichedRawMessages = await enrichMessagesWithInlineHtmlAssets({
            rawMessages: payload.messages?.value,
            graphBaseUrl,
            userId: user.id,
            accessToken,
            timeoutMs: mailboxTimeoutMs,
            label: `Microsoft Graph inline attachment request (${user.mailboxId || user.id} · ${folderSpec.folderType})`,
            requestMaxRetries,
            retryBaseDelayMs,
            retryMaxDelayMs,
          });
          const folderMessages = Array.isArray(enrichedRawMessages)
            ? enrichedRawMessages
                .map((raw) =>
                  toMailboxTruthRawMessage(raw, {
                    folderType: folderSpec.folderType,
                    folderId: normalizeText(folderMetadata.id),
                    folderName:
                      normalizeText(folderMetadata.displayName) || folderSpec.fallbackDisplayName,
                    wellKnownName:
                      normalizeText(folderMetadata.wellKnownName) || folderSpec.graphFolderName,
                    mailboxId: user.mailboxId,
                    mailboxAddress: user.mail,
                    userPrincipalName: user.userPrincipalName,
                  })
                )
                .filter(Boolean)
            : [];
          const truncatedByLimit = payload.messages?.truncatedByLimit === true;
          if (truncatedByLimit) truncatedFolderCount += 1;
          fetchedMessages += folderMessages.length;
          successfulFolderCount += 1;
          folders.push({
            folderType: folderSpec.folderType,
            folderId: normalizeText(folderMetadata.id) || null,
            folderName:
              normalizeText(folderMetadata.displayName) || folderSpec.fallbackDisplayName,
            wellKnownName:
              normalizeText(folderMetadata.wellKnownName) || folderSpec.graphFolderName,
            fetchStatus: 'success',
            totalItemCount: toNumber(folderMetadata.totalItemCount, 0),
            unreadItemCount: toNumber(folderMetadata.unreadItemCount, 0),
            fetchedMessageCount: folderMessages.length,
            truncatedByLimit,
            messages: folderMessages,
          });
        } catch (error) {
          folderErrors += 1;
          warnings.push(
            `Mailbox ${normalizeText(user.mailboxId) || 'unknown'} folder ${folderSpec.folderType} kunde inte lasas (${normalizeText(
              error?.message
            ) || 'request_failed'}).`
          );
          folders.push({
            folderType: folderSpec.folderType,
            folderId: null,
            folderName: folderSpec.fallbackDisplayName,
            wellKnownName: folderSpec.graphFolderName,
            fetchStatus: 'error',
            totalItemCount: 0,
            unreadItemCount: 0,
            fetchedMessageCount: 0,
            truncatedByLimit: false,
            errorCode: normalizeText(error?.code) || null,
            errorMessage: normalizeText(error?.message) || 'request_failed',
            messages: [],
          });
        }
      }

      if (successfulFolderCount === 0) {
        mailboxErrors += 1;
        if (mailboxErrors > maxMailboxErrors) {
          throw createGraphError(
            `Mailbox truth ingest aborted: mailbox error budget exceeded (${mailboxErrors}/${maxMailboxErrors}).`,
            {
              code: 'GRAPH_MAILBOX_ERROR_BUDGET_EXCEEDED',
            }
          );
        }
      }
      return folders;
    };

    if (!fullTenantMode) {
      const identity = toMailboxIdentity({}, userId);
      const folders = await normalizeAccountFolders(identity, maxMessagesPerFolder);
      [
        normalizeText(identity.mailboxId),
        normalizeText(identity.mail),
        normalizeText(identity.userPrincipalName),
        normalizeText(userId),
      ]
        .filter(Boolean)
        .forEach((mailboxId) => processedMailboxIds.add(mailboxId));
      accounts.push({
        graphUserId: identity.id,
        mailboxId: identity.mailboxId,
        mailboxAddress: identity.mail,
        userPrincipalName: identity.userPrincipalName,
        fetchStatus: folders.some((folder) => folder.fetchStatus === 'error') ? 'partial' : 'success',
        folders,
      });
    } else {
      const runStartedAt = Date.now();
      const mailboxIdFilterActive = mailboxIdFilter.length > 0;
      const usersListingTop = mailboxIdFilterActive ? Math.max(200, maxUsers) : maxUsers;
      const usersListingMaxItems = mailboxIdFilterActive ? Math.max(500, usersListingTop) : maxUsers;

      const usersUrl = new URL(`${graphBaseUrl}/users`);
      usersUrl.searchParams.set('$top', String(Math.min(999, usersListingTop)));
      usersUrl.searchParams.set('$select', 'id,mail,userPrincipalName');

      const usersPayload = await fetchGraphCollection({
        initialUrl: usersUrl.toString(),
        accessToken,
        label: 'Microsoft Graph user listing request',
        timeoutMs: mailboxTimeoutMs,
        maxItems: usersListingMaxItems,
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
          if (!user || !user.id || seen.has(user.id)) return;
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
          const mailboxMatchPool = users.length > 0 ? users : limitedUsers;
          mailboxIdFilter.forEach((mailboxId) => {
            const matched = mailboxMatchPool.find((user) => matchesMailboxIdFilter(user, mailboxId));
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

        const folders = await normalizeAccountFolders(user, maxMessagesPerFolderPerUser);
        [normalizeText(user.mailboxId), normalizeText(user.mail), normalizeText(user.userPrincipalName)]
          .filter(Boolean)
          .forEach((mailboxId) => processedMailboxIds.add(mailboxId));
        accounts.push({
          graphUserId: user.id,
          mailboxId: user.mailboxId,
          mailboxAddress: user.mail,
          userPrincipalName: user.userPrincipalName,
          fetchStatus: folders.some((folder) => folder.fetchStatus === 'error') ? 'partial' : 'success',
          folders,
        });
      }

      if (selectedUsers.length === 0) {
        warnings.push('Full-tenant mailbox truth ingest hittade inga mailbox-anvandare i user-listing.');
      }
    }

    return {
      snapshotVersion: 'graph.mailbox.truth.snapshot.v1',
      source: 'microsoft-graph',
      timestamps: {
        capturedAt,
        sourceGeneratedAt: capturedAt,
      },
      accounts,
      metadata: {
        connector: 'MicrosoftGraphReadConnector',
        windowDays,
        windowStartIso: startIso,
        windowEndIso: endIso || null,
        includeReadMessages,
        fullTenantMode,
        userScope,
        maxUsers,
        maxMailboxErrors,
        requestMaxRetries,
        retryBaseDelayMs,
        retryMaxDelayMs,
        mailboxTimeoutMs,
        runTimeoutMs,
        maxPagesPerCollection,
        maxMessagesPerFolder,
        maxMessagesPerFolderPerUser,
        folderTypes: folderSpecs.map((folder) => folder.folderType),
        mailboxIndexes,
        mailboxIdFilter,
        mailboxIds: Array.from(processedMailboxIds),
        accountCount: accounts.length,
        folderCount: accounts.reduce((sum, account) => sum + asArray(account.folders).length, 0),
        messageCount: fetchedMessages,
        fetchedMessages,
        mailboxErrors,
        folderErrors,
        truncatedFolderCount,
      },
      warnings: warnings.slice(0, 50),
    };
  }

  return {
    fetchInboxSnapshot,
    enrichStoredMessagesWithMailAssets,
    enrichStoredMessagesWithInlineHtmlAssets,
    fetchMessageAttachmentContent,
    fetchMessageMimeContent,
    fetchMailboxTruthFolderPage,
    fetchMailboxTruthFolderDeltaPage,
    fetchMailboxTruthSnapshot,
  };
}

module.exports = {
  createMicrosoftGraphReadConnector,
};
