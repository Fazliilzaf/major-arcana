const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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
  const domainMatch = domainPart.match(/^([a-z0-9.-]+)\.(com|se)$/i);
  if (domainMatch) {
    const domainRoot = normalizeText(domainMatch[1]).toLowerCase();
    const flippedTld = normalizeText(domainMatch[2]).toLowerCase() === 'com' ? 'se' : 'com';
    if (domainRoot) {
      aliases.add(`${plusNormalized}@${domainRoot}.${flippedTld}`);
      if (separatorless) aliases.add(`${separatorless}@${domainRoot}.${flippedTld}`);
    }
  }
  return Array.from(aliases);
}

function toEmailAliasSet(values = []) {
  const aliasSet = new Set();
  for (const value of asArray(values)) {
    for (const alias of toEmailAliases(value)) {
      const normalized = normalizeEmailAddress(alias);
      if (normalized) aliasSet.add(normalized);
    }
    const normalized = normalizeEmailAddress(value);
    if (normalized) aliasSet.add(normalized);
  }
  return aliasSet;
}

function normalizeSubjectForSearch(value = '') {
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

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toTimestampMs(value) {
  const iso = toIso(value);
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 2,
    createdAt: ts,
    updatedAt: ts,
    mailboxes: {},
    messages: [],
    outcomes: [],
    actions: [],
  };
}

function normalizeMailboxId(value) {
  return normalizeText(value).toLowerCase();
}

function toMailboxKey(tenantId, mailboxId) {
  const safeTenantId = normalizeText(tenantId);
  const safeMailboxId = normalizeMailboxId(mailboxId);
  if (!safeTenantId || !safeMailboxId) return '';
  return `${safeTenantId}:${safeMailboxId}`;
}

function compareIsoAsc(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

function compareIsoDesc(left, right) {
  return String(right || '').localeCompare(String(left || ''));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRecipients(values) {
  return asArray(values)
    .map((item) => normalizeEmailAddress(item))
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeDirection(value) {
  return normalizeText(value).toLowerCase() === 'outbound' ? 'outbound' : 'inbound';
}

function normalizeOutcomeCode(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['booked', 'bokad'].includes(normalized)) return 'booked';
  if (['rebooked', 'ombokad'].includes(normalized)) return 'rebooked';
  if (['replied', 'answered', 'besvarat'].includes(normalized)) return 'replied';
  if (['not_interested', 'not interested', 'ej intresserad'].includes(normalized)) {
    return 'not_interested';
  }
  if (['escalated', 'eskalerad'].includes(normalized)) return 'escalated';
  if (['no_response', 'no response', 'ingen respons'].includes(normalized)) return 'no_response';
  if (
    [
      'closed_no_action',
      'closed without action',
      'stängd utan åtgärd',
      'stangd utan atgard',
    ].includes(normalized)
  ) {
    return 'closed_no_action';
  }
  return '';
}

const POSITIVE_OUTCOME_CODES = new Set(['booked', 'rebooked', 'replied']);
const NEGATIVE_OUTCOME_CODES = new Set(['escalated', 'no_response']);
const NEUTRAL_OUTCOME_CODES = new Set(['not_interested', 'closed_no_action']);

function classifyOutcomeBucket(outcomeCode = '') {
  const normalized = normalizeOutcomeCode(outcomeCode);
  if (POSITIVE_OUTCOME_CODES.has(normalized)) return 'positive';
  if (NEGATIVE_OUTCOME_CODES.has(normalized)) return 'negative';
  if (NEUTRAL_OUTCOME_CODES.has(normalized)) return 'neutral';
  return 'neutral';
}

function normalizePriorityLevel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'critical') return 'Critical';
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  if (normalized === 'low') return 'Low';
  return null;
}

function normalizeDraftMode(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['short', 'warm', 'professional'].includes(normalized)) return normalized;
  return null;
}

function normalizeHistoryPattern(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['reschedule', 'complaint', 'booking', 'mixed'].includes(normalized)) {
    return normalized;
  }
  return 'none';
}

function normalizeCompactText(value, maxLength = 240) {
  const normalized = normalizeText(value).replace(/\s+/g, ' ');
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function humanizeEmailAddress(value = '') {
  const normalized = normalizeEmailAddress(value);
  if (!normalized) return '';
  const localPart = normalized.split('@')[0] || '';
  return localPart
    .split(/[._+-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const DEFAULT_STORED_BODY_HTML_MAX_LENGTH = 24000;
const INLINE_IMAGE_BODY_HTML_MAX_LENGTH = 240000;

function resolveStoredBodyHtmlMaxLength(value = '', fallback = DEFAULT_STORED_BODY_HTML_MAX_LENGTH) {
  const html = normalizeText(value);
  if (!html) return fallback;
  return /<img\b|data:image\/|cid:/i.test(html)
    ? INLINE_IMAGE_BODY_HTML_MAX_LENGTH
    : fallback;
}

function sanitizeStoredBodyHtml(value = '', maxLength = DEFAULT_STORED_BODY_HTML_MAX_LENGTH) {
  const html = normalizeText(value);
  if (!html) return null;
  const sanitized = html
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link|base)[^>]*\/?\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s(src|href)\s*=\s*(['"])\s*(javascript:|data:text\/html)[\s\S]*?\2/gi, ' $1="#"');
  const effectiveMaxLength = resolveStoredBodyHtmlMaxLength(sanitized, maxLength);
  return sanitized.length <= effectiveMaxLength
    ? sanitized
    : sanitized.slice(0, effectiveMaxLength);
}

function inferHistoryCounterpartyEmail(rawMessage = {}) {
  const direction = normalizeDirection(rawMessage.direction);
  if (direction === 'outbound') {
    const recipient = normalizeEmailAddress(asArray(rawMessage.recipients)[0]);
    if (recipient) return recipient;
    const replyTo = normalizeEmailAddress(asArray(rawMessage.replyToRecipients)[0]);
    return replyTo || normalizeEmailAddress(rawMessage.customerEmail);
  }
  const replyTo = normalizeEmailAddress(asArray(rawMessage.replyToRecipients)[0]);
  if (replyTo) return replyTo;
  const sender = normalizeEmailAddress(rawMessage.senderEmail);
  if (sender) return sender;
  return normalizeEmailAddress(rawMessage.customerEmail);
}

function normalizeDecisionRisk(value = '') {
  const normalized = normalizeCompactText(value, 60);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeHistoryMessage(rawMessage = {}) {
  const tenantId = normalizeText(rawMessage.tenantId);
  const mailboxId = normalizeMailboxId(rawMessage.mailboxId);
  const messageId = normalizeText(rawMessage.messageId);
  if (!tenantId || !mailboxId || !messageId) return null;
  const sentAt = toIso(rawMessage.sentAt);
  const subject = normalizeText(rawMessage.subject) || '(utan ämne)';
  return {
    tenantId,
    mailboxId,
    messageId,
    conversationId: normalizeText(rawMessage.conversationId) || '',
    subject,
    normalizedSubject: normalizeSubjectForSearch(subject) || null,
    customerEmail: normalizeEmailAddress(rawMessage.customerEmail) || null,
    sentAt,
    direction: normalizeDirection(rawMessage.direction),
    bodyPreview: normalizeText(rawMessage.bodyPreview) || '',
    bodyHtml: sanitizeStoredBodyHtml(rawMessage.bodyHtml) || null,
    senderEmail: normalizeEmailAddress(rawMessage.senderEmail) || null,
    senderName: normalizeText(rawMessage.senderName) || null,
    recipients: normalizeRecipients(rawMessage.recipients),
    replyToRecipients: normalizeRecipients(rawMessage.replyToRecipients),
    mailboxAddress: normalizeEmailAddress(rawMessage.mailboxAddress) || null,
    userPrincipalName: normalizeEmailAddress(rawMessage.userPrincipalName) || null,
    internetMessageId: normalizeText(rawMessage.internetMessageId).toLowerCase() || null,
    counterpartyEmail: inferHistoryCounterpartyEmail(rawMessage) || null,
    firstSeenAt: toIso(rawMessage.firstSeenAt) || nowIso(),
    lastSeenAt: toIso(rawMessage.lastSeenAt) || nowIso(),
  };
}

function normalizeHistoryOutcome(rawOutcome = {}) {
  const tenantId = normalizeText(rawOutcome.tenantId);
  const conversationId = normalizeText(rawOutcome.conversationId);
  const outcomeCode = normalizeOutcomeCode(
    rawOutcome.outcomeCode || rawOutcome.code || rawOutcome.outcomeLabel || rawOutcome.label
  );
  if (!tenantId || !conversationId || !outcomeCode) return null;
  const customerEmail = normalizeMailboxId(rawOutcome.customerEmail);
  const selectedMode = normalizeDraftMode(rawOutcome.selectedMode);
  const recommendedMode = normalizeDraftMode(rawOutcome.recommendedMode);
  const historySignalPattern = normalizeHistoryPattern(rawOutcome.historySignalPattern);
  const priorityScore = Number(rawOutcome.priorityScore);
  return {
    tenantId,
    conversationId,
    mailboxId: normalizeEmailAddress(rawOutcome.mailboxId) || null,
    customerEmail: customerEmail || null,
    outcomeCode,
    outcomeLabel: normalizeText(rawOutcome.outcomeLabel || rawOutcome.label) || null,
    recordedAt: toIso(rawOutcome.recordedAt) || nowIso(),
    actorUserId: normalizeText(rawOutcome.actorUserId) || null,
    source: normalizeText(rawOutcome.source) || 'cco_usage_event',
    selectedMode: selectedMode || null,
    recommendedMode: recommendedMode || null,
    priorityLevel: normalizePriorityLevel(rawOutcome.priorityLevel),
    priorityScore:
      Number.isFinite(priorityScore) && priorityScore >= 0
        ? Math.max(0, Math.min(100, Math.round(priorityScore)))
        : null,
    dominantRisk: normalizeDecisionRisk(rawOutcome.dominantRisk),
    recommendedAction: normalizeCompactText(rawOutcome.recommendedAction, 240),
    riskStackExplanation: normalizeCompactText(rawOutcome.riskStackExplanation, 240),
    historySignalPattern: historySignalPattern === 'none' ? null : historySignalPattern,
    historySignalSummary: normalizeCompactText(rawOutcome.historySignalSummary, 240),
    intent: normalizeCompactText(rawOutcome.intent, 80),
  };
}

function normalizeHistoryActionType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'handled' || normalized === 'cco.reply.handled') return 'handled';
  if (normalized === 'reply_sent' || normalized === 'cco.reply.sent') return 'reply_sent';
  if (normalized === 'reply_later' || normalized === 'cco.reply.later') return 'reply_later';
  if (normalized === 'customer_replied' || normalized === 'cco.customer.replied') {
    return 'customer_replied';
  }
  if (normalized === 'conversation_deleted' || normalized === 'cco.conversation.deleted') {
    return 'conversation_deleted';
  }
  return '';
}

function normalizeHistoryResultType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'message' || normalized === 'mail' || normalized === 'email') return 'message';
  if (normalized === 'outcome' || normalized === 'utfall') return 'outcome';
  if (normalized === 'action' || normalized === 'activity' || normalized === 'event') return 'action';
  return '';
}

function normalizeHistoryAction(rawAction = {}) {
  const tenantId = normalizeText(rawAction.tenantId);
  const conversationId = normalizeText(rawAction.conversationId);
  const actionType = normalizeHistoryActionType(
    rawAction.actionType || rawAction.eventType || rawAction.action
  );
  if (!tenantId || !conversationId || !actionType) return null;
  const customerEmail = normalizeEmailAddress(rawAction.customerEmail);
  const selectedMode = normalizeDraftMode(rawAction.selectedMode);
  const recommendedMode = normalizeDraftMode(rawAction.recommendedMode);
  const historySignalPattern = normalizeHistoryPattern(rawAction.historySignalPattern);
  const priorityScore = Number(rawAction.priorityScore);
  return {
    tenantId,
    conversationId,
    canonicalConversationKey: normalizeText(rawAction.canonicalConversationKey) || null,
    mailboxId: normalizeEmailAddress(rawAction.mailboxId || rawAction.mailboxAddress) || null,
    customerEmail: customerEmail || null,
    messageId: normalizeText(rawAction.messageId) || null,
    actionType,
    actionLabel: normalizeCompactText(rawAction.actionLabel, 80),
    subject: normalizeCompactText(rawAction.subject, 200),
    recordedAt: toIso(rawAction.recordedAt || rawAction.timestamp) || nowIso(),
    actorUserId: normalizeText(rawAction.actorUserId) || null,
    actorEmail: normalizeEmailAddress(rawAction.actorEmail) || null,
    source: normalizeText(rawAction.source) || 'cco_usage_event',
    version: Math.max(1, Number.parseInt(String(rawAction.version ?? '1'), 10) || 1),
    selectedMode: selectedMode || null,
    recommendedMode: recommendedMode || null,
    priorityLevel: normalizePriorityLevel(rawAction.priorityLevel),
    priorityScore:
      Number.isFinite(priorityScore) && priorityScore >= 0
        ? Math.max(0, Math.min(100, Math.round(priorityScore)))
        : null,
    dominantRisk: normalizeDecisionRisk(rawAction.dominantRisk),
    recommendedAction: normalizeCompactText(rawAction.recommendedAction, 240),
    riskStackExplanation: normalizeCompactText(rawAction.riskStackExplanation, 240),
    historySignalPattern: historySignalPattern === 'none' ? null : historySignalPattern,
    historySignalSummary: normalizeCompactText(rawAction.historySignalSummary, 240),
    waitingOn: normalizeCompactText(rawAction.waitingOn, 40),
    nextActionLabel: normalizeCompactText(rawAction.nextActionLabel, 120),
    nextActionSummary: normalizeCompactText(rawAction.nextActionSummary, 240),
    followUpDueAt: toIso(rawAction.followUpDueAt),
    intent: normalizeCompactText(rawAction.intent, 80),
  };
}

function normalizeCoverageWindow(rawWindow = {}) {
  const startIso = toIso(rawWindow.startIso);
  const endIso = toIso(rawWindow.endIso);
  if (!startIso || !endIso) return null;
  if (Date.parse(endIso) <= Date.parse(startIso)) return null;
  return {
    startIso,
    endIso,
    syncedAt: toIso(rawWindow.syncedAt) || nowIso(),
    messageCount: Math.max(0, Number.parseInt(String(rawWindow.messageCount ?? '0'), 10) || 0),
  };
}

function mergeCoverageWindows(rawWindows = []) {
  const normalized = rawWindows
    .map((item) => normalizeCoverageWindow(item))
    .filter(Boolean)
    .sort((left, right) => compareIsoAsc(left.startIso, right.startIso));
  if (normalized.length === 0) return [];

  const merged = [];
  for (const window of normalized) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...window });
      continue;
    }
    const overlapsOrTouches = Date.parse(window.startIso) <= Date.parse(last.endIso);
    if (!overlapsOrTouches) {
      merged.push({ ...window });
      continue;
    }
    if (Date.parse(window.endIso) > Date.parse(last.endIso)) {
      last.endIso = window.endIso;
    }
    if (Date.parse(window.syncedAt) > Date.parse(last.syncedAt)) {
      last.syncedAt = window.syncedAt;
    }
    last.messageCount += Number(window.messageCount || 0);
  }
  return merged;
}

function normalizeMailboxState(rawMailbox = {}, key = '') {
  const tenantId = normalizeText(rawMailbox.tenantId) || normalizeText(key.split(':')[0]);
  const mailboxId = normalizeMailboxId(rawMailbox.mailboxId || key.split(':').slice(1).join(':'));
  if (!tenantId || !mailboxId) return null;
  const coverageWindows = mergeCoverageWindows(rawMailbox.coverageWindows);
  const coverageStartIso = coverageWindows[0]?.startIso || null;
  const coverageEndIso = coverageWindows[coverageWindows.length - 1]?.endIso || null;
  return {
    tenantId,
    mailboxId,
    createdAt: toIso(rawMailbox.createdAt) || nowIso(),
    updatedAt: toIso(rawMailbox.updatedAt) || nowIso(),
    lastBackfillAt: toIso(rawMailbox.lastBackfillAt) || null,
    lastBackfillSource: normalizeText(rawMailbox.lastBackfillSource) || null,
    coverageWindows,
    coverageStartIso,
    coverageEndIso,
    messageCount: Math.max(0, Number.parseInt(String(rawMailbox.messageCount ?? '0'), 10) || 0),
  };
}

function normalizeState(rawState) {
  const existing = rawState && typeof rawState === 'object' ? rawState : {};
  const mailboxes = {};
  for (const [key, value] of Object.entries(existing.mailboxes || {})) {
    const mailbox = normalizeMailboxState(value, key);
    if (!mailbox) continue;
    mailboxes[toMailboxKey(mailbox.tenantId, mailbox.mailboxId)] = mailbox;
  }
  const messages = asArray(existing.messages)
    .map((item) => normalizeHistoryMessage(item))
    .filter(Boolean)
    .sort((left, right) => {
      const sentAtComparison = compareIsoAsc(left.sentAt, right.sentAt);
      if (sentAtComparison !== 0) return sentAtComparison;
      return String(left.messageId).localeCompare(String(right.messageId));
    });
  const outcomes = asArray(existing.outcomes)
    .map((item) => normalizeHistoryOutcome(item))
    .filter(Boolean)
    .sort((left, right) => {
      const byRecordedAt = compareIsoAsc(left.recordedAt, right.recordedAt);
      if (byRecordedAt !== 0) return byRecordedAt;
      const byConversationId = String(left.conversationId).localeCompare(String(right.conversationId));
      if (byConversationId !== 0) return byConversationId;
      return String(left.outcomeCode).localeCompare(String(right.outcomeCode));
    });
  const actions = asArray(existing.actions)
    .map((item) => normalizeHistoryAction(item))
    .filter(Boolean)
    .sort((left, right) => {
      const byRecordedAt = compareIsoAsc(left.recordedAt, right.recordedAt);
      if (byRecordedAt !== 0) return byRecordedAt;
      const byConversationId = String(left.conversationId).localeCompare(String(right.conversationId));
      if (byConversationId !== 0) return byConversationId;
      return String(left.actionType).localeCompare(String(right.actionType));
    });
  return {
    version: 2,
    createdAt: toIso(existing.createdAt) || nowIso(),
    updatedAt: toIso(existing.updatedAt) || nowIso(),
    mailboxes,
    messages,
    outcomes,
    actions,
  };
}

function createOutcomeDecisionStat(key = '', label = '') {
  return {
    key,
    label: label || key,
    totalCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    neutralCount: 0,
    lastRecordedAt: null,
  };
}

function updateOutcomeDecisionStat(index, key, label, bucket, recordedAt) {
  const safeKey = normalizeText(key);
  if (!safeKey) return;
  const safeBucket = bucket === 'positive' || bucket === 'negative' ? bucket : 'neutral';
  const current = index[safeKey] || createOutcomeDecisionStat(safeKey, label);
  current.label = current.label || label || safeKey;
  current.totalCount += 1;
  current[`${safeBucket}Count`] += 1;
  if (
    recordedAt &&
    (!current.lastRecordedAt || Date.parse(recordedAt) >= Date.parse(current.lastRecordedAt))
  ) {
    current.lastRecordedAt = recordedAt;
  }
  index[safeKey] = current;
}

function toSortedDecisionSummary(index = {}) {
  return Object.values(index)
    .sort((left, right) => {
      if (right.positiveCount !== left.positiveCount) {
        return right.positiveCount - left.positiveCount;
      }
      if (right.totalCount !== left.totalCount) {
        return right.totalCount - left.totalCount;
      }
      const byRecordedAt = compareIsoDesc(left.lastRecordedAt, right.lastRecordedAt);
      if (byRecordedAt !== 0) return byRecordedAt;
      return String(left.label).localeCompare(String(right.label));
    })
    .slice(0, 8);
}

function pickTopDecisionSummaryByBucket(index = {}, bucket = 'positive') {
  const bucketField =
    bucket === 'negative' ? 'negativeCount' : bucket === 'neutral' ? 'neutralCount' : 'positiveCount';
  return Object.values(index).sort((left, right) => {
    if ((right[bucketField] || 0) !== (left[bucketField] || 0)) {
      return (right[bucketField] || 0) - (left[bucketField] || 0);
    }
    if ((right.totalCount || 0) !== (left.totalCount || 0)) {
      return (right.totalCount || 0) - (left.totalCount || 0);
    }
    const byRecordedAt = compareIsoDesc(left.lastRecordedAt, right.lastRecordedAt);
    if (byRecordedAt !== 0) return byRecordedAt;
    return String(left.label || '').localeCompare(String(right.label || ''));
  })[0] || null;
}

function buildOutcomeCountSummary(outcomes = []) {
  const summary = {
    booked: 0,
    rebooked: 0,
    replied: 0,
    not_interested: 0,
    escalated: 0,
    no_response: 0,
    closed_no_action: 0,
  };
  for (const outcome of outcomes) {
    const code = normalizeOutcomeCode(outcome?.outcomeCode);
    if (!code) continue;
    summary[code] = (summary[code] || 0) + 1;
  }
  return summary;
}

function buildDecisionBreakdownByIntent(indexByIntent = {}) {
  return Object.entries(indexByIntent)
    .map(([intentKey, index]) => {
      const summary = toSortedDecisionSummary(index).slice(0, 6);
      const bestCandidate = pickTopDecisionSummaryByBucket(index, 'positive');
      const worstNegativeCandidate = pickTopDecisionSummaryByBucket(index, 'negative');
      const worstNeutralCandidate = pickTopDecisionSummaryByBucket(index, 'neutral');
      const best =
        bestCandidate && Number(bestCandidate.positiveCount || 0) > 0 ? bestCandidate : null;
      const worst =
        worstNegativeCandidate && Number(worstNegativeCandidate.negativeCount || 0) > 0
          ? worstNegativeCandidate
          : worstNeutralCandidate && Number(worstNeutralCandidate.neutralCount || 0) > 0
            ? worstNeutralCandidate
            : null;
      const totalCount = summary.reduce(
        (sum, item) => sum + Number(item?.totalCount || 0),
        0
      );
      return {
        intent: intentKey,
        label: intentKey,
        totalCount,
        best,
        worst,
        summary,
      };
    })
    .sort((left, right) => {
      const positiveDelta =
        Number(right?.best?.positiveCount || 0) - Number(left?.best?.positiveCount || 0);
      if (positiveDelta !== 0) return positiveDelta;
      const totalDelta = Number(right?.totalCount || 0) - Number(left?.totalCount || 0);
      if (totalDelta !== 0) return totalDelta;
      return String(left?.label || '').localeCompare(String(right?.label || ''));
    })
    .slice(0, 10);
}

function buildMailboxComparisonSummary(mailboxIndex = {}) {
  return Object.values(mailboxIndex)
    .map((entry) => {
      const preferredAction = pickTopDecisionSummaryByBucket(entry.actionIndex, 'positive');
      const preferredMode = pickTopDecisionSummaryByBucket(entry.modeIndex, 'positive');
      const dominantFailureOutcome = pickDominantNegativeOutcome(entry.outcomeCounts);
      return {
        mailboxId: entry.mailboxId,
        label: entry.mailboxId,
        totalOutcomeCount: entry.totalOutcomeCount,
        positiveOutcomeCount: entry.positiveOutcomeCount,
        negativeOutcomeCount: entry.negativeOutcomeCount,
        neutralOutcomeCount: entry.neutralOutcomeCount,
        preferredAction:
          preferredAction && Number(preferredAction.positiveCount || 0) > 0
            ? preferredAction.label
            : null,
        preferredMode:
          preferredMode && Number(preferredMode.positiveCount || 0) > 0
            ? preferredMode.key
            : null,
        dominantFailureOutcome: dominantFailureOutcome.code || null,
        dominantFailureOutcomeCount: dominantFailureOutcome.count || 0,
      };
    })
    .sort((left, right) => {
      if (Number(right?.positiveOutcomeCount || 0) !== Number(left?.positiveOutcomeCount || 0)) {
        return Number(right?.positiveOutcomeCount || 0) - Number(left?.positiveOutcomeCount || 0);
      }
      if (Number(right?.totalOutcomeCount || 0) !== Number(left?.totalOutcomeCount || 0)) {
        return Number(right?.totalOutcomeCount || 0) - Number(left?.totalOutcomeCount || 0);
      }
      return String(left?.label || '').localeCompare(String(right?.label || ''));
    });
}

function buildFailurePatternSummary({ outcomeCounts = {}, riskSummary = [], patternSummary = [] } = {}) {
  const items = [];
  for (const [code, count] of Object.entries(outcomeCounts || {})) {
    if (!NEGATIVE_OUTCOME_CODES.has(normalizeOutcomeCode(code)) || Number(count || 0) <= 0) continue;
    items.push({
      type: 'outcome',
      key: code,
      label: code,
      count: Number(count || 0),
    });
  }
  for (const risk of asArray(riskSummary)) {
    if (Number(risk?.negativeCount || 0) <= 0) continue;
    items.push({
      type: 'risk',
      key: normalizeText(risk?.key).toLowerCase(),
      label: normalizeText(risk?.label) || normalizeText(risk?.key),
      count: Number(risk?.negativeCount || 0),
    });
  }
  for (const pattern of asArray(patternSummary)) {
    if (Number(pattern?.negativeCount || 0) <= 0) continue;
    items.push({
      type: 'history_pattern',
      key: normalizeText(pattern?.key).toLowerCase(),
      label: normalizeText(pattern?.label) || normalizeText(pattern?.key),
      count: Number(pattern?.negativeCount || 0),
    });
  }
  return items
    .sort((left, right) => {
      if (Number(right?.count || 0) !== Number(left?.count || 0)) {
        return Number(right?.count || 0) - Number(left?.count || 0);
      }
      return String(left?.label || '').localeCompare(String(right?.label || ''));
    })
    .slice(0, 8);
}

function pickDominantNegativeOutcome(outcomeCounts = {}) {
  const negativeCodes = ['no_response', 'escalated'];
  let winningCode = null;
  let winningCount = 0;
  for (const code of negativeCodes) {
    const count = Math.max(0, Number(outcomeCounts?.[code]) || 0);
    if (count > winningCount) {
      winningCode = code;
      winningCount = count;
    }
  }
  return {
    code: winningCode,
    count: winningCount,
  };
}

function buildHistoryMessageDedupKey(message = {}) {
  const internetMessageId = normalizeText(message.internetMessageId).toLowerCase();
  if (internetMessageId) return `internet:${internetMessageId}`;
  const direction = normalizeDirection(message.direction);
  const sentAt = toIso(message.sentAt) || '';
  const subject = normalizeSubjectForSearch(message.subject);
  const counterpartyEmail = normalizeEmailAddress(
    message.counterpartyEmail ||
      message.customerEmail ||
      message.senderEmail ||
      asArray(message.recipients)[0] ||
      asArray(message.replyToRecipients)[0]
  );
  const bodyPreview = normalizeText(message.bodyPreview).slice(0, 120).toLowerCase();
  return `fallback:${direction}:${sentAt}:${subject}:${counterpartyEmail}:${bodyPreview}`;
}

function matchesHistoryCustomerEmail(targetEmail = '', candidates = []) {
  const filterAliases = toEmailAliasSet([targetEmail]);
  if (filterAliases.size === 0) return false;
  const candidateAliases = toEmailAliasSet(candidates);
  for (const alias of candidateAliases) {
    if (filterAliases.has(alias)) return true;
  }
  return false;
}

function matchesHistoryQueryText(values = [], queryText = '') {
  const normalizedQuery = normalizeText(queryText).toLowerCase();
  if (!normalizedQuery) return true;
  return asArray(values)
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean)
    .some((value) => value.includes(normalizedQuery));
}

function toSafeMailboxSummary(mailbox = null) {
  if (!mailbox) return null;
  return {
    tenantId: mailbox.tenantId,
    mailboxId: mailbox.mailboxId,
    createdAt: mailbox.createdAt,
    updatedAt: mailbox.updatedAt,
    lastBackfillAt: mailbox.lastBackfillAt,
    lastBackfillSource: mailbox.lastBackfillSource,
    coverageStartIso: mailbox.coverageStartIso,
    coverageEndIso: mailbox.coverageEndIso,
    coverageWindowCount: mailbox.coverageWindows.length,
    coverageWindows: mailbox.coverageWindows.map((item) => ({
      startIso: item.startIso,
      endIso: item.endIso,
      syncedAt: item.syncedAt,
      messageCount: item.messageCount,
    })),
    messageCount: mailbox.messageCount,
  };
}

function computeMissingWindows(coverageWindows = [], { startIso, endIso }) {
  const safeStartIso = toIso(startIso);
  const safeEndIso = toIso(endIso);
  if (!safeStartIso || !safeEndIso) return [];
  if (Date.parse(safeEndIso) <= Date.parse(safeStartIso)) return [];

  const missing = [];
  let cursorMs = Date.parse(safeStartIso);
  const endMs = Date.parse(safeEndIso);
  const sortedWindows = mergeCoverageWindows(coverageWindows);

  for (const window of sortedWindows) {
    const windowStartMs = Date.parse(window.startIso);
    const windowEndMs = Date.parse(window.endIso);
    if (!Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs)) continue;
    if (windowEndMs <= cursorMs) continue;
    if (windowStartMs >= endMs) break;
    if (windowStartMs > cursorMs) {
      missing.push({
        startIso: new Date(cursorMs).toISOString(),
        endIso: new Date(Math.min(windowStartMs, endMs)).toISOString(),
      });
    }
    cursorMs = Math.max(cursorMs, Math.min(windowEndMs, endMs));
    if (cursorMs >= endMs) break;
  }

  if (cursorMs < endMs) {
    missing.push({
      startIso: new Date(cursorMs).toISOString(),
      endIso: new Date(endMs).toISOString(),
    });
  }

  return missing.filter(
    (window) => Date.parse(window.endIso) > Date.parse(window.startIso)
  );
}

async function createCcoHistoryStore({
  filePath,
} = {}) {
  if (!filePath) throw new Error('ccoHistoryStore filePath saknas.');

  let state = emptyState();

  async function load() {
    const existing = await readJson(filePath, null);
    state = normalizeState(existing);
  }

  async function persist() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findMailbox(tenantId, mailboxId) {
    const key = toMailboxKey(tenantId, mailboxId);
    return state.mailboxes[key] || null;
  }

  function ensureMailbox(tenantId, mailboxId) {
    const key = toMailboxKey(tenantId, mailboxId);
    if (!key) return null;
    if (!state.mailboxes[key]) {
      state.mailboxes[key] = normalizeMailboxState({
        tenantId,
        mailboxId,
        coverageWindows: [],
        messageCount: 0,
      }, key);
    }
    return state.mailboxes[key];
  }

  function selectMailboxMessages(tenantId, mailboxId) {
    const safeTenantId = normalizeText(tenantId);
    const safeMailboxId = normalizeMailboxId(mailboxId);
    return state.messages.filter(
      (message) => message.tenantId === safeTenantId && message.mailboxId === safeMailboxId
    );
  }

  function selectCustomerOutcomes({
    tenantId,
    customerEmail,
    mailboxIds = [],
  } = {}) {
    const safeTenantId = normalizeText(tenantId);
    const safeCustomerEmail = normalizeMailboxId(customerEmail);
    const safeMailboxIds = new Set(asArray(mailboxIds).map((item) => normalizeMailboxId(item)).filter(Boolean));
    return state.outcomes.filter((outcome) => {
      if (outcome.tenantId !== safeTenantId) return false;
      if (safeCustomerEmail && outcome.customerEmail !== safeCustomerEmail) return false;
      if (safeMailboxIds.size > 0 && (!outcome.mailboxId || !safeMailboxIds.has(outcome.mailboxId))) {
        return false;
      }
      return true;
    });
  }

  function selectOutcomes({
    tenantId,
    customerEmail = null,
    mailboxIds = [],
  } = {}) {
    return selectCustomerOutcomes({
      tenantId,
      customerEmail,
      mailboxIds,
    });
  }

  function selectCustomerActions({
    tenantId,
    customerEmail,
    mailboxIds = [],
  } = {}) {
    const safeTenantId = normalizeText(tenantId);
    const safeCustomerEmail = normalizeEmailAddress(customerEmail);
    const safeMailboxIds = new Set(asArray(mailboxIds).map((item) => normalizeEmailAddress(item)).filter(Boolean));
    return state.actions.filter((action) => {
      if (action.tenantId !== safeTenantId) return false;
      if (safeCustomerEmail) {
        if (!matchesHistoryCustomerEmail(safeCustomerEmail, [action.customerEmail])) return false;
      }
      if (safeMailboxIds.size > 0 && (!action.mailboxId || !safeMailboxIds.has(action.mailboxId))) {
        return false;
      }
      return true;
    });
  }

  async function upsertMailboxWindow({
    tenantId,
    mailboxId,
    messages = [],
    windowStartIso,
    windowEndIso,
    source = 'graph_runtime_history',
  } = {}) {
    const mailbox = ensureMailbox(tenantId, mailboxId);
    if (!mailbox) {
      throw new Error('tenantId och mailboxId krävs för historikstore.');
    }

    const existingIndex = new Map();
    state.messages.forEach((message, index) => {
      const key = `${message.tenantId}:${message.mailboxId}:${message.messageId}`;
      existingIndex.set(key, index);
    });

    let insertedCount = 0;
    let updatedCount = 0;
    const safeWindowStartIso = toIso(windowStartIso);
    const safeWindowEndIso = toIso(windowEndIso);
    const seenWindowMessageIds = new Set();

    for (const rawMessage of asArray(messages)) {
      const normalizedMessage = normalizeHistoryMessage({
        ...rawMessage,
        tenantId: mailbox.tenantId,
        mailboxId: mailbox.mailboxId,
      });
      if (!normalizedMessage) continue;
      const compositeKey = `${normalizedMessage.tenantId}:${normalizedMessage.mailboxId}:${normalizedMessage.messageId}`;
      if (seenWindowMessageIds.has(compositeKey)) continue;
      seenWindowMessageIds.add(compositeKey);
      if (existingIndex.has(compositeKey)) {
        const existingMessage = state.messages[existingIndex.get(compositeKey)];
        state.messages[existingIndex.get(compositeKey)] = {
          ...existingMessage,
          ...normalizedMessage,
          firstSeenAt: existingMessage.firstSeenAt || normalizedMessage.firstSeenAt,
          lastSeenAt: nowIso(),
        };
        updatedCount += 1;
      } else {
        state.messages.push(normalizedMessage);
        existingIndex.set(compositeKey, state.messages.length - 1);
        insertedCount += 1;
      }
    }

    if (safeWindowStartIso && safeWindowEndIso) {
      mailbox.coverageWindows = mergeCoverageWindows([
        ...mailbox.coverageWindows,
        {
          startIso: safeWindowStartIso,
          endIso: safeWindowEndIso,
          syncedAt: nowIso(),
          messageCount: insertedCount + updatedCount,
        },
      ]);
    }
    mailbox.updatedAt = nowIso();
    mailbox.lastBackfillAt = mailbox.updatedAt;
    mailbox.lastBackfillSource = normalizeText(source) || 'graph_runtime_history';
    mailbox.coverageStartIso = mailbox.coverageWindows[0]?.startIso || null;
    mailbox.coverageEndIso = mailbox.coverageWindows[mailbox.coverageWindows.length - 1]?.endIso || null;
    mailbox.messageCount = selectMailboxMessages(mailbox.tenantId, mailbox.mailboxId).length;

    state.messages.sort((left, right) => {
      const bySentAt = compareIsoAsc(left.sentAt, right.sentAt);
      if (bySentAt !== 0) return bySentAt;
      return String(left.messageId).localeCompare(String(right.messageId));
    });

    await persist();
    return {
      insertedCount,
      updatedCount,
      mailbox: toSafeMailboxSummary(mailbox),
    };
  }

  async function listMailboxMessages({
    tenantId,
    mailboxId,
    sinceIso = null,
    untilIso = null,
  } = {}) {
    const safeSinceIso = toIso(sinceIso);
    const safeUntilIso = toIso(untilIso);
    return selectMailboxMessages(tenantId, mailboxId)
      .filter((message) => {
        const sentAtMs = toTimestampMs(message.sentAt);
        if (!Number.isFinite(sentAtMs)) return true;
        if (safeSinceIso && sentAtMs < Date.parse(safeSinceIso)) return false;
        if (safeUntilIso && sentAtMs >= Date.parse(safeUntilIso)) return false;
        return true;
      })
      .slice()
      .sort((left, right) => {
        const bySentAt = compareIsoDesc(left.sentAt, right.sentAt);
        if (bySentAt !== 0) return bySentAt;
        return String(left.messageId).localeCompare(String(right.messageId));
      });
  }

  async function listDerivedCustomerProfiles({ tenantId } = {}) {
    const safeTenantId = normalizeText(tenantId);
    if (!safeTenantId) return [];

    const profiles = new Map();
    for (const message of state.messages) {
      if (message.tenantId !== safeTenantId) continue;
      const customerEmail = normalizeEmailAddress(
        message.customerEmail ||
          message.counterpartyEmail ||
          message.senderEmail ||
          asArray(message.recipients)[0] ||
          asArray(message.replyToRecipients)[0]
      );
      if (!customerEmail) continue;

      if (!profiles.has(customerEmail)) {
        profiles.set(customerEmail, {
          customerEmail,
          emails: new Set([customerEmail]),
          mailboxes: new Set(),
          conversationIds: new Set(),
          totalMessages: 0,
          latestActivityAt: null,
          preferredName: '',
        });
      }

      const profile = profiles.get(customerEmail);
      profile.totalMessages += 1;
      profile.emails.add(customerEmail);

      const mailboxId = normalizeEmailAddress(
        message.mailboxId || message.mailboxAddress || message.userPrincipalName
      );
      if (mailboxId) profile.mailboxes.add(mailboxId);

      const conversationId = normalizeText(message.conversationId);
      if (conversationId) profile.conversationIds.add(conversationId);

      const sentAt = toIso(message.sentAt);
      if (sentAt && (!profile.latestActivityAt || sentAt > profile.latestActivityAt)) {
        profile.latestActivityAt = sentAt;
      }

      const preferredNameCandidate =
        normalizeDirection(message.direction) === 'inbound'
          ? normalizeText(message.senderName)
          : '';
      if (preferredNameCandidate && !preferredNameCandidate.includes('@')) {
        profile.preferredName = preferredNameCandidate;
      }
    }

    return Array.from(profiles.values())
      .map((profile) => ({
        customerEmail: profile.customerEmail,
        name: profile.preferredName || humanizeEmailAddress(profile.customerEmail) || profile.customerEmail,
        emails: Array.from(profile.emails).sort((left, right) => String(left).localeCompare(String(right))),
        mailboxes: Array.from(profile.mailboxes).sort((left, right) => String(left).localeCompare(String(right))),
        totalConversations: profile.conversationIds.size,
        totalMessages: profile.totalMessages,
        latestActivityAt: profile.latestActivityAt || null,
      }))
      .sort((left, right) => {
        const byLatest = compareIsoDesc(left.latestActivityAt, right.latestActivityAt);
        if (byLatest !== 0) return byLatest;
        return String(left.customerEmail).localeCompare(String(right.customerEmail));
      });
  }

  async function recordOutcome({
    tenantId,
    conversationId,
    mailboxId = null,
    customerEmail = null,
    outcomeCode,
    outcomeLabel = null,
    recordedAt = null,
    actorUserId = null,
    source = 'cco_usage_event',
    selectedMode = null,
    recommendedMode = null,
    priorityLevel = null,
    priorityScore = null,
    dominantRisk = null,
    recommendedAction = null,
    riskStackExplanation = null,
      historySignalPattern = null,
      historySignalSummary = null,
      intent = null,
  } = {}) {
    const normalizedOutcome = normalizeHistoryOutcome({
      tenantId,
      conversationId,
      mailboxId,
      customerEmail,
      outcomeCode,
      outcomeLabel,
      recordedAt,
      actorUserId,
      source,
      selectedMode,
      recommendedMode,
      priorityLevel,
      priorityScore,
      dominantRisk,
      recommendedAction,
      riskStackExplanation,
      historySignalPattern,
      historySignalSummary,
      intent,
    });
    if (!normalizedOutcome) {
      throw new Error('tenantId, conversationId och outcomeCode krävs för historikutfall.');
    }

    const existingIndex = state.outcomes.findIndex((item) => {
      const sameMailbox =
        normalizeMailboxId(item.mailboxId) === normalizeMailboxId(normalizedOutcome.mailboxId);
      return (
        item.tenantId === normalizedOutcome.tenantId &&
        item.conversationId === normalizedOutcome.conversationId &&
        item.outcomeCode === normalizedOutcome.outcomeCode &&
        sameMailbox
      );
    });

    if (existingIndex >= 0) {
      state.outcomes[existingIndex] = {
        ...state.outcomes[existingIndex],
        ...normalizedOutcome,
      };
    } else {
      state.outcomes.push(normalizedOutcome);
    }

    state.outcomes.sort((left, right) => {
      const byRecordedAt = compareIsoAsc(left.recordedAt, right.recordedAt);
      if (byRecordedAt !== 0) return byRecordedAt;
      const byConversationId = String(left.conversationId).localeCompare(String(right.conversationId));
      if (byConversationId !== 0) return byConversationId;
      return String(left.outcomeCode).localeCompare(String(right.outcomeCode));
    });

    await persist();
    return normalizedOutcome;
  }

  async function recordAction({
    tenantId,
    conversationId,
    mailboxId = null,
    customerEmail = null,
    actionType,
    actionLabel = null,
    subject = null,
    recordedAt = null,
    actorUserId = null,
    source = 'cco_usage_event',
    selectedMode = null,
    recommendedMode = null,
    priorityLevel = null,
    priorityScore = null,
    dominantRisk = null,
    recommendedAction = null,
    riskStackExplanation = null,
    historySignalPattern = null,
    historySignalSummary = null,
    waitingOn = null,
    nextActionLabel = null,
    nextActionSummary = null,
    followUpDueAt = null,
    intent = null,
  } = {}) {
    const normalizedAction = normalizeHistoryAction({
      tenantId,
      conversationId,
      mailboxId,
      customerEmail,
      actionType,
      actionLabel,
      subject,
      recordedAt,
      actorUserId,
      source,
      selectedMode,
      recommendedMode,
      priorityLevel,
      priorityScore,
      dominantRisk,
      recommendedAction,
      riskStackExplanation,
      historySignalPattern,
      historySignalSummary,
      waitingOn,
      nextActionLabel,
      nextActionSummary,
      followUpDueAt,
      intent,
    });
    if (!normalizedAction) {
      throw new Error('tenantId, conversationId och actionType krävs för historikåtgärd.');
    }

    const existingIndex = state.actions.findIndex((item) => {
      const sameMailbox =
        normalizeEmailAddress(item.mailboxId) === normalizeEmailAddress(normalizedAction.mailboxId);
      const sameTimestamp = normalizeText(item.recordedAt) === normalizeText(normalizedAction.recordedAt);
      return (
        item.tenantId === normalizedAction.tenantId &&
        item.conversationId === normalizedAction.conversationId &&
        item.actionType === normalizedAction.actionType &&
        sameMailbox &&
        sameTimestamp
      );
    });

    if (existingIndex >= 0) {
      state.actions[existingIndex] = {
        ...state.actions[existingIndex],
        ...normalizedAction,
      };
    } else {
      state.actions.push(normalizedAction);
    }

    state.actions.sort((left, right) => {
      const byRecordedAt = compareIsoAsc(left.recordedAt, right.recordedAt);
      if (byRecordedAt !== 0) return byRecordedAt;
      const byConversationId = String(left.conversationId).localeCompare(String(right.conversationId));
      if (byConversationId !== 0) return byConversationId;
      return String(left.actionType).localeCompare(String(right.actionType));
    });

    await persist();
    return normalizedAction;
  }

  async function listCustomerOutcomes({
    tenantId,
    customerEmail,
    mailboxIds = [],
    sinceIso = null,
    untilIso = null,
  } = {}) {
    const safeSinceIso = toIso(sinceIso);
    const safeUntilIso = toIso(untilIso);
    return selectCustomerOutcomes({
      tenantId,
      customerEmail,
      mailboxIds,
    })
      .filter((outcome) => {
        const recordedAtMs = toTimestampMs(outcome.recordedAt);
        if (!Number.isFinite(recordedAtMs)) return true;
        if (safeSinceIso && recordedAtMs < Date.parse(safeSinceIso)) return false;
        if (safeUntilIso && recordedAtMs >= Date.parse(safeUntilIso)) return false;
        return true;
      })
      .slice()
      .sort((left, right) => {
        const byRecordedAt = compareIsoDesc(left.recordedAt, right.recordedAt);
        if (byRecordedAt !== 0) return byRecordedAt;
        const byConversationId = String(left.conversationId).localeCompare(String(right.conversationId));
        if (byConversationId !== 0) return byConversationId;
        return String(left.outcomeCode).localeCompare(String(right.outcomeCode));
      });
  }

  async function listCustomerActions({
    tenantId,
    customerEmail,
    mailboxIds = [],
    sinceIso = null,
    untilIso = null,
  } = {}) {
    const safeSinceIso = toIso(sinceIso);
    const safeUntilIso = toIso(untilIso);
    return selectCustomerActions({
      tenantId,
      customerEmail,
      mailboxIds,
    })
      .filter((action) => {
        const recordedAtMs = toTimestampMs(action.recordedAt);
        if (!Number.isFinite(recordedAtMs)) return true;
        if (safeSinceIso && recordedAtMs < Date.parse(safeSinceIso)) return false;
        if (safeUntilIso && recordedAtMs >= Date.parse(safeUntilIso)) return false;
        return true;
      })
      .slice()
      .sort((left, right) => {
        const byRecordedAt = compareIsoDesc(left.recordedAt, right.recordedAt);
        if (byRecordedAt !== 0) return byRecordedAt;
        const byConversationId = String(left.conversationId).localeCompare(String(right.conversationId));
        if (byConversationId !== 0) return byConversationId;
        return String(left.actionType).localeCompare(String(right.actionType));
      });
  }

  async function listOutcomes({
    tenantId,
    mailboxIds = [],
    customerEmail = null,
    conversationId = null,
    conversationIds = [],
    sinceIso = null,
    untilIso = null,
    intent = null,
  } = {}) {
    const safeSinceIso = toIso(sinceIso);
    const safeUntilIso = toIso(untilIso);
    const safeConversationId = normalizeText(conversationId);
    const safeConversationIds = new Set(
      asArray(conversationIds).map((item) => normalizeText(item)).filter(Boolean)
    );
    const safeIntent = normalizeCompactText(intent, 80)?.toLowerCase() || null;
    return selectOutcomes({
      tenantId,
      customerEmail,
      mailboxIds,
    })
      .filter((outcome) => {
        const recordedAtMs = toTimestampMs(outcome.recordedAt);
        if (!Number.isFinite(recordedAtMs)) return true;
        if (safeSinceIso && recordedAtMs < Date.parse(safeSinceIso)) return false;
        if (safeUntilIso && recordedAtMs >= Date.parse(safeUntilIso)) return false;
        if (safeConversationId && normalizeText(outcome.conversationId) !== safeConversationId) {
          return false;
        }
        if (
          safeConversationIds.size > 0 &&
          !safeConversationIds.has(normalizeText(outcome.conversationId))
        ) {
          return false;
        }
        if (safeIntent && normalizeCompactText(outcome.intent, 80)?.toLowerCase() !== safeIntent) {
          return false;
        }
        return true;
      })
      .slice()
      .sort((left, right) => {
        const byRecordedAt = compareIsoDesc(left.recordedAt, right.recordedAt);
        if (byRecordedAt !== 0) return byRecordedAt;
        const byConversationId = String(left.conversationId).localeCompare(String(right.conversationId));
        if (byConversationId !== 0) return byConversationId;
        return String(left.outcomeCode).localeCompare(String(right.outcomeCode));
      });
  }

  async function listActions({
    tenantId,
    mailboxIds = [],
    customerEmail = null,
    conversationId = null,
    conversationIds = [],
    sinceIso = null,
    untilIso = null,
    intent = null,
  } = {}) {
    const safeSinceIso = toIso(sinceIso);
    const safeUntilIso = toIso(untilIso);
    const safeConversationId = normalizeText(conversationId);
    const safeConversationIds = new Set(
      asArray(conversationIds).map((item) => normalizeText(item)).filter(Boolean)
    );
    const safeIntent = normalizeCompactText(intent, 80)?.toLowerCase() || null;
    return selectCustomerActions({
      tenantId,
      customerEmail,
      mailboxIds,
    })
      .filter((action) => {
        const recordedAtMs = toTimestampMs(action.recordedAt);
        if (!Number.isFinite(recordedAtMs)) return true;
        if (safeSinceIso && recordedAtMs < Date.parse(safeSinceIso)) return false;
        if (safeUntilIso && recordedAtMs >= Date.parse(safeUntilIso)) return false;
        if (safeConversationId && normalizeText(action.conversationId) !== safeConversationId) {
          return false;
        }
        if (
          safeConversationIds.size > 0 &&
          !safeConversationIds.has(normalizeText(action.conversationId))
        ) {
          return false;
        }
        if (safeIntent && normalizeCompactText(action.intent, 80)?.toLowerCase() !== safeIntent) {
          return false;
        }
        return true;
      })
      .slice()
      .sort((left, right) => {
        const byRecordedAt = compareIsoDesc(left.recordedAt, right.recordedAt);
        if (byRecordedAt !== 0) return byRecordedAt;
        const byConversationId = String(left.conversationId).localeCompare(String(right.conversationId));
        if (byConversationId !== 0) return byConversationId;
        return String(left.actionType).localeCompare(String(right.actionType));
      });
  }

  async function summarizeOutcomeEvaluations({
    tenantId,
    customerEmail = null,
    mailboxIds = [],
    sinceIso = null,
    untilIso = null,
    intent = null,
  } = {}) {
    const safeSinceIso = toIso(sinceIso);
    const safeUntilIso = toIso(untilIso);
    const safeIntent = normalizeCompactText(intent, 80)?.toLowerCase() || null;
    const filteredOutcomes = selectOutcomes({
      tenantId,
      customerEmail,
      mailboxIds,
    }).filter((outcome) => {
      const recordedAtMs = toTimestampMs(outcome.recordedAt);
      if (!Number.isFinite(recordedAtMs)) return true;
      if (safeSinceIso && recordedAtMs < Date.parse(safeSinceIso)) return false;
      if (safeUntilIso && recordedAtMs >= Date.parse(safeUntilIso)) return false;
      if (safeIntent && normalizeCompactText(outcome.intent, 80)?.toLowerCase() !== safeIntent) {
        return false;
      }
      return true;
    });

    const modeIndex = {};
    const riskIndex = {};
    const priorityIndex = {};
    const actionIndex = {};
    const patternIndex = {};
    const intentIndex = {};
    const actionIndexByIntent = {};
    const modeIndexByIntent = {};
    const mailboxIndex = {};
    const mailboxSet = new Set();

    let latestRecordedAt = null;
    let latestOutcomeCode = null;
    let latestOutcomeLabel = null;
    let positiveOutcomeCount = 0;
    let negativeOutcomeCount = 0;
    let neutralOutcomeCount = 0;

    for (const outcome of filteredOutcomes) {
      const recordedAt = toIso(outcome?.recordedAt);
      const bucket = classifyOutcomeBucket(outcome?.outcomeCode);
      if (bucket === 'positive') positiveOutcomeCount += 1;
      else if (bucket === 'negative') negativeOutcomeCount += 1;
      else neutralOutcomeCount += 1;

      if (
        recordedAt &&
        (!latestRecordedAt || Date.parse(recordedAt) >= Date.parse(latestRecordedAt))
      ) {
        latestRecordedAt = recordedAt;
        latestOutcomeCode = normalizeOutcomeCode(outcome?.outcomeCode) || null;
        latestOutcomeLabel = normalizeText(outcome?.outcomeLabel) || null;
      }

      const effectiveMode = normalizeDraftMode(outcome?.selectedMode || outcome?.recommendedMode);
      if (effectiveMode) {
        updateOutcomeDecisionStat(modeIndex, effectiveMode, effectiveMode, bucket, recordedAt);
      }
      if (outcome?.dominantRisk) {
        updateOutcomeDecisionStat(
          riskIndex,
          outcome.dominantRisk,
          outcome.dominantRisk,
          bucket,
          recordedAt
        );
      }
      if (outcome?.priorityLevel) {
        updateOutcomeDecisionStat(
          priorityIndex,
          outcome.priorityLevel,
          outcome.priorityLevel,
          bucket,
          recordedAt
        );
      }
      if (outcome?.recommendedAction) {
        const actionKey = normalizeText(outcome.recommendedAction).toLowerCase();
        updateOutcomeDecisionStat(
          actionIndex,
          actionKey,
          outcome.recommendedAction,
          bucket,
          recordedAt
        );
      }
      const intentKey =
        normalizeCompactText(outcome?.intent, 80)?.toLowerCase() || 'okänd intent';
      if (effectiveMode) {
        const bucketIndex = modeIndexByIntent[intentKey] || {};
        updateOutcomeDecisionStat(bucketIndex, effectiveMode, effectiveMode, bucket, recordedAt);
        modeIndexByIntent[intentKey] = bucketIndex;
      }
      if (outcome?.recommendedAction) {
        const bucketIndex = actionIndexByIntent[intentKey] || {};
        updateOutcomeDecisionStat(
          bucketIndex,
          normalizeText(outcome.recommendedAction).toLowerCase(),
          outcome.recommendedAction,
          bucket,
          recordedAt
        );
        actionIndexByIntent[intentKey] = bucketIndex;
      }
      if (outcome?.historySignalPattern) {
        updateOutcomeDecisionStat(
          patternIndex,
          outcome.historySignalPattern,
          outcome.historySignalPattern,
          bucket,
          recordedAt
        );
      }
      if (outcome?.intent) {
        updateOutcomeDecisionStat(intentIndex, outcome.intent, outcome.intent, bucket, recordedAt);
      }
      if (outcome?.mailboxId) {
        mailboxSet.add(outcome.mailboxId);
        const mailboxKey = normalizeEmailAddress(outcome.mailboxId);
        const mailboxEntry =
          mailboxIndex[mailboxKey] ||
          {
            mailboxId: mailboxKey,
            totalOutcomeCount: 0,
            positiveOutcomeCount: 0,
            negativeOutcomeCount: 0,
            neutralOutcomeCount: 0,
            actionIndex: {},
            modeIndex: {},
            outcomeCounts: buildOutcomeCountSummary([]),
          };
        mailboxEntry.totalOutcomeCount += 1;
        if (bucket === 'positive') mailboxEntry.positiveOutcomeCount += 1;
        else if (bucket === 'negative') mailboxEntry.negativeOutcomeCount += 1;
        else mailboxEntry.neutralOutcomeCount += 1;
        const normalizedOutcomeCode = normalizeOutcomeCode(outcome?.outcomeCode);
        if (normalizedOutcomeCode) {
          mailboxEntry.outcomeCounts[normalizedOutcomeCode] =
            (mailboxEntry.outcomeCounts[normalizedOutcomeCode] || 0) + 1;
        }
        if (effectiveMode) {
          updateOutcomeDecisionStat(
            mailboxEntry.modeIndex,
            effectiveMode,
            effectiveMode,
            bucket,
            recordedAt
          );
        }
        if (outcome?.recommendedAction) {
          updateOutcomeDecisionStat(
            mailboxEntry.actionIndex,
            normalizeText(outcome.recommendedAction).toLowerCase(),
            outcome.recommendedAction,
            bucket,
            recordedAt
          );
        }
        mailboxIndex[mailboxKey] = mailboxEntry;
      }
    }

    const modeSummary = toSortedDecisionSummary(modeIndex);
    const riskSummary = toSortedDecisionSummary(riskIndex);
    const prioritySummary = toSortedDecisionSummary(priorityIndex);
    const actionSummary = toSortedDecisionSummary(actionIndex);
    const patternSummary = toSortedDecisionSummary(patternIndex);
    const intentSummary = toSortedDecisionSummary(intentIndex);
    const actionSummaryByIntent = buildDecisionBreakdownByIntent(actionIndexByIntent);
    const modeSummaryByIntent = buildDecisionBreakdownByIntent(modeIndexByIntent);
    const outcomeCounts = buildOutcomeCountSummary(filteredOutcomes);
    const mailboxComparisonSummary = buildMailboxComparisonSummary(mailboxIndex);
    const failurePatternSummary = buildFailurePatternSummary({
      outcomeCounts,
      riskSummary,
      patternSummary,
    });
    const dominantNegativeOutcome = pickDominantNegativeOutcome(outcomeCounts);
    const preferredModeCandidate = pickTopDecisionSummaryByBucket(modeIndex, 'positive');
    const preferredActionCandidate = pickTopDecisionSummaryByBucket(actionIndex, 'positive');
    const dominantFailureRiskCandidate = pickTopDecisionSummaryByBucket(riskIndex, 'negative');
    const preferredMode =
      preferredModeCandidate && preferredModeCandidate.positiveCount > 0
        ? preferredModeCandidate
        : null;
    const preferredAction =
      preferredActionCandidate && preferredActionCandidate.positiveCount > 0
        ? preferredActionCandidate
        : null;
    const dominantFailureRisk =
      dominantFailureRiskCandidate && dominantFailureRiskCandidate.negativeCount > 0
        ? dominantFailureRiskCandidate
        : null;

    return {
      customerEmail: normalizeMailboxId(customerEmail) || null,
      mailboxIds: Array.from(mailboxSet).sort((left, right) => String(left).localeCompare(String(right))),
      totalOutcomeCount: filteredOutcomes.length,
      positiveOutcomeCount,
      negativeOutcomeCount,
      neutralOutcomeCount,
      latestRecordedAt,
      latestOutcomeCode,
      latestOutcomeLabel,
      intent: safeIntent,
      outcomeCounts,
      preferredMode: preferredMode?.key || null,
      preferredModePositiveCount: preferredMode?.positiveCount || 0,
      preferredAction: preferredAction?.label || null,
      preferredActionPositiveCount: preferredAction?.positiveCount || 0,
      dominantFailureOutcome: dominantNegativeOutcome.code || null,
      dominantFailureOutcomeCount: dominantNegativeOutcome.count || 0,
      dominantFailureRisk: dominantFailureRisk?.key || null,
      dominantFailureRiskNegativeCount: dominantFailureRisk?.negativeCount || 0,
      modeSummary,
      riskSummary,
      prioritySummary,
      actionSummary,
      patternSummary,
      intentSummary,
      actionSummaryByIntent,
      modeSummaryByIntent,
      mailboxComparisonSummary,
      failurePatternSummary,
    };
  }

  async function searchHistoryRecords({
    tenantId,
    mailboxIds = [],
    customerEmail = null,
    conversationId = null,
    queryText = '',
    sinceIso = null,
    untilIso = null,
    limit = 50,
    includeMessages = true,
    includeOutcomes = true,
    includeActions = true,
    intent = null,
    resultTypes = [],
    actionTypes = [],
    outcomeCodes = [],
  } = {}) {
    const safeTenantId = normalizeText(tenantId);
    const safeConversationId = normalizeText(conversationId);
    const safeSinceIso = toIso(sinceIso);
    const safeUntilIso = toIso(untilIso);
    const safeCustomerEmail = normalizeEmailAddress(customerEmail);
    const safeMailboxIds = new Set(asArray(mailboxIds).map((item) => normalizeEmailAddress(item)).filter(Boolean));
    const safeLimit = Math.max(1, Math.min(250, Number.parseInt(String(limit || '50'), 10) || 50));
    const safeIntent = normalizeCompactText(intent, 80)?.toLowerCase() || null;
    const safeResultTypes = new Set(
      asArray(resultTypes).map((item) => normalizeHistoryResultType(item)).filter(Boolean)
    );
    const safeActionTypes = new Set(
      asArray(actionTypes).map((item) => normalizeHistoryActionType(item)).filter(Boolean)
    );
    const safeOutcomeCodes = new Set(
      asArray(outcomeCodes).map((item) => normalizeOutcomeCode(item)).filter(Boolean)
    );
    const results = [];
    const seenMessageFingerprints = new Set();

    const withinWindow = (isoValue) => {
      const valueMs = toTimestampMs(isoValue);
      if (!Number.isFinite(valueMs)) return true;
      if (safeSinceIso && valueMs < Date.parse(safeSinceIso)) return false;
      if (safeUntilIso && valueMs >= Date.parse(safeUntilIso)) return false;
      return true;
    };

    const mailboxMatches = (value) => {
      const mailboxId = normalizeEmailAddress(value);
      if (safeMailboxIds.size === 0) return true;
      return mailboxId ? safeMailboxIds.has(mailboxId) : false;
    };

    if (includeMessages && (safeResultTypes.size === 0 || safeResultTypes.has('message'))) {
      for (const message of state.messages) {
        if (message.tenantId !== safeTenantId) continue;
        if (!mailboxMatches(message.mailboxId || message.mailboxAddress || message.userPrincipalName)) continue;
        if (safeConversationId && normalizeText(message.conversationId) !== safeConversationId) continue;
        if (
          safeCustomerEmail &&
          !matchesHistoryCustomerEmail(safeCustomerEmail, [
            message.customerEmail,
            message.counterpartyEmail,
            message.senderEmail,
            ...asArray(message.recipients),
            ...asArray(message.replyToRecipients),
          ])
        ) {
          continue;
        }
        if (!withinWindow(message.sentAt)) continue;
        if (
          !matchesHistoryQueryText(
            [
              message.subject,
              message.bodyPreview,
              message.customerEmail,
              message.counterpartyEmail,
              message.senderEmail,
              ...(asArray(message.recipients)),
              ...(asArray(message.replyToRecipients)),
              message.conversationId,
            ],
            queryText
          )
        ) {
          continue;
        }

        const dedupKey = buildHistoryMessageDedupKey(message);
        if (seenMessageFingerprints.has(dedupKey)) continue;
        seenMessageFingerprints.add(dedupKey);
        results.push({
          resultType: 'message',
          recordedAt: message.sentAt,
          mailboxId: message.mailboxId || message.mailboxAddress || null,
          conversationId: message.conversationId,
          customerEmail: message.customerEmail || message.counterpartyEmail || null,
          subject: message.subject,
          title: message.direction === 'outbound' ? 'E-post skickat' : 'E-post mottaget',
          summary: message.subject,
          detail: message.bodyPreview,
          direction: message.direction,
          messageId: message.messageId,
        });
      }
    }

    if (includeOutcomes && (safeResultTypes.size === 0 || safeResultTypes.has('outcome'))) {
      for (const outcome of state.outcomes) {
        if (outcome.tenantId !== safeTenantId) continue;
        if (!mailboxMatches(outcome.mailboxId)) continue;
        if (safeConversationId && normalizeText(outcome.conversationId) !== safeConversationId) continue;
        if (safeCustomerEmail && !matchesHistoryCustomerEmail(safeCustomerEmail, [outcome.customerEmail])) {
          continue;
        }
        if (!withinWindow(outcome.recordedAt)) continue;
        if (safeIntent && normalizeCompactText(outcome.intent, 80)?.toLowerCase() !== safeIntent) {
          continue;
        }
        if (safeOutcomeCodes.size > 0 && !safeOutcomeCodes.has(normalizeOutcomeCode(outcome.outcomeCode))) {
          continue;
        }
        if (
          !matchesHistoryQueryText(
            [
              outcome.outcomeLabel,
              outcome.outcomeCode,
              outcome.recommendedAction,
              outcome.riskStackExplanation,
              outcome.historySignalSummary,
              outcome.intent,
              outcome.conversationId,
            ],
            queryText
          )
        ) {
          continue;
        }
        results.push({
          resultType: 'outcome',
          recordedAt: outcome.recordedAt,
          mailboxId: outcome.mailboxId,
          conversationId: outcome.conversationId,
          customerEmail: outcome.customerEmail,
          subject: null,
          title: outcome.outcomeLabel || outcome.outcomeCode,
          summary: outcome.recommendedAction || outcome.historySignalSummary || outcome.outcomeCode,
          detail: outcome.riskStackExplanation || outcome.historySignalSummary || null,
          outcomeCode: outcome.outcomeCode,
          intent: outcome.intent || null,
          selectedMode: outcome.selectedMode || null,
          recommendedMode: outcome.recommendedMode || null,
          recommendedAction: outcome.recommendedAction || null,
          dominantRisk: outcome.dominantRisk || null,
        });
      }
    }

    if (includeActions && (safeResultTypes.size === 0 || safeResultTypes.has('action'))) {
      for (const action of state.actions) {
        if (action.tenantId !== safeTenantId) continue;
        if (!mailboxMatches(action.mailboxId)) continue;
        if (safeConversationId && normalizeText(action.conversationId) !== safeConversationId) continue;
        if (safeCustomerEmail && !matchesHistoryCustomerEmail(safeCustomerEmail, [action.customerEmail])) {
          continue;
        }
        if (!withinWindow(action.recordedAt)) continue;
        if (safeIntent && normalizeCompactText(action.intent, 80)?.toLowerCase() !== safeIntent) {
          continue;
        }
        if (safeActionTypes.size > 0 && !safeActionTypes.has(normalizeHistoryActionType(action.actionType))) {
          continue;
        }
        if (
          !matchesHistoryQueryText(
            [
              action.actionType,
              action.actionLabel,
              action.subject,
              action.recommendedAction,
              action.nextActionLabel,
              action.nextActionSummary,
              action.historySignalSummary,
              action.intent,
              action.conversationId,
            ],
            queryText
          )
        ) {
          continue;
        }
        results.push({
          resultType: 'action',
          recordedAt: action.recordedAt,
          mailboxId: action.mailboxId,
          conversationId: action.conversationId,
          customerEmail: action.customerEmail,
          subject: action.subject,
          title: action.actionLabel || action.actionType,
          summary: action.nextActionSummary || action.recommendedAction || action.subject,
          detail: action.nextActionLabel || action.waitingOn || null,
          actionType: action.actionType,
          intent: action.intent || null,
          waitingOn: action.waitingOn || null,
          nextActionLabel: action.nextActionLabel || null,
          nextActionSummary: action.nextActionSummary || null,
          followUpDueAt: action.followUpDueAt || null,
          selectedMode: action.selectedMode || null,
          recommendedMode: action.recommendedMode || null,
          recommendedAction: action.recommendedAction || null,
          dominantRisk: action.dominantRisk || null,
        });
      }
    }

    return results
      .sort((left, right) => {
        const byRecordedAt = compareIsoDesc(left.recordedAt, right.recordedAt);
        if (byRecordedAt !== 0) return byRecordedAt;
        const byType = String(left.resultType).localeCompare(String(right.resultType));
        if (byType !== 0) return byType;
        return String(left.conversationId).localeCompare(String(right.conversationId));
      })
      .slice(0, safeLimit);
  }

  function getMailboxSummary({
    tenantId,
    mailboxId,
  } = {}) {
    const mailbox = findMailbox(tenantId, mailboxId);
    if (!mailbox) return null;
    const messageCount = selectMailboxMessages(mailbox.tenantId, mailbox.mailboxId).length;
    mailbox.messageCount = messageCount;
    return toSafeMailboxSummary(mailbox);
  }

  function getMissingMailboxWindows({
    tenantId,
    mailboxId,
    startIso,
    endIso,
  } = {}) {
    const mailbox = findMailbox(tenantId, mailboxId);
    if (!mailbox) {
      return computeMissingWindows([], { startIso, endIso });
    }
    return computeMissingWindows(mailbox.coverageWindows, { startIso, endIso });
  }

  await load();

  return {
    listDerivedCustomerProfiles,
    listMailboxMessages,
    upsertMailboxWindow,
    getMailboxSummary,
    getMissingMailboxWindows,
    recordOutcome,
    recordAction,
    listCustomerOutcomes,
    listCustomerActions,
    listOutcomes,
    listActions,
    summarizeOutcomeEvaluations,
    searchHistoryRecords,
  };
}

module.exports = {
  createCcoHistoryStore,
};
