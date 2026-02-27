function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function toNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizePriorityLevel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'critical') return 'Critical';
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  return 'Low';
}

function normalizeIntent(value = '') {
  const allowed = new Set([
    'booking_request',
    'pricing_question',
    'anxiety_pre_op',
    'complaint',
    'cancellation',
    'follow_up',
    'unclear',
  ]);
  const normalized = normalizeText(value);
  return allowed.has(normalized) ? normalized : 'unclear';
}

function normalizeTone(value = '') {
  const allowed = new Set(['neutral', 'stressed', 'anxious', 'frustrated', 'urgent', 'positive']);
  const normalized = normalizeText(value);
  return allowed.has(normalized) ? normalized : 'neutral';
}

function normalizeSlaStatus(value = '') {
  const allowed = new Set(['ok', 'due_48h', 'due_24h', 'aging_24h', 'aging_48h', 'breached']);
  const normalized = normalizeText(value);
  return allowed.has(normalized) ? normalized : 'ok';
}

function toStructuredRows(rows = [], maxItems = 50) {
  return asArray(rows)
    .map((row) => asObject(row))
    .filter((row) => Object.keys(row).length > 0)
    .slice(0, maxItems);
}

const CCO_AGENT_NAME = 'CCO';
const CCO_INBOX_ANALYSIS_CAPABILITY_REF = 'CCO.InboxAnalysis';

const ccoInboxAnalysisInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    includeClosed: { type: 'boolean' },
    maxDrafts: { type: 'integer', minimum: 1, maximum: 5 },
    debug: { type: 'boolean' },
  },
});

const ccoInboxAnalysisOutputSchema = Object.freeze({
  type: 'object',
  required: ['data', 'metadata', 'warnings'],
  additionalProperties: false,
  properties: {
    data: {
      type: 'object',
      required: [
        'urgentConversations',
        'needsReplyToday',
        'conversationWorklist',
        'slaBreaches',
        'riskFlags',
        'suggestedDrafts',
        'executiveSummary',
        'priorityLevel',
        'mailboxCount',
        'messageCount',
        'generatedAt',
      ],
      additionalProperties: false,
      properties: {
        urgentConversations: { type: 'array', maxItems: 25, items: { type: 'object' } },
        needsReplyToday: { type: 'array', maxItems: 80, items: { type: 'object' } },
        conversationWorklist: { type: 'array', maxItems: 120, items: { type: 'object' } },
        slaBreaches: { type: 'array', maxItems: 50, items: { type: 'object' } },
        riskFlags: { type: 'array', maxItems: 120, items: { type: 'object' } },
        suggestedDrafts: { type: 'array', maxItems: 5, items: { type: 'object' } },
        executiveSummary: { type: 'string', minLength: 1, maxLength: 1200 },
        priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
        mailboxCount: { type: 'number', minimum: 0 },
        messageCount: { type: 'number', minimum: 0 },
        generatedAt: { type: 'string', minLength: 1, maxLength: 50 },
      },
    },
    metadata: {
      type: 'object',
      required: ['agent', 'version', 'channel'],
      additionalProperties: true,
      properties: {
        agent: { type: 'string', minLength: 1, maxLength: 80 },
        version: { type: 'string', minLength: 1, maxLength: 40 },
        channel: { type: 'string', minLength: 1, maxLength: 40 },
        tenantId: { type: 'string', minLength: 1, maxLength: 120 },
        correlationId: { type: 'string', minLength: 1, maxLength: 120 },
      },
    },
    warnings: {
      type: 'array',
      maxItems: 30,
      items: { type: 'string', minLength: 1, maxLength: 260 },
    },
  },
});

function normalizeConversationWorkItem(item = {}) {
  const safe = asObject(item);
  return {
    conversationId: normalizeText(safe.conversationId) || 'unknown',
    messageId: normalizeText(safe.messageId) || 'unknown',
    mailboxId: normalizeText(safe.mailboxId) || 'unknown-mailbox',
    subject: normalizeText(safe.subject) || '(utan amne)',
    sender: normalizeText(safe.sender) || 'okand avsandare',
    latestInboundPreview: normalizeText(safe.latestInboundPreview) || 'Ingen preview tillganglig.',
    hoursSinceInbound: toNonNegativeNumber(safe.hoursSinceInbound, 0),
    lastInboundAt: normalizeText(safe.lastInboundAt) || new Date().toISOString(),
    slaStatus: normalizeSlaStatus(safe.slaStatus),
    intent: normalizeIntent(safe.intent),
    tone: normalizeTone(safe.tone),
    priorityLevel: normalizePriorityLevel(safe.priorityLevel),
    priorityScore: toNonNegativeNumber(safe.priorityScore, 0),
    recommendedAction: normalizeText(safe.recommendedAction) || 'Be om mer info',
    escalationRequired: safe.escalationRequired === true,
    needsReplyStatus:
      normalizeText(safe.needsReplyStatus) === 'handled' ? 'handled' : 'needs_reply',
  };
}

function normalizeSuggestedDraft(draft = {}) {
  const safe = normalizeConversationWorkItem(draft);
  const level = normalizeText(draft.confidenceLevel);
  const replyText =
    normalizeText(draft.suggestedReply) ||
    normalizeText(draft.proposedReply) ||
    'Inget forslag tillgangligt.';
  return {
    ...safe,
    suggestedReply: replyText,
    proposedReply: replyText,
    confidenceLevel: level === 'High' || level === 'Medium' || level === 'Low' ? level : 'Low',
  };
}

function composeCcoInboxAnalysis({
  inboxOutput = null,
  channel = 'admin',
  tenantId = '',
  correlationId = '',
} = {}) {
  const normalizedOutput = asObject(inboxOutput);
  const data = asObject(normalizedOutput.data);
  const metadata = asObject(normalizedOutput.metadata);
  const warnings = asArray(normalizedOutput.warnings);

  const composedMetadata = {
    agent: CCO_AGENT_NAME,
    version: '2.0.0',
    channel: normalizeText(channel) || 'admin',
    tenantId: normalizeText(tenantId) || 'unknown',
    sources: ['AnalyzeInbox'],
    sourceCapabilityVersion: normalizeText(metadata.version) || null,
    sourceSnapshotVersion: normalizeText(metadata?.snapshotDebug?.snapshotVersion) || null,
    requestedMaxDrafts: clampInteger(metadata?.requestedMaxDrafts, 1, 5, null),
  };
  const safeCorrelationId = normalizeText(correlationId);
  if (safeCorrelationId) {
    composedMetadata.correlationId = safeCorrelationId;
  }

  return {
    data: {
      urgentConversations: toStructuredRows(data.urgentConversations, 25),
      needsReplyToday: toStructuredRows(data.needsReplyToday, 80).map(normalizeConversationWorkItem),
      conversationWorklist: toStructuredRows(data.conversationWorklist, 120).map(
        normalizeConversationWorkItem
      ),
      slaBreaches: toStructuredRows(data.slaBreaches, 50),
      riskFlags: toStructuredRows(data.riskFlags, 120),
      suggestedDrafts: toStructuredRows(data.suggestedDrafts, 5).map(normalizeSuggestedDraft),
      executiveSummary:
        normalizeText(data.executiveSummary) ||
        'Inboxanalys klar. Ingen ytterligare sammanfattning tillganglig.',
      priorityLevel: normalizePriorityLevel(data.priorityLevel),
      mailboxCount: toNonNegativeNumber(data.mailboxCount, 0),
      messageCount: toNonNegativeNumber(data.messageCount, 0),
      generatedAt: new Date().toISOString(),
    },
    metadata: composedMetadata,
    warnings: Array.from(
      new Set(
        warnings
          .map((item) => normalizeText(item))
          .filter(Boolean)
      )
    ).slice(0, 30),
  };
}

module.exports = {
  CCO_AGENT_NAME,
  CCO_INBOX_ANALYSIS_CAPABILITY_REF,
  ccoInboxAnalysisInputSchema,
  ccoInboxAnalysisOutputSchema,
  composeCcoInboxAnalysis,
};
