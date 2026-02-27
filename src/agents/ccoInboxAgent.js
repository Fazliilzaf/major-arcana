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

function normalizePriorityLevel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  return 'Low';
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
        'slaBreaches',
        'riskFlags',
        'suggestedDrafts',
        'executiveSummary',
        'priorityLevel',
        'generatedAt',
      ],
      additionalProperties: false,
      properties: {
        urgentConversations: {
          type: 'array',
          maxItems: 25,
          items: { type: 'object' },
        },
        needsReplyToday: {
          type: 'array',
          maxItems: 50,
          items: { type: 'object' },
        },
        slaBreaches: {
          type: 'array',
          maxItems: 50,
          items: { type: 'object' },
        },
        riskFlags: {
          type: 'array',
          maxItems: 120,
          items: { type: 'object' },
        },
        suggestedDrafts: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            required: [
              'conversationId',
              'messageId',
              'subject',
              'proposedReply',
              'confidenceLevel',
            ],
            additionalProperties: false,
            properties: {
              conversationId: { type: 'string', minLength: 1, maxLength: 120 },
              messageId: { type: 'string', minLength: 1, maxLength: 120 },
              subject: { type: 'string', minLength: 1, maxLength: 200 },
              proposedReply: { type: 'string', minLength: 1, maxLength: 3000 },
              confidenceLevel: { type: 'string', enum: ['Low', 'Medium', 'High'] },
            },
          },
        },
        executiveSummary: { type: 'string', minLength: 1, maxLength: 1200 },
        priorityLevel: { type: 'string', enum: ['Low', 'Medium', 'High'] },
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

  return {
    data: {
      urgentConversations: toStructuredRows(data.urgentConversations, 25),
      needsReplyToday: toStructuredRows(data.needsReplyToday, 50),
      slaBreaches: toStructuredRows(data.slaBreaches, 50),
      riskFlags: toStructuredRows(data.riskFlags, 120),
      suggestedDrafts: toStructuredRows(data.suggestedDrafts, 5).map((draft) => ({
        conversationId: normalizeText(draft.conversationId) || 'unknown',
        messageId: normalizeText(draft.messageId) || 'unknown',
        subject: normalizeText(draft.subject) || '(utan amne)',
        proposedReply: normalizeText(draft.proposedReply) || 'Inget forslag tillgangligt.',
        confidenceLevel: (() => {
          const level = normalizeText(draft.confidenceLevel);
          if (level === 'High' || level === 'Medium' || level === 'Low') return level;
          return 'Low';
        })(),
      })),
      executiveSummary:
        normalizeText(data.executiveSummary) ||
        'Inboxanalys klar. Ingen ytterligare sammanfattning tillganglig.',
      priorityLevel: normalizePriorityLevel(data.priorityLevel),
      generatedAt: new Date().toISOString(),
    },
    metadata: {
      agent: CCO_AGENT_NAME,
      version: '1.0.0',
      channel: normalizeText(channel) || 'admin',
      tenantId: normalizeText(tenantId) || 'unknown',
      correlationId: normalizeText(correlationId) || '',
      sources: ['AnalyzeInbox'],
      sourceCapabilityVersion: normalizeText(metadata.version) || null,
      sourceSnapshotVersion: normalizeText(metadata?.snapshotDebug?.snapshotVersion) || null,
      requestedMaxDrafts: clampInteger(metadata?.requestedMaxDrafts, 1, 5, null),
    },
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
