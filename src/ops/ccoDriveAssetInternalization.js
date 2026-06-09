'use strict';

const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

function isRetryableDriveError(error = {}) {
  const code = Number(error.code || error.status || error.statusCode || 0);
  if (code === 429 || (code >= 500 && code < 600)) return true;
  const message = normalizeText(error.message).toLowerCase();
  return /rate|quota|timeout|temporar|econnreset|etimedout/.test(message);
}

async function withDriveRetry(
  operation,
  { attempts = 4, baseDelayMs = 250, maxDelayMs = 5000 } = {}
) {
  const totalAttempts = Math.max(1, Number(attempts) || 1);
  const baseDelay = Math.max(0, Number(baseDelayMs) || 0);
  const maxDelay = Math.max(baseDelay, Number(maxDelayMs) || baseDelay);
  let lastError = null;
  for (let index = 0; index < totalAttempts; index += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (index >= totalAttempts - 1 || !isRetryableDriveError(error)) break;
      const delay = Math.min(maxDelay, baseDelay * 2 ** index);
      if (delay > 0) await sleep(delay);
    }
  }
  throw lastError;
}

function maskValue(value = '', { keepStart = 2, keepEnd = 2 } = {}) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= keepStart + keepEnd) return '*'.repeat(text.length);
  return `${text.slice(0, keepStart)}***${text.slice(-keepEnd)}`;
}

function mimeFamily(mimeType = '', fileName = '') {
  const mime = normalizeText(mimeType).toLowerCase();
  const name = normalizeText(fileName).toLowerCase();
  if (mime.startsWith('image/')) return 'images';
  if (mime === 'application/pdf' || /\.(pdf|doc|docx)$/i.test(name)) return 'documents';
  return 'other';
}

const MONTH_WORD_RE =
  /\b(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|dec)\b/i;

function extractMonthFolder(originalDrivePath = '') {
  const segments = normalizeText(originalDrivePath)
    .split('/')
    .map((segment) => normalizeText(segment))
    .filter(Boolean);
  return (
    segments.find((segment) => MONTH_WORD_RE.test(segment) && /20\d{2}/.test(segment)) ||
    'unknown_month'
  );
}

function normalizeDriveAssetRow(input = {}) {
  const file = input.file && typeof input.file === 'object' ? input.file : input;
  const relativePath =
    normalizeText(file.relativePath) ||
    normalizeText(file.path) ||
    normalizeText(file.originalDrivePath) ||
    normalizeText(file.fullPath);
  const fileName =
    normalizeText(file.fileName) ||
    normalizeText(file.name) ||
    normalizeText(file.originalFileName) ||
    path.basename(relativePath || '');
  const driveFileId = normalizeText(file.driveFileId) || normalizeText(file.originalDriveFileId);
  const sourceRecordId =
    normalizeText(file.sourceRecordId) ||
    normalizeText(file.id) ||
    normalizeText(input.sourceRecordId) ||
    driveFileId;

  return {
    sourceRecordId,
    driveFileId,
    patientId:
      normalizeText(input.patientId) ||
      normalizeText(file.patientId) ||
      normalizeText(file.ccoPatientId),
    originalDrivePath: relativePath,
    originalFileName: fileName,
    mimeType: normalizeText(file.mimeType) || 'application/octet-stream',
    documentDate:
      normalizeText(input.documentDate) ||
      normalizeText(file.documentDate) ||
      normalizeText(file.modifiedTime).slice(0, 10) ||
      null,
    fileType: normalizeText(file.fileType),
    modifiedTime: normalizeText(file.modifiedTime),
    _raw: input,
  };
}

function isInternalizedAsset(asset = {}) {
  if (!asset) return false;
  if (!asset.storageKey || asset.storageKey === 'pending-no-binary') return false;
  if (!asset.checksum) return false;
  if (!(Number(asset.fileSize) > 0)) return false;
  if (asset.status === 'FAILED_IMPORT' || asset.status === 'LINK_ONLY_BLOCKER') return false;
  return true;
}

function buildExistingAssetIndex(assetStore) {
  const items =
    typeof assetStore?.listItemsForEnrichment === 'function'
      ? assetStore.listItemsForEnrichment()
      : [];
  const byDriveFileId = new Map();
  const bySourceRecordId = new Map();
  for (const asset of asArray(items)) {
    if (!isInternalizedAsset(asset)) continue;
    const driveFileId = normalizeText(asset.originalDriveFileId);
    const sourceRecordId = normalizeText(asset.sourceRecordId);
    if (driveFileId && !byDriveFileId.has(driveFileId)) byDriveFileId.set(driveFileId, asset);
    if (sourceRecordId && !bySourceRecordId.has(sourceRecordId)) {
      bySourceRecordId.set(sourceRecordId, asset);
    }
  }
  return { byDriveFileId, bySourceRecordId };
}

function findExistingInternalAsset(row, index) {
  if (row.driveFileId && index.byDriveFileId.has(row.driveFileId)) {
    return index.byDriveFileId.get(row.driveFileId);
  }
  if (row.sourceRecordId && index.bySourceRecordId.has(row.sourceRecordId)) {
    return index.bySourceRecordId.get(row.sourceRecordId);
  }
  return null;
}

function inventoryDriveAssets({ rows = [], assetStore = null, sampleSize = 5 } = {}) {
  const index = buildExistingAssetIndex(assetStore);
  const seenDrive = new Map();
  const reportRows = asArray(rows).map(normalizeDriveAssetRow);
  const samples = [];
  const stats = {
    scanned: 0,
    eligible: 0,
    alreadyInternal: 0,
    remaining: 0,
    missingDriveFileId: 0,
    missingPatientId: 0,
    reviewQueued: 0,
    duplicateInputDriveFileIds: 0,
    byFamily: { documents: 0, images: 0, other: 0 },
    byMonthFolder: {},
  };
  const remainingRows = [];

  for (const row of reportRows) {
    stats.scanned += 1;
    stats.byFamily[mimeFamily(row.mimeType, row.originalFileName)] += 1;
    const monthFolder = extractMonthFolder(row.originalDrivePath);
    if (!stats.byMonthFolder[monthFolder]) {
      stats.byMonthFolder[monthFolder] = {
        scanned: 0,
        alreadyInternal: 0,
        remaining: 0,
        reviewQueued: 0,
      };
    }
    stats.byMonthFolder[monthFolder].scanned += 1;
    if (!row.driveFileId) {
      stats.missingDriveFileId += 1;
      stats.reviewQueued += 1;
      stats.byMonthFolder[monthFolder].reviewQueued += 1;
      continue;
    }
    if (seenDrive.has(row.driveFileId)) {
      stats.duplicateInputDriveFileIds += 1;
    } else {
      seenDrive.set(row.driveFileId, true);
    }
    if (!row.patientId) {
      stats.missingPatientId += 1;
      stats.reviewQueued += 1;
      stats.byMonthFolder[monthFolder].reviewQueued += 1;
      continue;
    }
    stats.eligible += 1;
    const existing = findExistingInternalAsset(row, index);
    if (existing) {
      stats.alreadyInternal += 1;
      stats.byMonthFolder[monthFolder].alreadyInternal += 1;
      if (samples.length < sampleSize) {
        samples.push({
          decision: 'already_internal',
          patientId: maskValue(row.patientId, { keepStart: 4, keepEnd: 4 }),
          driveRef: maskValue(row.driveFileId, { keepStart: 4, keepEnd: 4 }),
          name: maskValue(row.originalFileName, { keepStart: 1, keepEnd: 1 }),
          assetId: maskValue(existing.id, { keepStart: 4, keepEnd: 4 }),
        });
      }
      continue;
    }
    stats.remaining += 1;
    stats.byMonthFolder[monthFolder].remaining += 1;
    remainingRows.push(row);
    if (samples.length < sampleSize) {
      samples.push({
        decision: 'would_internalize',
        patientId: maskValue(row.patientId, { keepStart: 4, keepEnd: 4 }),
        driveRef: maskValue(row.driveFileId, { keepStart: 4, keepEnd: 4 }),
        name: maskValue(row.originalFileName, { keepStart: 1, keepEnd: 1 }),
        family: mimeFamily(row.mimeType, row.originalFileName),
      });
    }
  }

  return {
    generatedAt: nowIso(),
    dryRun: true,
    zeroWrites: true,
    model:
      'Drive → ccoPatientAssetStore · existing patient only · idempotent by driveFileId/sourceRecordId',
    stats,
    samples,
    remainingRows,
  };
}

const MONTH_NUM = {
  januari: 1,
  februari: 2,
  mars: 3,
  april: 4,
  maj: 5,
  juni: 6,
  juli: 7,
  augusti: 8,
  september: 9,
  oktober: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  okt: 10,
  nov: 11,
  dec: 12,
};

// Behandlingstyper i prioritetsordning (längre/specifika först så "op" inte matchar fel).
const TREATMENT_TYPES = [
  { needle: 'microneedling', canon: 'Microneedling', word: false },
  { needle: 'konsult', canon: 'Konsultation', word: false },
  { needle: 'prp', canon: 'PRP', word: true },
  { needle: 'dhi', canon: 'DHI', word: true },
  { needle: 'fue', canon: 'FUE', word: true },
  { needle: 'op', canon: 'OP', word: true },
];

// Härled besöksdatum + behandlingstyp/session ur Drive-mappnamnet (ORD-41).
// Datum: ISO i path → månadsnamn+dag → unix-epoch i filnamnet. Drive-tid sätts av anroparen sist.
function parseFolderEncounter(originalDrivePath = '', originalFileName = '') {
  const segments = normalizeText(originalDrivePath)
    .split('/')
    .map((segment) => normalizeText(segment))
    .filter(Boolean);
  // Filens förälder-mapp (encounter-mappen), annars sista segmentet.
  const folder = segments.length >= 2 ? segments[segments.length - 2] : segments[0] || '';

  let documentDate = null;
  let documentDateSource = null;

  // 1) ISO-datum i path-segment, närmast filen först: "...-2025-12-18 PRP 3".
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const iso = segments[i].match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      documentDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
      documentDateSource = 'folder_iso';
      break;
    }
  }

  // 2) Månadsnamn + år + dag fördelat på två mappar: "April 2026" / "April 5".
  if (!documentDate) {
    let monthV = null;
    let yearV = null;
    let dayV = null;
    for (const seg of segments) {
      const mw = seg.match(MONTH_WORD_RE);
      if (!mw) continue;
      const mnum = MONTH_NUM[mw[1].toLowerCase()] || null;
      const yr = seg.match(/\b(20\d{2})\b/);
      const dy = seg.match(/\b(\d{1,2})\b(?!\d)/);
      if (yr) {
        yearV = yr[1];
        monthV = monthV || mnum;
      } else if (dy && Number(dy[1]) >= 1 && Number(dy[1]) <= 31) {
        monthV = monthV || mnum;
        dayV = dy[1];
      }
    }
    if (yearV && monthV && dayV) {
      documentDate = `${yearV}-${String(monthV).padStart(2, '0')}-${String(dayV).padStart(2, '0')}`;
      documentDateSource = 'folder_month';
    }
  }

  // 3) Unix-epoch i filnamnet: "Hälsodeklaration-...-1766080815-4262.pdf".
  if (!documentDate) {
    const em = normalizeText(originalFileName).match(/-(\d{10})-/);
    if (em) {
      const dt = new Date(Number(em[1]) * 1000);
      if (!Number.isNaN(dt.getTime())) {
        documentDate = dt.toISOString().slice(0, 10);
        documentDateSource = 'filename_epoch';
      }
    }
  }

  // Behandlingstyp + session ur encounter-mappnamnet.
  let treatmentType = null;
  let sessionNumber = null;
  let visitLabel = null;
  for (const t of TREATMENT_TYPES) {
    const re = t.word ? new RegExp(`\\b${t.needle}\\b`, 'i') : new RegExp(t.needle, 'i');
    if (re.test(folder)) {
      treatmentType = t.canon;
      const sm = folder.match(new RegExp(`${t.needle}\\s*(\\d+)`, 'i'));
      if (sm) sessionNumber = Number(sm[1]);
      visitLabel = sessionNumber ? `${t.canon} ${sessionNumber}` : t.canon;
      break;
    }
  }

  return { documentDate, documentDateSource, treatmentType, sessionNumber, visitLabel };
}

async function resolveDriveFileMetadata(row, driveClient) {
  let name = row.originalFileName;
  let driveDate = null;
  if (typeof driveClient?.getFileMetadata === 'function') {
    const metadata = await driveClient.getFileMetadata(row.driveFileId);
    name = normalizeText(metadata?.name) || row.originalFileName;
    driveDate =
      normalizeText(metadata?.modifiedTime).slice(0, 10) ||
      normalizeText(metadata?.createdTime).slice(0, 10) ||
      null;
  } else if (typeof driveClient?.getDriveFileName === 'function') {
    const result = await driveClient.getDriveFileName(row.driveFileId);
    name = normalizeText(result?.name) || row.originalFileName;
  }

  const enc = parseFolderEncounter(row.originalDrivePath, name);
  let documentDate = enc.documentDate;
  let documentDateSource = enc.documentDateSource;
  if (!documentDate) {
    if (row.documentDate) {
      documentDate = row.documentDate;
      documentDateSource = 'row';
    } else if (driveDate) {
      documentDate = driveDate;
      documentDateSource = 'drive_modified';
    }
  }

  return {
    name,
    documentDate: documentDate || null,
    documentDateSource: documentDateSource || null,
    treatmentType: enc.treatmentType || null,
    sessionNumber: enc.sessionNumber || null,
    visitLabel: enc.visitLabel || null,
  };
}

async function downloadDriveFile(row, driveClient) {
  if (typeof driveClient?.downloadBuffer === 'function') {
    return driveClient.downloadBuffer(row.driveFileId);
  }
  throw new Error('driveClient.downloadBuffer krävs för commit.');
}

async function internalizeDriveAssets({
  rows = [],
  assetStore,
  importRunStore,
  reviewQueueStore,
  pipeline,
  driveClient,
  dryRun = true,
  go = false,
  limit = 0,
  offset = 0,
  sampleSize = 5,
  driveRetryAttempts = 4,
  driveRetryBaseDelayMs = 250,
  driveRetryMaxDelayMs = 5000,
  driveThrottleMs = 0,
  concurrency = 1,
  tenantId = 'hair-tp-clinic',
  actor = { role: 'system', userId: 'ord-34-drive-internalize', tenantId },
} = {}) {
  if (!assetStore) throw new Error('assetStore krävs.');
  const inventory = inventoryDriveAssets({ rows, assetStore, sampleSize });
  if (dryRun) return inventory;
  if (!go) throw new Error('commit kräver go=true.');
  if (!importRunStore) throw new Error('importRunStore krävs för commit.');
  if (!reviewQueueStore) throw new Error('reviewQueueStore krävs för commit.');
  if (!pipeline || typeof pipeline.importSingleAsset !== 'function') {
    throw new Error('pipeline.importSingleAsset krävs för commit.');
  }

  const start = Math.max(0, Number(offset) || 0);
  const cap = Math.max(0, Number(limit) || 0);
  const batch = inventory.remainingRows.slice(start, cap > 0 ? start + cap : undefined);
  const runId = await importRunStore.startRun(
    { sourceSystem: 'drive_import', mode: 'full', createdBy: actor.userId || 'system' },
    { actor }
  );
  const stats = {
    scanned: inventory.stats.scanned,
    alreadyInternal: inventory.stats.alreadyInternal,
    batchSize: batch.length,
    attempted: 0,
    imported: 0,
    needsReview: 0,
    duplicate: 0,
    failed: 0,
    skipped: inventory.stats.reviewQueued,
  };
  const samples = [];
  const errors = [];

  const processRow = async (row) => {
    stats.attempted += 1;
    try {
      if (driveThrottleMs > 0 && stats.attempted > 1) await sleep(driveThrottleMs);
      const retryOptions = {
        attempts: driveRetryAttempts,
        baseDelayMs: driveRetryBaseDelayMs,
        maxDelayMs: driveRetryMaxDelayMs,
      };
      const driveMetadata = await withDriveRetry(
        () => resolveDriveFileMetadata(row, driveClient),
        retryOptions
      );
      const body = await withDriveRetry(() => downloadDriveFile(row, driveClient), retryOptions);
      const result = await pipeline.importSingleAsset({
        sourceSystem: 'drive_import',
        importRunId: runId,
        tenantId,
        actor,
        sourceRecord: {
          patientId: row.patientId,
          sourceRecordId: row.sourceRecordId,
          originalDriveFileId: row.driveFileId,
          originalDrivePath: row.originalDrivePath,
          originalFileName: driveMetadata.name,
          mimeType: row.mimeType,
          documentDate: driveMetadata.documentDate,
          documentDateSource: driveMetadata.documentDateSource,
          treatmentType: driveMetadata.treatmentType,
          sessionNumber: driveMetadata.sessionNumber,
          visitLabel: driveMetadata.visitLabel,
          body,
        },
      });
      if (result.status === 'DUPLICATE') stats.duplicate += 1;
      else if (result.status === 'NEEDS_REVIEW') stats.needsReview += 1;
      else stats.imported += 1;
      if (samples.length < sampleSize) {
        samples.push({
          decision: result.status,
          patientId: maskValue(row.patientId, { keepStart: 4, keepEnd: 4 }),
          driveRef: maskValue(row.driveFileId, { keepStart: 4, keepEnd: 4 }),
          assetId: maskValue(result.asset?.id, { keepStart: 4, keepEnd: 4 }),
          name: maskValue(driveMetadata.name, { keepStart: 1, keepEnd: 1 }),
          documentDate: driveMetadata.documentDate,
          documentDateSource: driveMetadata.documentDateSource,
          treatmentType: driveMetadata.treatmentType,
          sessionNumber: driveMetadata.sessionNumber,
          visitLabel: driveMetadata.visitLabel,
        });
      }
    } catch (error) {
      stats.failed += 1;
      errors.push({
        driveRef: maskValue(row.driveFileId, { keepStart: 4, keepEnd: 4 }),
        code: normalizeText(error.code),
        message: error.message,
      });
    }
  };

  // Concurrency-pool: kör N rader parallellt (default 1 = serie, oförändrat).
  // Säkert i single-process: delad konsekvent in-memory-store + atomiska
  // helstate-skrivningar (temp+rename) → last-write-wins men alltid komplett.
  const poolSize = Math.max(1, Number(concurrency) || 1);
  let __idx = 0;
  await Promise.all(
    Array.from({ length: poolSize }, async () => {
      for (;;) {
        const i = __idx;
        __idx += 1;
        if (i >= batch.length) break;
        await processRow(batch[i]);
      }
    })
  );

  const run = await importRunStore.finishRun(runId, { actor });
  return {
    generatedAt: nowIso(),
    dryRun: false,
    zeroWrites: false,
    tenantId,
    runId,
    run,
    stats,
    samples,
    errors,
  };
}

module.exports = {
  buildExistingAssetIndex,
  findExistingInternalAsset,
  internalizeDriveAssets,
  inventoryDriveAssets,
  isInternalizedAsset,
  maskValue,
  mimeFamily,
  extractMonthFolder,
  normalizeDriveAssetRow,
  parseFolderEncounter,
};
