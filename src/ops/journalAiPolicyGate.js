'use strict';

/**
 * Journal AI Policy Gate.
 *
 * Prevents journal content (patient clinical data) from being sent to external AI services.
 * All AI processing of journal data MUST go through this gate.
 *
 * Policy:
 * - Journal text/fields NEVER sent to external AI (OpenAI, etc.) unless explicitly allowed
 * - Meeting transcription is allowed (audio → text is not journal content until persisted)
 * - AI summary of meetings is allowed (output is clinician-reviewed before journal entry)
 * - Template/draft AI is allowed (non-journal content)
 * - Patient chat AI is allowed (conversational, not journal)
 *
 * Gate enforces: if input contains journal fields/IDs, block external AI call.
 */

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

const JOURNAL_FIELD_PATTERNS = [
  /journalEntry/i,
  /journalType/i,
  /patientJournal/i,
  /signedJournal/i,
  /clinicalNote/i,
  /treatmentNote/i,
  /diagnosisText/i,
  /medicationList/i,
  /healthDeclaration/i,
  /fitnessDeclaration/i,
];

const ALLOWED_AI_CONTEXTS = Object.freeze([
  'meeting_transcription',
  'meeting_summary',
  'template_draft',
  'patient_chat',
  'inbox_analysis',
  'content_brief',
  'risk_evaluation',
  'capability_execution',
]);

function isJournalContent(input) {
  if (!input || typeof input !== 'object') return false;
  const json = JSON.stringify(input);
  return JOURNAL_FIELD_PATTERNS.some((pattern) => pattern.test(json));
}

function assertNoJournalToExternalAi({ input, context, targetService = 'openai' }) {
  const normalizedContext = normalizeText(context).toLowerCase().replace(/[\s-]/g, '_');

  if (ALLOWED_AI_CONTEXTS.includes(normalizedContext)) {
    return { allowed: true, context: normalizedContext, reason: 'allowed_context' };
  }

  if (isJournalContent(input)) {
    return {
      allowed: false,
      context: normalizedContext,
      targetService: normalizeText(targetService),
      reason: 'journal_content_detected',
      message:
        'Journalinnehåll får inte skickas till extern AI. PDL och klinikpolicy förbjuder detta.',
      policyRef: 'CCO-SYSTEM-SCOPE §10: Inget journalinnehåll till extern AI',
    };
  }

  return { allowed: true, context: normalizedContext, reason: 'no_journal_content' };
}

function createJournalAiMiddleware() {
  return function journalAiGate(req, res, next) {
    const context = normalizeText(req.body?.aiContext || req.query?.aiContext || '');
    const input = req.body?.journalData || req.body?.fields || null;

    if (input && isJournalContent(input)) {
      const gate = assertNoJournalToExternalAi({ input, context });
      if (!gate.allowed) {
        return res.status(403).json({
          ok: false,
          error: 'journal_ai_policy_blocked',
          message: gate.message,
          policyRef: gate.policyRef,
        });
      }
    }
    next();
  };
}

module.exports = {
  isJournalContent,
  assertNoJournalToExternalAi,
  createJournalAiMiddleware,
  ALLOWED_AI_CONTEXTS,
  JOURNAL_FIELD_PATTERNS,
};
