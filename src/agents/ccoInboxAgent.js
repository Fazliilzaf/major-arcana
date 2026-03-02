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

function toIntentConfidence(value, fallback = 0.3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function toToneConfidence(value, fallback = 0.4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
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
  if (normalized === 'safe' || normalized === 'warning' || normalized === 'breach') {
    return normalized;
  }
  if (allowed.has(normalized)) {
    if (normalized === 'ok') return 'safe';
    if (normalized === 'breached') return 'breach';
    return 'warning';
  }
  return 'safe';
}

function normalizePriorityReasons(value = []) {
  return asArray(value)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeDraftMode(value = '', fallback = 'professional') {
  const normalized = normalizeText(value).toLowerCase();
  if (['short', 'warm', 'professional'].includes(normalized)) return normalized;
  return ['short', 'warm', 'professional'].includes(fallback) ? fallback : 'professional';
}

function normalizeDraftModes(value = null, fallbackReply = '') {
  const safeValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const fallback = normalizeText(fallbackReply) || 'Hej,\n\nTack för ditt meddelande.';
  return {
    short: normalizeText(safeValue.short) || fallback,
    warm: normalizeText(safeValue.warm) || fallback,
    professional: normalizeText(safeValue.professional) || fallback,
  };
}

function normalizeStructureUsed(value = null) {
  const safeValue = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    acknowledgement: normalizeText(safeValue.acknowledgement) || 'Tack för ditt meddelande.',
    coreAnswer:
      normalizeText(safeValue.coreAnswer) ||
      'Vi har tagit emot ärendet och återkommer med tydlig återkoppling.',
    cta:
      normalizeText(safeValue.cta) ||
      'Vänligen återkom med kompletterande information så hjälper vi dig vidare.',
  };
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
    conversationId: normalizeText(safe.conversationId) || 'okand',
    messageId: normalizeText(safe.messageId) || 'okand',
    mailboxId: normalizeText(safe.mailboxId) || 'okand-postlada',
    subject: normalizeText(safe.subject) || '(utan ämne)',
    sender: normalizeText(safe.sender) || 'okänd avsändare',
    latestInboundPreview: normalizeText(safe.latestInboundPreview) || 'Ingen förhandsvisning tillgänglig.',
    hoursSinceInbound: toNonNegativeNumber(safe.hoursSinceInbound, 0),
    lastInboundAt: normalizeText(safe.lastInboundAt) || new Date().toISOString(),
    lastOutboundAt: normalizeText(safe.lastOutboundAt) || null,
    slaStatus: normalizeSlaStatus(safe.slaStatus),
    hoursRemaining: Number.isFinite(Number(safe.hoursRemaining))
      ? Number(safe.hoursRemaining)
      : 0,
    slaThreshold: toNonNegativeNumber(safe.slaThreshold, 48),
    stagnated: safe.stagnated === true,
    stagnationHours: toNonNegativeNumber(safe.stagnationHours, 0),
    followUpSuggested: safe.followUpSuggested === true,
    intent: normalizeIntent(safe.intent),
    intentConfidence: toIntentConfidence(safe.intentConfidence, 0.3),
    tone: normalizeTone(safe.tone),
    toneConfidence: toToneConfidence(safe.toneConfidence, 0.4),
    priorityLevel: normalizePriorityLevel(safe.priorityLevel),
    priorityScore: toNonNegativeNumber(safe.priorityScore, 0),
    priorityReasons: normalizePriorityReasons(safe.priorityReasons),
    recommendedAction: normalizeText(safe.recommendedAction) || 'Be om mer info',
    escalationRequired: safe.escalationRequired === true,
    needsReplyStatus:
      normalizeText(safe.needsReplyStatus) === 'handled' ? 'handled' : 'needs_reply',
  };
}

function normalizeSuggestedDraft(draft = {}) {
  const safe = normalizeConversationWorkItem(draft);
  const level = normalizeText(draft.confidenceLevel);
  const fallbackReply =
    normalizeText(draft.suggestedReply) ||
    normalizeText(draft.proposedReply) ||
    'Inget förslag tillgängligt.';
  const draftModes = normalizeDraftModes(draft.draftModes, fallbackReply);
  const recommendedMode = normalizeDraftMode(draft.recommendedMode, 'professional');
  const recommendedReply =
    normalizeText(draftModes[recommendedMode]) ||
    normalizeText(draftModes.professional) ||
    fallbackReply;
  return {
    ...safe,
    draftModes,
    recommendedMode,
    structureUsed: normalizeStructureUsed(draft.structureUsed),
    suggestedReply: recommendedReply,
    proposedReply: recommendedReply,
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
    tenantId: normalizeText(tenantId) || 'okand',
    sources: ['AnalyzeInbox'],
    sourceCapabilityVersion: normalizeText(metadata.version) || null,
    sourceSnapshotVersion: normalizeText(metadata?.snapshotDebug?.snapshotVersion) || null,
    requestedMaxDrafts: clampInteger(metadata?.requestedMaxDrafts, 1, 5, null),
    debugMode: Boolean(metadata?.snapshotDebug && typeof metadata.snapshotDebug === 'object'),
    snapshotDebug:
      metadata?.snapshotDebug && typeof metadata.snapshotDebug === 'object'
        ? metadata.snapshotDebug
        : undefined,
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
        'Inboxanalys klar. Ingen ytterligare sammanfattning tillgänglig.',
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
