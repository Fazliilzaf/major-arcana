const PROCESSOR_VERSION = '1.0.0';

/* VARNING — läs innan du ändrar FILTER_VERSION, MATCH_VERSION eller
 * PROCESSOR_VERSION.
 *
 * De tre stämplarna skrivs på varje ledger-post och läses tillbaka av
 * shouldSkipProcessing() i store.js. Stämmer inte ALLA tre med konstanterna
 * här räknas posten som ofärdig — oavsett vilken status den har.
 *
 * reconcileProcessingQueue() itererar samtliga ledger-poster och köar varje
 * post där shouldSkipProcessing() är falskt. Den anropas av
 * ensureQueueIntegrity(), som i sin tur körs både i runProcessBatch() och av
 * /process-all innan drainen startar. En bump slår alltså igenom vid nästa
 * batch, utan att någon aktivt begär omkörning.
 *
 * Mätning mot prod 2026-08-19: 9 686 ledger-poster, varav 8 814 RAW_SAVED
 * (redan i kön) och 872 färdigprocessade. En bump lägger till just de 872 —
 * kön går 8 814 -> 9 686 — och kör dem genom pipelinen igen. I andra lägen
 * än dry_run innebär det att dokumenttriage och portal-nudge körs om för
 * redan matchade kunder; kontrollera idempotensen där innan du bumpar.
 *
 * Vill du bara köra om de omatchade: använd
 * /cco/mail-ingestion/reprocess-unmatched. Den är riktad och kräver ingen
 * bump.
 *
 * OBS: stämpeln nedan har INTE följt med regeländringarna. nonPatientRules.js
 * utökades 2026-07-02 (A2, #510) och 2026-08-17 (d8c422bf) utan bump, så
 * poster processade före dessa ser fortfarande aktuella ut. Mätning
 * 2026-08-19: 90 av 477 misslyckade matchningar skulle fångas av dagens
 * regler. Bumpa när du ändrar reglerna — men gör det medvetet, med ovanstående
 * i åtanke.
 */
const FILTER_VERSION = 'cco-mail-filter-2026-05-26';
const MATCH_VERSION = 'patient-match-v2';

const INGESTION_MODES = Object.freeze(['dry_run', 'read_only', 'active']);

const LEDGER_STATUSES = Object.freeze([
  'DISCOVERED',
  'FETCHED',
  'RAW_SAVED',
  'DUPLICATE_SKIPPED',
  'SECURITY_REVIEW',
  'FILTERED',
  'CLASSIFIED',
  'MATCHED',
  'UNMATCHED',
  'NEEDS_REVIEW',
  'ACTION_CREATED',
  'COMPLETED',
  'FAILED',
  'REPROCESS_REQUESTED',
  'REPROCESSED',
]);

const IMPORT_RUN_MODES = Object.freeze([
  'initial_sync',
  'delta_sync',
  'reset',
  'retry',
  'webhook_trigger',
]);

const IMPORT_RUN_STATUSES = Object.freeze([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

const MAILBOX_FOLDER_TYPES = Object.freeze(['inbox', 'sent', 'drafts', 'deleted']);

const MAIL_TYPES = Object.freeze([
  'booking_request',
  'cancellation',
  'reschedule',
  'pricing_question',
  'post_op_question',
  'complication',
  'payment',
  'consent',
  'marketing',
  'spam',
  'internal',
  'unknown',
]);

module.exports = {
  FILTER_VERSION,
  IMPORT_RUN_MODES,
  IMPORT_RUN_STATUSES,
  INGESTION_MODES,
  LEDGER_STATUSES,
  MAIL_TYPES,
  MAILBOX_FOLDER_TYPES,
  MATCH_VERSION,
  PROCESSOR_VERSION,
};
