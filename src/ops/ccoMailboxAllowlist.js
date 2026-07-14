'use strict';

/* ─── ccoMailboxAllowlist — A1 ───────────────────────────────────────────────
 *
 * Vilka klinikbrevlådor CCO läser in som KUNDKONVERSATIONER.
 *
 * Curated default = de CCO-brevlådor som operatören kan välja i Konversationer.
 * Brusfiltreringen sker på meddelande-/trådnivå, inte genom att göra en synlig
 * brevlåda omöjlig att läsa. Det gör mailbox-väljaren konsekvent med API:t.
 *
 * Prioritet (första icke-tomma vinner):
 *   1. ARCANA_MAILBOX_ALLOWLIST (env)   — driftsätts per miljö, full override
 *   2. scheduler-history-mailboxar (config)
 *   3. curated default (nedan)
 *
 * Allt är env-överstyrbart → att lägga till/ta bort en brevlåda är en
 * konfigändring, inte en kodändring.
 * ────────────────────────────────────────────────────────────────────────── */

// CCO:s synliga mailboxar. ENV kan fortfarande uttryckligen begränsa listan
// per miljö, men default får aldrig göra en synlig väljare overksam.
const CURATED_CUSTOMER_MAILBOX_ALLOWLIST = Object.freeze([
  'info@hairtpclinic.com',
  'contact@hairtpclinic.com',
  'kons@hairtpclinic.com',
  'egzona@hairtpclinic.com',
  'fazli@hairtpclinic.com',
  'marknad@hairtpclinic.com',
  'kvitto@hairtpclinic.com',
  'halso@hairtpclinic.com',
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
