'use strict';

/**
 * Phase 1 — m365_halso PDF → parse (lokal FS) → match prod API → PUT healthDeclaration.
 * Prod asset-store saknar m365_halso — binärer läses från lokal secure storage.
 */
const {
  buildHealthDeclarationDedupKeys,
  matchPatientFromParsed,
  mergeFitnessCertificate,
  mergeHealthDeclaration,
} = require('../../src/ops/ccoHalsoHealthDeclarationIngest');
const {
  classifyHalsoFormSubject,
  parseHealthDeclarationFromText,
} = require('../../src/ops/ccoHalsoHealthDeclarationParser');
const {
  appendReviewQueueLine,
  buildReviewQueueEntry,
  loadDedupState,
  saveDedupState,
} = require('./halsoHdBatchIngest');
const { fetchPatient, putPatient, TENANT_ID } = require('./halsoHdProdClient');
const { extractPdfText } = require('./halsoHdPdfText');
const { readLocalPdfBuffer } = require('./halsoHdLocalPdfReader');

function emptyAssetStats() {
  return {
    processed: 0,
    pdfOk: 0,
    pdfFailed: 0,
    parsedOk: 0,
    parseFailed: 0,
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

function buildAssetDedupKeys(asset = {}, parsed = {}) {
  const keys = [];
  if (asset.assetId) keys.push(`phase1AssetId:${asset.assetId}`);
  if (asset.checksum) keys.push(`checksum:${asset.checksum}`);
  keys.push(...buildHealthDeclarationDedupKeys(parsed, { id: asset.assetId || '' }));
  return [...new Set(keys.filter(Boolean))];
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

function buildStructuredFormUpsert({ parsed, match, asset, runId }) {
  return {
    source: 'halso_phase1_asset',
    formType: parsed.formType || 'health_declaration',
    channel: parsed.channel || 'pdf',
    signedAt: parsed.signedAt,
    consent: parsed.consent,
    importedAt: new Date().toISOString(),
    rawMessageId: asset.assetId || '',
    subject: parsed.subject || asset.originalFileName || '',
    matchMethod: match.method,
    matchConfidence: match.confidence,
    reviewRequired: false,
    answers: parsed.answers,
    flags: parsed.flags,
    backfillRunId: runId,
    processorVersion: 'halso-hd-phase1-v1',
    phase1AssetId: asset.assetId || '',
    checksum: asset.checksum || '',
  };
}

function buildHealthDeclarationUpsert(args) {
  return buildStructuredFormUpsert(args);
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

function summarizeAssetRow({ asset, parsed, match, status, patientId, error, pdfReason }) {
  return {
    assetId: asset?.assetId || '',
    originalFileName: asset?.originalFileName || '',
    status,
    patientId: patientId || null,
    matchMethod: match?.method || null,
    matchConfidence: match?.confidence || 0,
    personnummerMasked: parsed?.ok ? maskPersonnummer(parsed.personnummer) : '',
    signedAt: parsed?.signedAt || null,
    answerCount: parsed?.ok ? parsed.answers?.length || 0 : 0,
    parseReason: parsed?.ok ? null : parsed?.reason || null,
    pdfReason: pdfReason || null,
    error: error || null,
  };
}

function buildAssetReviewQueueEntry({ asset, parsed, match, status, runId, batch }) {
  const base = buildReviewQueueEntry({
    header: {
      id: asset.assetId,
      subject: asset.originalFileName,
      receivedDateTime: asset.documentDate,
    },
    parsed,
    match,
    status,
    runId,
    batch,
  });
  return {
    ...base,
    phase: 'phase1_asset',
    assetId: asset.assetId || '',
    checksum: asset.checksum || '',
    linkedPatientId: asset.patientId || '',
  };
}

async function processOnePhase1Asset({
  asset,
  patients = [],
  dedupState,
  dedupPath,
  token = '',
  dryRun = true,
  runId = '',
  storageRoot = '',
} = {}) {
  if (!asset?.assetId) {
    return {
      status: 'pdf_failed',
      row: summarizeAssetRow({ asset, status: 'pdf_failed', pdfReason: 'missing_asset_id' }),
    };
  }

  const localPdf = await readLocalPdfBuffer(asset.storageKey, { storageRoot });
  if (!localPdf.ok) {
    return {
      status: 'pdf_failed',
      row: summarizeAssetRow({
        asset,
        status: 'pdf_failed',
        pdfReason: localPdf.reason,
        error: localPdf.error || null,
      }),
    };
  }

  const pdf = await extractPdfText(localPdf.buffer);
  if (!pdf.ok) {
    return {
      status: 'pdf_failed',
      row: summarizeAssetRow({ asset, status: 'pdf_failed', pdfReason: pdf.reason }),
    };
  }

  const subjectHint =
    asset.metadata?.subject || asset.originalFileName || asset.originalDrivePath || '';
  const parsed = parseHealthDeclarationFromText(pdf.text, {
    subject: subjectHint,
    receivedAt: asset.documentDate || '',
    id: asset.assetId,
  });
  if (parsed.ok && !parsed.formType) {
    parsed.formType = classifyHalsoFormSubject(subjectHint) || 'health_declaration';
  }

  if (!parsed.ok) {
    return {
      status: 'parse_failed',
      parsed,
      row: summarizeAssetRow({ asset, parsed, status: 'parse_failed' }),
    };
  }

  const dedupKeys = buildAssetDedupKeys(asset, parsed);
  const duplicate = findDuplicateEntry(dedupState, dedupKeys);
  if (duplicate) {
    return {
      status: 'duplicate',
      parsed,
      patientId: duplicate.entry?.patientId || null,
      row: summarizeAssetRow({
        asset,
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
      row: summarizeAssetRow({ asset, parsed, match, status: 'needs_review' }),
    };
  }
  if (match.status === 'UNMATCHED') {
    return {
      status: 'unmatched',
      parsed,
      match,
      row: summarizeAssetRow({ asset, parsed, match, status: 'unmatched' }),
    };
  }

  if (dryRun) {
    return {
      status: 'dry_run_matched',
      parsed,
      match,
      patientId: match.patientId,
      dedupKeys,
      row: summarizeAssetRow({
        asset,
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
      row: summarizeAssetRow({ asset, parsed, match, status: 'skipped_commit' }),
    };
  }

  try {
    const existing = await fetchPatient(token, match.patientId);
    const structuredForm = buildStructuredFormUpsert({ parsed, match, asset, runId });
    const payload = {
      ...existing,
      tenantId: existing.tenantId || TENANT_ID,
      id: match.patientId,
      halsoHdBackfill: {
        runId,
        phase: 'phase1_asset',
        assetId: asset.assetId,
        formType: parsed.formType || 'health_declaration',
        matchMethod: match.method,
        importedAt: new Date().toISOString(),
      },
    };
    if (parsed.formType === 'fitness_certificate') {
      payload.fitnessCertificate = mergeFitnessCertificate(
        existing.fitnessCertificate,
        structuredForm
      );
    } else {
      payload.healthDeclaration = mergeHealthDeclaration(
        existing.healthDeclaration,
        structuredForm
      );
      payload.allergies = mergeAllergies(existing.allergies, parsed.allergies);
    }
    await putPatient(token, payload);
    await recordDedupEntry(dedupPath, dedupState, dedupKeys, {
      patientId: match.patientId,
      assetId: asset.assetId,
      signedAt: parsed.signedAt,
      matchMethod: match.method,
    });
    return {
      status: 'put_ok',
      parsed,
      match,
      patientId: match.patientId,
      dedupKeys,
      row: summarizeAssetRow({
        asset,
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
      row: summarizeAssetRow({
        asset,
        parsed,
        match,
        status: 'put_failed',
        patientId: match.patientId,
        error: error.message || String(error),
      }),
    };
  }
}

function applyAssetStats(stats, result) {
  stats.processed += 1;
  if (result.status === 'pdf_failed') {
    stats.pdfFailed += 1;
    return;
  }
  stats.pdfOk += 1;
  if (result.status === 'parse_failed') {
    stats.parseFailed += 1;
    return;
  }
  stats.parsedOk += 1;
  if (result.status === 'duplicate') {
    stats.duplicate += 1;
    return;
  }
  if (result.status === 'needs_review') {
    stats.needsReview += 1;
    if (result.reviewQueued) stats.reviewQueued += 1;
    return;
  }
  if (result.status === 'unmatched') {
    stats.unmatched += 1;
    if (result.reviewQueued) stats.reviewQueued += 1;
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

async function runPhase1AssetBatchIngest({
  catalogEntries = [],
  batch = 1,
  batchSize = 50,
  patients = [],
  dedupPath = '',
  reviewQueuePath = '',
  dryRun = true,
  runId = '',
  token = '',
  storageRoot = '',
  onProgress = null,
} = {}) {
  if (!dedupPath) throw new Error('runPhase1AssetBatchIngest requires dedupPath');

  const slice = selectBatchSlice(catalogEntries, { batch, batchSize });
  const stats = emptyAssetStats();
  const rows = [];
  const dedupState = await loadDedupState(dedupPath);

  for (let i = 0; i < slice.length; i += 1) {
    const asset = slice[i];
    const result = await processOnePhase1Asset({
      asset,
      patients,
      dedupState,
      dedupPath,
      token,
      dryRun,
      runId,
      storageRoot,
    });
    if (reviewQueuePath && ['unmatched', 'needs_review'].includes(result.status)) {
      await appendReviewQueueLine(
        reviewQueuePath,
        buildAssetReviewQueueEntry({
          asset,
          parsed: result.parsed,
          match: result.match,
          status: result.status,
          runId,
          batch,
        })
      );
      result.reviewQueued = true;
    }
    applyAssetStats(stats, result);
    rows.push(result.row);
    if (typeof onProgress === 'function') {
      onProgress({ index: i + 1, total: slice.length, stats, last: result.row });
    }
  }

  return {
    batch,
    batchSize,
    batchCount: slice.length,
    catalogTotal: catalogEntries.length,
    dryRun,
    runId,
    reviewQueuePath: reviewQueuePath || null,
    stats,
    rows,
  };
}

module.exports = {
  emptyAssetStats,
  selectBatchSlice,
  buildAssetDedupKeys,
  processOnePhase1Asset,
  runPhase1AssetBatchIngest,
};
