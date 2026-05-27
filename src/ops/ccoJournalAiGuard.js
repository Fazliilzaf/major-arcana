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

/**
 * Redact journal/clinical content from OpenAI chat-completion params before they
 * leave for the external provider. Unlike stripJournalPayloadForExternalAi this
 * preserves the strict OpenAI message shape (only the `content` string is
 * replaced — no extra body/text fields that the API would reject). Covers tool
 * messages too, whose JSON content can carry fetched journal data. Fail-safe:
 * returns the same object reference untouched when there is nothing to redact.
 */
function redactChatCompletionParams(params = {}) {
  if (!params || typeof params !== 'object' || !Array.isArray(params.messages)) {
    return params;
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
  return redacted ? { ...params, messages } : params;
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
  JOURNAL_REDACTION_PLACEHOLDER,
};
