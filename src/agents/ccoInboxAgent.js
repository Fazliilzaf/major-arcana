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

function normalizeTempoProfile(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['responsive', 'reflective', 'hesitant', 'low_engagement'].includes(normalized)) {
    return normalized;
  }
  return 'reflective';
}

function normalizeCtaIntensity(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['soft', 'normal', 'direct'].includes(normalized)) return normalized;
  return 'normal';
}

function normalizeFollowUpUrgencyLevel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['low', 'normal', 'high'].includes(normalized)) return normalized;
  return 'normal';
}

function normalizeDominantRisk(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['miss', 'tone', 'follow_up', 'relationship', 'neutral'].includes(normalized)) {
    return normalized;
  }
  return 'neutral';
}

function normalizeOptionalNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeWorkloadBreakdown(value = null) {
  const safe = asObject(value);
  if (!Object.keys(safe).length) {
    return {
      base: 0,
      toneAdjustment: 0,
      priorityAdjustment: 0,
      warmthAdjustment: 0,
      lengthAdjustment: 0,
    };
  }
  return {
    base: normalizeOptionalNumber(safe.base, 0),
    toneAdjustment: normalizeOptionalNumber(safe.toneAdjustment, 0),
    priorityAdjustment: normalizeOptionalNumber(safe.priorityAdjustment, 0),
    warmthAdjustment: normalizeOptionalNumber(safe.warmthAdjustment, 0),
    lengthAdjustment: normalizeOptionalNumber(safe.lengthAdjustment, 0),
  };
}

function normalizeCustomerSummary(value = null, fallbackCustomerKey = '') {
  const safe = asObject(value);
  const timeline = asArray(safe.timeline)
    .map((item) => asObject(item))
    .map((item) => ({
      conversationId: normalizeText(item.conversationId) || 'okand',
      subject: normalizeText(item.subject) || '(utan ämne)',
      status: normalizeText(item.status) || 'open',
      occurredAt: normalizeText(item.occurredAt) || null,
    }))
    .slice(0, 6);
  return {
    customerKey: normalizeText(safe.customerKey) || normalizeText(fallbackCustomerKey) || 'okand-kund',
    customerName: normalizeText(safe.customerName) || 'Okänd kund',
    lifecycleStatus: normalizeText(safe.lifecycleStatus) || 'NEW',
    lifecycleSource: normalizeText(safe.lifecycleSource) || 'auto',
    interactionCount: toNonNegativeNumber(safe.interactionCount, 0),
    caseCount: toNonNegativeNumber(safe.caseCount, 0),
    lastInteractionAt: normalizeText(safe.lastInteractionAt) || null,
    daysSinceLastInteraction: Number.isFinite(Number(safe.daysSinceLastInteraction))
      ? Number(safe.daysSinceLastInteraction)
      : null,
    engagementScore: toIntentConfidence(safe.engagementScore, 0),
    lastCaseSummary: normalizeText(safe.lastCaseSummary) || 'Ingen historik tillgänglig.',
    daysSinceLastClosedCase: Number.isFinite(Number(safe.daysSinceLastClosedCase))
      ? Number(safe.daysSinceLastClosedCase)
      : null,
    timeline,
  };
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

function normalizeFeedDirection(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'outbound') return 'outbound';
  return 'inbound';
}

function normalizeFeedEntry(item = {}) {
  const safe = asObject(item);
  return {
    feedId: normalizeText(safe.feedId) || 'okand-feed',
    conversationId: normalizeText(safe.conversationId) || 'okand',
    messageId: normalizeText(safe.messageId) || 'okand',
    direction: normalizeFeedDirection(safe.direction),
    subject: normalizeText(safe.subject) || '(utan ämne)',
    counterpart: normalizeText(safe.counterpart) || 'okänd kontakt',
    mailboxAddress: normalizeText(safe.mailboxAddress) || normalizeText(safe.mailboxId) || 'okand-postlada',
    sentAt: normalizeText(safe.sentAt) || new Date().toISOString(),
    preview: normalizeText(safe.preview) || '',
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
        'inboundFeed',
        'outboundFeed',
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
        inboundFeed: { type: 'array', maxItems: 1200, items: { type: 'object' } },
        outboundFeed: { type: 'array', maxItems: 1200, items: { type: 'object' } },
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
  const normalized = {
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

  const mailboxAddress = normalizeText(safe.mailboxAddress);
  if (mailboxAddress) {
    normalized.mailboxAddress = mailboxAddress;
  } else if (safe.mailboxAddress === null) {
    normalized.mailboxAddress = null;
  }

  const userPrincipalName = normalizeText(safe.userPrincipalName);
  if (userPrincipalName) {
    normalized.userPrincipalName = userPrincipalName;
  } else if (safe.userPrincipalName === null) {
    normalized.userPrincipalName = null;
  }

  const dueBy = normalizeText(safe.dueBy);
  if (dueBy) {
    normalized.dueBy = dueBy;
  } else if (safe.dueBy === null) {
    normalized.dueBy = null;
  }

  if (typeof safe.isUnanswered === 'boolean') {
    normalized.isUnanswered = safe.isUnanswered;
  }
  if (Number.isFinite(Number(safe.unansweredThresholdHours))) {
    normalized.unansweredThresholdHours = toNonNegativeNumber(safe.unansweredThresholdHours, 24);
  }

  const customerKey = normalizeText(safe.customerKey);
  if (customerKey) {
    normalized.customerKey = customerKey;
  }

  if (safe.customerSummary && typeof safe.customerSummary === 'object' && !Array.isArray(safe.customerSummary)) {
    normalized.customerSummary = normalizeCustomerSummary(safe.customerSummary, customerKey);
  }

  if (safe.lifecycleStatus !== undefined) {
    normalized.lifecycleStatus = normalizeText(safe.lifecycleStatus) || 'NEW';
  }

  if (safe.tempoProfile !== undefined) {
    normalized.tempoProfile = normalizeTempoProfile(safe.tempoProfile);
  }
  if (safe.recommendedFollowUpDelayDays !== undefined) {
    normalized.recommendedFollowUpDelayDays = toNonNegativeNumber(safe.recommendedFollowUpDelayDays, 0);
  }
  if (safe.ctaIntensity !== undefined) {
    normalized.ctaIntensity = normalizeCtaIntensity(safe.ctaIntensity);
  }

  const followUpSuggestedAt = normalizeText(safe.followUpSuggestedAt);
  if (followUpSuggestedAt) {
    normalized.followUpSuggestedAt = followUpSuggestedAt;
  } else if (safe.followUpSuggestedAt === null) {
    normalized.followUpSuggestedAt = null;
  }

  const followUpTimingReason = asArray(safe.followUpTimingReason)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 6);
  if (followUpTimingReason.length) {
    normalized.followUpTimingReason = followUpTimingReason;
  } else if (Array.isArray(safe.followUpTimingReason)) {
    normalized.followUpTimingReason = [];
  }

  if (safe.followUpUrgencyLevel !== undefined) {
    normalized.followUpUrgencyLevel = normalizeFollowUpUrgencyLevel(safe.followUpUrgencyLevel);
  }
  if (typeof safe.followUpManualApprovalRequired === 'boolean') {
    normalized.followUpManualApprovalRequired = safe.followUpManualApprovalRequired;
  }
  if (safe.estimatedWorkMinutes !== undefined) {
    normalized.estimatedWorkMinutes = normalizeOptionalNumber(safe.estimatedWorkMinutes, 0);
  }
  if (safe.workloadBreakdown && typeof safe.workloadBreakdown === 'object' && !Array.isArray(safe.workloadBreakdown)) {
    normalized.workloadBreakdown = normalizeWorkloadBreakdown(safe.workloadBreakdown);
  }
  if (safe.dominantRisk !== undefined) {
    normalized.dominantRisk = normalizeDominantRisk(safe.dominantRisk);
  }
  if (safe.riskStackScore !== undefined) {
    normalized.riskStackScore = toIntentConfidence(safe.riskStackScore, 0);
  }
  const riskStackExplanation = normalizeText(safe.riskStackExplanation);
  if (riskStackExplanation) {
    normalized.riskStackExplanation = riskStackExplanation;
  }

  const relationshipStatus = normalizeText(safe.relationshipStatus);
  if (relationshipStatus) {
    normalized.relationshipStatus = relationshipStatus;
  }
  const relationshipLabel = normalizeText(safe.relationshipLabel);
  if (relationshipLabel) {
    normalized.relationshipLabel = relationshipLabel;
  }

  if (typeof safe.isNewSinceLastVisit === 'boolean') {
    normalized.isNewSinceLastVisit = safe.isNewSinceLastVisit;
  }

  return normalized;
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
  const sourceMetadata = asObject(normalizedOutput.metadata);
  const warnings = asArray(normalizedOutput.warnings);

  const composedMetadata = {
    agent: CCO_AGENT_NAME,
    version: '2.0.0',
    channel: normalizeText(channel) || 'admin',
    sources: ['AnalyzeInbox'],
    sourceCapabilityVersion: normalizeText(sourceMetadata.version) || null,
    sourceSnapshotVersion: normalizeText(sourceMetadata?.snapshotDebug?.snapshotVersion) || null,
    requestedMaxDrafts: clampInteger(sourceMetadata?.requestedMaxDrafts, 1, 5, null),
    debugMode: Boolean(sourceMetadata?.snapshotDebug && typeof sourceMetadata.snapshotDebug === 'object'),
    snapshotDebug:
      sourceMetadata?.snapshotDebug && typeof sourceMetadata.snapshotDebug === 'object'
        ? sourceMetadata.snapshotDebug
        : undefined,
  };
  const safeTenantId = normalizeText(tenantId);
  if (safeTenantId) {
    composedMetadata.tenantId = safeTenantId;
  }
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
      inboundFeed: toStructuredRows(data.inboundFeed, 1200).map(normalizeFeedEntry),
      outboundFeed: toStructuredRows(data.outboundFeed, 1200).map(normalizeFeedEntry),
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
