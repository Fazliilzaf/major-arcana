'use strict';

/**
 * Löpande halso@ HD-ingest via scheduler (minnessäker, utan bootstrap).
 * Använder patientMasterStore direkt — ARCANA_CCO_HALSO_HD_INGEST_ENABLED förblir false.
 */
const path = require('node:path');
const fs = require('node:fs/promises');

const { createCcoHalsoHealthDeclarationIngest } = require('./ccoHalsoHealthDeclarationIngest');
const {
  scanHalsoInboxCorpus,
  readIndexLines,
  readJsonFile,
  writeJsonAtomic,
  fetchMessageBody,
  normalizeGraphMessage,
  getGraphToken,
  DEFAULT_MAILBOX,
} = require('../../scripts/lib/halsoHdGraphInbox');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function loadSchedulerState(statePath) {
  return readJsonFile(statePath, {
    version: 'halso-hd-scheduler-v1',
    lastRunAt: null,
    lastSuccessAt: null,
    lastStats: null,
  });
}

async function saveSchedulerState(statePath, state) {
  await writeJsonAtomic(statePath, { ...state, updatedAt: new Date().toISOString() });
}

function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

async function runCcoHalsoHdScheduledMailboxIngest({
  tenantId = 'hair-tp-clinic',
  trigger = 'scheduled',
  patientMasterStore = null,
  config = {},
  logger = console,
} = {}) {
  if (!patientMasterStore) {
    return { tenantId, skipped: true, reason: 'patient_master_store_unavailable' };
  }
  if (!config.graphReadEnabled) {
    return { tenantId, skipped: true, reason: 'graph_read_disabled' };
  }

  const mailbox = normalizeText(config.ccoHalsoMailboxEmail || DEFAULT_MAILBOX).toLowerCase();
  const statePath =
    config.ccoHalsoHdSchedulerStatePath ||
    path.join(
      config.reportsDir || path.join(process.cwd(), 'data/reports'),
      'cco-halso-hd-scheduler-state.json'
    );
  const scratchDir = path.join(path.dirname(statePath), 'halso-hd-scheduler-scratch');
  const checkpointPath = path.join(scratchDir, 'incremental.checkpoint.json');
  const indexPath = path.join(scratchDir, 'incremental.index.jsonl');
  const sinceDays = Math.max(1, Number(config.schedulerCcoHalsoHdLookbackDays) || 3);
  const since = isoDaysAgo(sinceDays);

  await fs.mkdir(scratchDir, { recursive: true });
  await fs.writeFile(indexPath, '', 'utf8').catch(() => {});
  try {
    await fs.unlink(checkpointPath);
  } catch {
    /* fresh incremental scan */
  }

  const scan = await scanHalsoInboxCorpus({
    mailbox,
    since,
    pageSize: 50,
    scope: 'mailbox',
    checkpointPath,
    indexPath,
  });
  const headers = await readIndexLines(indexPath);
  if (!headers.length) {
    const state = await loadSchedulerState(statePath);
    state.lastRunAt = new Date().toISOString();
    state.lastStats = { processed: 0, imported: 0, skipped: 0, reason: 'no_new_hd_mail' };
    await saveSchedulerState(statePath, state);
    return {
      tenantId,
      trigger,
      since,
      processed: 0,
      imported: 0,
      skipped: true,
      reason: 'no_new_hd_mail',
    };
  }

  const ingest = createCcoHalsoHealthDeclarationIngest({
    config,
    patientMasterStore,
    dedupStorePath: config.ccoHalsoHealthDeclarationDedupStorePath,
    logger,
  });

  const graphToken = await getGraphToken();
  const stats = { processed: 0, imported: 0, updated: 0, duplicate: 0, needsReview: 0, failed: 0 };

  for (const header of headers) {
    stats.processed += 1;
    const full = await fetchMessageBody(graphToken, mailbox, header.id);
    const rawMessage = normalizeGraphMessage(full, mailbox);
    try {
      const result = await ingest.processRawMessage({
        rawMessage,
        mode: 'commit',
        tenantId,
        persist: true,
      });
      if (result.skipped && result.reason === 'duplicate') stats.duplicate += 1;
      else if (result.needsReview) stats.needsReview += 1;
      else if (result.imported) {
        if (result.updated) stats.updated += 1;
        else stats.imported += 1;
      }
    } catch (error) {
      stats.failed += 1;
      logger?.error?.('[halso-hd-scheduler] message failed', header.id, error?.message || error);
    }
  }

  const state = await loadSchedulerState(statePath);
  state.lastRunAt = new Date().toISOString();
  state.lastSuccessAt = new Date().toISOString();
  state.lastStats = stats;
  await saveSchedulerState(statePath, state);

  return {
    tenantId,
    trigger,
    since,
    mailbox,
    headersFound: headers.length,
    ingestFlagNote:
      'ARCANA_CCO_HALSO_HD_INGEST_ENABLED=false — scheduler använder dedikerad store-upsert',
    ...stats,
  };
}

module.exports = {
  runCcoHalsoHdScheduledMailboxIngest,
};
