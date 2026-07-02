'use strict';

/* ─── ccoMailboxAllowlist — A1 ───────────────────────────────────────────────
 *
 * Vilka klinikbrevlådor CCO läser in som KUNDKONVERSATIONER.
 *
 * Curated default = de personliga/team-inkorgar som får riktig kundmail.
 * Rena funktions-/notisadresser (marknad, kvitto, booking, halso …) ingestas
 * INTE som kundkonversationer — de är utskicks-/notisadresser, och brus-
 * filtret (ccoConversationThreadStore / nonPatientRules) hanterar övrigt brus.
 *
 * Prioritet (första icke-tomma vinner):
 *   1. ARCANA_MAILBOX_ALLOWLIST (env)   — driftsätts per miljö, full override
 *   2. scheduler-history-mailboxar (config)
 *   3. curated default (nedan)
 *
 * Allt är env-överstyrbart → att lägga till/ta bort en brevlåda är en
 * konfigändring, inte en kodändring.
 * ────────────────────────────────────────────────────────────────────────── */

// OWNER-BESLUT (A1): kundkonversations-inkorgar. `marknad@` är medvetet
// EXKLUDERAD (marknadsföring/utskick, inte klinisk kunddialog). Lägg till den
// igen här eller via ARCANA_MAILBOX_ALLOWLIST om owner vill ingesta den.
const CURATED_CUSTOMER_MAILBOX_ALLOWLIST = Object.freeze([
  'info@hairtpclinic.com',
  'contact@hairtpclinic.com',
  'kons@hairtpclinic.com',
  'egzona@hairtpclinic.com',
  'fazli@hairtpclinic.com',
]);

function normalizeMailboxList(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  return raw
    .map((entry) =>
      String(entry || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
}

/**
 * Löser den aktiva ingest-allowlisten med tydlig prioritet + källa.
 * @returns {{ mailboxIds: string[], source: string }}
 */
function resolveIngestMailboxAllowlist({
  envAllowlist = '',
  schedulerHistoryMailboxIds = [],
  curatedDefault = CURATED_CUSTOMER_MAILBOX_ALLOWLIST,
} = {}) {
  const env = normalizeMailboxList(envAllowlist);
  if (env.length > 0) {
    return { mailboxIds: [...new Set(env)], source: 'ARCANA_MAILBOX_ALLOWLIST' };
  }
  const scheduler = normalizeMailboxList(schedulerHistoryMailboxIds);
  if (scheduler.length > 0) {
    return {
      mailboxIds: [...new Set(scheduler)],
      source: 'ARCANA_SCHEDULER_CCO_HISTORY_MAILBOX_IDS',
    };
  }
  return {
    mailboxIds: [...new Set(normalizeMailboxList(curatedDefault))],
    source: 'curated_customer_mailbox_allowlist',
  };
}

module.exports = {
  CURATED_CUSTOMER_MAILBOX_ALLOWLIST,
  normalizeMailboxList,
  resolveIngestMailboxAllowlist,
};
