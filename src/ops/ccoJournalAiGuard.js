'use strict';

const JOURNAL_BLOCKING_PATTERNS = [
  /\btp_treatment\b/i,
  /\bhealth_declaration\b/i,
  /\bfitness_certificate\b/i,
  /\bconsultation_plan\b/i,
  /\bprp_treatment\b/i,
  /\bbleph_treatment\b/i,
  /\bfollow_up\b/i,
  /\bpersonnummer\b/i,
  /\bjournalpost\b/i,
  /\bbehandlingsjournal\b/i,
  /\bhälsodeklaration\b/i,
  /\bfriskförsäkran\b/i,
];

function containsJournalLikeContent(text = '') {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  return JOURNAL_BLOCKING_PATTERNS.some((pattern) => pattern.test(raw));
}

function stripJournalPayloadForExternalAi(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const next = { ...safe };
  if (Array.isArray(next.messages)) {
    next.messages = next.messages.map((message) => {
      const body = String(message?.body || message?.content || message?.text || '');
      if (!containsJournalLikeContent(body)) return message;
      return {
        ...message,
        body: '[Journalinnehåll utelämnat enligt policy — ingen extern AI.]',
        content: '[Journalinnehåll utelämnat enligt policy — ingen extern AI.]',
        text: '[Journalinnehåll utelämnat enligt policy — ingen extern AI.]',
        journalRedacted: true,
      };
    });
  }
  if (containsJournalLikeContent(next.subject)) {
    next.subject = '[Redacted subject]';
  }
  next.journalAiGuardApplied = true;
  return next;
}

function assertExternalAiJournalPolicy(input = {}) {
  const blob = JSON.stringify(input);
  if (containsJournalLikeContent(blob)) {
    return stripJournalPayloadForExternalAi(input);
  }
  return input;
}

const JOURNAL_REDACTION_PLACEHOLDER =
  '[Journalinnehåll utelämnat enligt policy — ingen extern AI.]';

// Contexts where external AI is policy-allowed even if the text trips the
// journal patterns: conversational/transcription/draft flows that are NOT
// persisted journal content. A caller opts in by passing `__aiContext` on the
// chat-completion params (the field is stripped before the request leaves).
// Unlabeled calls default to the safe behaviour (redact).
const ALLOWED_AI_CONTEXTS = new Set([
  'meeting_transcription',
  'meeting_summary',
  'template_draft',
  'patient_chat',
  'inbox_analysis',
  'content_brief',
  'risk_evaluation',
  'capability_execution',
]);

function normalizeAiContext(ctx) {
  return String(ctx || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * Redact journal/clinical content from OpenAI chat-completion params before they
 * leave for the external provider. Preserves the strict OpenAI message shape
 * (only the `content` string is replaced). Covers tool messages too. An optional
 * `params.__aiContext` opts a call into an allowed context (no redaction); the
 * hint field is always stripped so it never reaches the API. Fail-safe: returns
 * the same object reference when there is nothing to change.
 */
function redactChatCompletionParams(params = {}) {
  if (!params || typeof params !== 'object') return params;

  const hasHint = Object.prototype.hasOwnProperty.call(params, '__aiContext');
  const allowed = hasHint && ALLOWED_AI_CONTEXTS.has(normalizeAiContext(params.__aiContext));
  const stripHint = (obj) => {
    const next = { ...obj };
    delete next.__aiContext;
    return next;
  };

  if (!Array.isArray(params.messages) || allowed) {
    return hasHint ? stripHint(params) : params;
  }

  let redacted = false;
  const messages = params.messages.map((message) => {
    const content = typeof message?.content === 'string' ? message.content : '';
    if (content && containsJournalLikeContent(content)) {
      redacted = true;
      return { ...message, content: JOURNAL_REDACTION_PLACEHOLDER };
    }
    return message;
  });

  if (!redacted && !hasHint) return params;
  const out = { ...params, messages };
  delete out.__aiContext;
  return out;
}

/**
 * Wrap an OpenAI-SDK-like instance so every chat.completions.create call has its
 * messages run through redactChatCompletionParams first. Centralises the journal
 * guard at the single SDK choke point (covers all callers + tool results).
 * Idempotent, tolerant of a missing/!provider shape, and never throws.
 */
function guardOpenAiChatCompletions(openaiInstance) {
  const completions =
    openaiInstance && openaiInstance.chat && openaiInstance.chat.completions;
  if (!completions || typeof completions.create !== 'function' || completions.__journalGuarded) {
    return openaiInstance;
  }
  const originalCreate = completions.create.bind(completions);
  completions.create = (params, ...rest) =>
    originalCreate(redactChatCompletionParams(params), ...rest);
  completions.__journalGuarded = true;
  return openaiInstance;
}

module.exports = {
  assertExternalAiJournalPolicy,
  containsJournalLikeContent,
  redactChatCompletionParams,
  guardOpenAiChatCompletions,
  stripJournalPayloadForExternalAi,
  ALLOWED_AI_CONTEXTS,
  JOURNAL_REDACTION_PLACEHOLDER,
};
