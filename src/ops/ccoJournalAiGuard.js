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

module.exports = {
  assertExternalAiJournalPolicy,
  containsJournalLikeContent,
  stripJournalPayloadForExternalAi,
};
