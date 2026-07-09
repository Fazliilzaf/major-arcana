const PROCESSOR_VERSION = '1.0.0';
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

const MAILBOX_FOLDER_TYPES = Object.freeze(['inbox', 'sent', 'drafts', 'deleted', 'custom']);

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
