'use strict';

/**
 * Strömmande batch-ingest: en mejl i taget → parse → match → dedup → (valfritt) prod PUT.
 * Använder parser/match/dedup från ccoHalsoHealthDeclarationIngest — INTE bootstrapRunner.
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  buildHealthDeclarationDedupKeys,
  matchPatientFromParsed,
  mergeHealthDeclaration,
} = require('../../src/ops/ccoHalsoHealthDeclarationIngest');
const { parseHealthDeclarationMessage } = require('../../src/ops/ccoHalsoHealthDeclarationParser');
const {
  getGraphToken,
  fetchMessageBody,
  normalizeGraphMessage,
  DEFAULT_MAILBOX,
  readJsonFile,
  writeJsonAtomic,
} = require('./halsoHdGraphInbox');
const { fetchPatient, putPatient, TENANT_ID } = require('./halsoHdProdClient');

function emptyBatchStats() {
  return {
    processed: 0,
    parsedOk: 0,
    parseFailed: 0,
    parseFailedByReason: {},
    matched: 0,
    matchedByMethod: {},
    needsReview: 0,
    unmatched: 0,
    duplicate: 0,
    putOk: 0,
    putFailed: 0,
    skippedCommit: 0,
    reviewQueued: 0,
  };
}

async function appendReviewQueueLine(reviewQueuePath, entry) {
  if (!reviewQueuePath) return;
  await fs.mkdir(path.dirname(reviewQueuePath), { recursive: true });
  await fs.appendFile(reviewQueuePath, `${JSON.stringify(entry)}\n`, 'utf8');
}

function buildReviewQueueEntry({ header, parsed, match, status, runId, batch }) {
  return {
    queuedAt: new Date().toISOString(),
    runId,
    batch,
    status,
    messageId: header?.id || '',
    internetMessageId: header?.internetMessageId || parsed?.internetMessageId || '',
    receivedDateTime: header?.receivedDateTime || '',
    subject: header?.subject || parsed?.subject || '',
    personnummer: parsed?.personnummer || '',
    email: parsed?.email || '',
    phone: parsed?.phone || '',
    displayName: parsed?.displayName || '',
    matchMethod: match?.method || null,
    matchConfidence: match?.confidence || 0,
    parseReason: parsed?.reason || null,
    candidatePatientIds: (match?.candidates || []).map((row) => row.patientId).filter(Boolean),
    note: 'Re-match efter Cliento-synk — ej auto-merge',
  };
}

function emptyDedupState() {
  return {
    version: 'halso-hd-batch-dedup-v1',
    updatedAt: new Date().toISOString(),
    entries: {},
  };
}

async function loadDedupState(dedupPath) {
  const state = await readJsonFile(dedupPath, emptyDedupState());
  if (!state.entries) state.entries = {};
  return state;
}

async function saveDedupState(dedupPath, state) {
  state.updatedAt = new Date().toISOString();
  await writeJsonAtomic(dedupPath, state);
}

function findDuplicateEntry(state, dedupKeys = []) {
  for (const key of dedupKeys) {
    if (state.entries[key]) return { key, entry: state.entries[key] };
  }
  return null;
}

async function recordDedupEntry(dedupPath, state, dedupKeys, entry) {
  const payload = { ...entry, recordedAt: new Date().toISOString() };
  for (const key of dedupKeys) {
    state.entries[key] = payload;
  }
  await saveDedupState(dedupPath, state);
}

function buildHealthDeclarationUpsert({ parsed, match, rawMessage, runId }) {
  return {
    source: 'halso_mailbox',
    channel: parsed.channel,
    signedAt: parsed.signedAt,
    consent: parsed.consent,
    importedAt: new Date().toISOString(),
    internetMessageId: parsed.internetMessageId || rawMessage.internetMessageId || '',
    rawMessageId: rawMessage.id || '',
    mailboxId: rawMessage.mailboxId || DEFAULT_MAILBOX,
    subject: parsed.subject || rawMessage.subject || '',
    matchMethod: match.method,
    matchConfidence: match.confidence,
    reviewRequired: false,
    answers: parsed.answers,
    flags: parsed.flags,
    backfillRunId: runId,
    processorVersion: 'halso-hd-batch-v1',
  };
}

function mergeAllergies(existing = [], incoming = []) {
  return [
    ...new Set([...existing, ...incoming].map((v) => String(v || '').trim()).filter(Boolean)),
  ];
}

function maskPersonnummer(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? `****${digits.slice(-4)}` : '';
}

function summarizeResultRow({ header, parsed, match, status, patientId, error }) {
  return {
    messageId: header?.id || '',
    receivedDateTime: header?.receivedDateTime || '',
    subject: header?.subject || '',
    status,
    patientId: patientId || null,
    matchMethod: match?.method || null,
    matchConfidence: match?.confidence || 0,
    personnummerMasked: parsed?.ok ? maskPersonnummer(parsed.personnummer) : '',
    signedAt: parsed?.signedAt || null,
    answerCount: parsed?.ok ? parsed.answers?.length || 0 : 0,
    parseReason: parsed?.ok ? null : parsed?.reason || null,
    error: error || null,
  };
}

/**
 * Process one HD message (body fetch + parse + match + optional PUT).
 */
async function processOneHalsoMessage({
  header,
  patients,
  dedupState,
  dedupPath,
  token = '',
  mailbox = DEFAULT_MAILBOX,
  dryRun = true,
  runId = '',
  graphToken = null,
} = {}) {
  let graphTok = graphToken;
  if (!graphTok) graphTok = await getGraphToken();

  const full = await fetchMessageBody(graphTok, mailbox, header.id);
  const rawMessage = normalizeGraphMessage(full, mailbox);
  const parsed = parseHealthDeclarationMessage(rawMessage);

  if (!parsed.ok) {
    return {
      status: 'parse_failed',
      parsed,
      match: null,
      row: summarizeResultRow({ header, parsed, status: 'parse_failed' }),
    };
  }

  const dedupKeys = buildHealthDeclarationDedupKeys(parsed, rawMessage);
  const duplicate = findDuplicateEntry(dedupState, dedupKeys);
  if (duplicate) {
    return {
      status: 'duplicate',
      parsed,
      match: null,
      dedupKey: duplicate.key,
      patientId: duplicate.entry?.patientId || null,
      row: summarizeResultRow({
        header,
        parsed,
        status: 'duplicate',
        patientId: duplicate.entry?.patientId,
      }),
    };
  }

  const match = matchPatientFromParsed(parsed, patients);
  if (match.status === 'NEEDS_REVIEW') {
    return {
      status: 'needs_review',
      parsed,
      match,
      row: summarizeResultRow({ header, parsed, match, status: 'needs_review' }),
    };
  }
  if (match.status === 'UNMATCHED') {
    return {
      status: 'unmatched',
      parsed,
      match,
      row: summarizeResultRow({ header, parsed, match, status: 'unmatched' }),
    };
  }

  if (dryRun) {
    return {
      status: 'dry_run_matched',
      parsed,
      match,
      patientId: match.patientId,
      dedupKeys,
      row: summarizeResultRow({
        header,
        parsed,
        match,
        status: 'dry_run_matched',
        patientId: match.patientId,
      }),
    };
  }

  if (!token || !match.patientId) {
    return {
      status: 'skipped_commit',
      parsed,
      match,
      row: summarizeResultRow({ header, parsed, match, status: 'skipped_commit' }),
    };
  }

  try {
    const existing = await fetchPatient(token, match.patientId);
    const healthDeclaration = buildHealthDeclarationUpsert({ parsed, match, rawMessage, runId });
    const merged = mergeHealthDeclaration(existing.healthDeclaration, healthDeclaration);
    const upsertBody = {
      ...existing,
      tenantId: existing.tenantId || TENANT_ID,
      id: match.patientId,
      healthDeclaration: merged,
      allergies: mergeAllergies(existing.allergies, parsed.allergies),
      halsoHdBackfill: {
        runId,
        matchMethod: match.method,
        importedAt: new Date().toISOString(),
      },
    };
    await putPatient(token, upsertBody);
    await recordDedupEntry(dedupPath, dedupState, dedupKeys, {
      patientId: match.patientId,
      signedAt: parsed.signedAt,
      internetMessageId: parsed.internetMessageId || rawMessage.internetMessageId || '',
      matchMethod: match.method,
    });
    return {
      status: 'put_ok',
      parsed,
      match,
      patientId: match.patientId,
      dedupKeys,
      row: summarizeResultRow({
        header,
        parsed,
        match,
        status: 'put_ok',
        patientId: match.patientId,
      }),
    };
  } catch (error) {
    return {
      status: 'put_failed',
      parsed,
      match,
      patientId: match.patientId,
      error: error.message || String(error),
      row: summarizeResultRow({
        header,
        parsed,
        match,
        status: 'put_failed',
        patientId: match.patientId,
        error: error.message || String(error),
      }),
    };
  }
}

function applyStats(stats, result) {
  stats.processed += 1;
  if (result.status === 'parse_failed') {
    stats.parseFailed += 1;
    const reason = result.parsed?.reason || 'unknown';
    stats.parseFailedByReason[reason] = (stats.parseFailedByReason[reason] || 0) + 1;
    return;
  }
  stats.parsedOk += 1;
  if (result.status === 'duplicate') {
    stats.duplicate += 1;
    return;
  }
  if (result.status === 'needs_review') {
    stats.needsReview += 1;
    return;
  }
  if (result.status === 'unmatched') {
    stats.unmatched += 1;
    return;
  }
  if (
    result.match?.status === 'MATCHED' ||
    result.status === 'dry_run_matched' ||
    result.status === 'put_ok'
  ) {
    stats.matched += 1;
    const method = result.match?.method || 'unknown';
    stats.matchedByMethod[method] = (stats.matchedByMethod[method] || 0) + 1;
  }
  if (result.status === 'put_ok') stats.putOk += 1;
  if (result.status === 'put_failed') stats.putFailed += 1;
  if (result.status === 'skipped_commit') stats.skippedCommit += 1;
  if (result.reviewQueued) stats.reviewQueued += 1;
}

function selectBatchSlice(entries, { batch = 1, batchSize = 50 } = {}) {
  const start = (Math.max(batch, 1) - 1) * batchSize;
  return entries.slice(start, start + batchSize);
}

async function runHalsoBatchIngest({
  indexEntries = [],
  batch = 1,
  batchSize = 50,
  patients = [],
  dedupPath = '',
  reviewQueuePath = '',
  dryRun = true,
  runId = '',
  token = '',
  mailbox = DEFAULT_MAILBOX,
  onProgress = null,
} = {}) {
  if (!dedupPath) throw new Error('runHalsoBatchIngest requires dedupPath');

  const slice = selectBatchSlice(indexEntries, { batch, batchSize });
  const stats = emptyBatchStats();
  const rows = [];
  const dedupState = await loadDedupState(dedupPath);
  const graphToken = await getGraphToken();

  for (let i = 0; i < slice.length; i += 1) {
    const header = slice[i];
    const result = await processOneHalsoMessage({
      header,
      patients,
      dedupState,
      dedupPath,
      token,
      mailbox,
      dryRun,
      runId,
      graphToken,
    });
    if (reviewQueuePath && ['unmatched', 'needs_review'].includes(result.status)) {
      await appendReviewQueueLine(
        reviewQueuePath,
        buildReviewQueueEntry({
          header,
          parsed: result.parsed,
          match: result.match,
          status: result.status,
          runId,
          batch,
        })
      );
      result.reviewQueued = true;
    }
    applyStats(stats, result);
    rows.push(result.row);
    if (typeof onProgress === 'function') {
      onProgress({ index: i + 1, total: slice.length, stats, last: result.row });
    }
  }

  return {
    batch,
    batchSize,
    batchCount: slice.length,
    corpusTotal: indexEntries.length,
    dryRun,
    runId,
    reviewQueuePath: reviewQueuePath || null,
    stats,
    rows,
  };
}

module.exports = {
  emptyBatchStats,
  emptyDedupState,
  selectBatchSlice,
  appendReviewQueueLine,
  buildReviewQueueEntry,
  processOneHalsoMessage,
  runHalsoBatchIngest,
  loadDedupState,
  saveDedupState,
};
