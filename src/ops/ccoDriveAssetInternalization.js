'use strict';

const path = require('node:path');

const { stableEncounterId } = require('./ccoAssetNaming/encounterMapper');

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

async function assetBlobVerifiedOnStorage(asset = {}, storage = null) {
  if (!isInternalizedAsset(asset)) return false;
  if (!storage || typeof storage.exists !== 'function') return true;
  const storageKey = normalizeText(asset.storageKey);
  if (!storageKey) return false;
  try {
    return await storage.exists(storageKey);
  } catch {
    return false;
  }
}

function collectPatientMasterDriveRows(state = {}, tenantId = 'hair-tp-clinic') {
  const tenant = state.tenants?.[tenantId];
  const rows = [];
  for (const patient of asArray(tenant?.patients)) {
    const attachments = asArray(patient.drive?.attachments);
    for (const file of attachments) {
      rows.push({ patientId: patient.id, file });
    }
  }
  return rows;
}

async function collectDriveRowsFromAssetStore(
  assetStore,
  { storage = null, tenantId = null } = {}
) {
  const items =
    typeof assetStore?.listItemsForEnrichment === 'function'
      ? assetStore.listItemsForEnrichment(tenantId)
      : [];
  const rows = [];
  for (const asset of asArray(items)) {
    const driveFileId = normalizeText(asset.originalDriveFileId);
    if (!driveFileId) continue;
    const patientId = normalizeText(asset.patientId);
    if (!patientId || patientId === 'unknown') continue;
    if (await assetBlobVerifiedOnStorage(asset, storage)) continue;
    rows.push({
      patientId,
      file: {
        driveFileId,
        originalDriveFileId: driveFileId,
        originalDrivePath: asset.originalDrivePath || null,
        originalFileName: asset.originalFileName || null,
        mimeType: asset.mimeType || null,
        sourceRecordId: normalizeText(asset.sourceRecordId) || asset.id,
        id: asset.id,
      },
      documentDate: asset.documentDate || null,
    });
  }
  return rows;
}

function mergeDriveRows(...sources) {
  const byDriveFileId = new Map();
  for (const source of sources) {
    for (const row of asArray(source)) {
      const normalized = normalizeDriveAssetRow(row);
      if (!normalized.driveFileId) continue;
      if (!byDriveFileId.has(normalized.driveFileId))
        byDriveFileId.set(normalized.driveFileId, row);
    }
  }
  return Array.from(byDriveFileId.values());
}

async function collectDriveRowsForInternalization({
  patientMasterState = null,
  assetStore = null,
  storage = null,
  tenantId = 'hair-tp-clinic',
} = {}) {
  const pmRows = patientMasterState
    ? collectPatientMasterDriveRows(patientMasterState, tenantId)
    : [];
  const assetRows = assetStore
    ? await collectDriveRowsFromAssetStore(assetStore, { storage, tenantId })
    : [];
  return {
    rows: mergeDriveRows(pmRows, assetRows),
    rowSources: {
      patientMasterAttachments: pmRows.length,
      assetStoreDriveIds: assetRows.length,
    },
  };
}

async function buildExistingAssetIndex(assetStore, storage = null) {
  const items =
    typeof assetStore?.listItemsForEnrichment === 'function'
      ? assetStore.listItemsForEnrichment()
      : [];
  const byDriveFileId = new Map();
  const bySourceRecordId = new Map();
  for (const asset of asArray(items)) {
    if (!(await assetBlobVerifiedOnStorage(asset, storage))) continue;
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

async function inventoryDriveAssets({
  rows = [],
  assetStore = null,
  storage = null,
  sampleSize = 5,
} = {}) {
  const index = await buildExistingAssetIndex(assetStore, storage);
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

const TREATMENT_ENCOUNTER_TYPES = Object.freeze({
  DHI: 'transplant_dhi',
  FUE: 'transplant_fue',
  Konsultation: 'consultation',
  Microneedling: 'microneedling',
  OP: 'other',
  PRP: 'prp_hair',
});

const ENCOUNTER_DATE_SOURCES = new Set(['folder_iso', 'folder_month', 'filename_epoch', 'row']);

function buildDriveEncounterFields({ patientId, documentDate, documentDateSource, enc = {} } = {}) {
  const pid = normalizeText(patientId);
  const date = normalizeText(documentDate);
  const treatmentType = normalizeText(enc.treatmentType);
  if (!pid || !date || !treatmentType || !ENCOUNTER_DATE_SOURCES.has(documentDateSource)) {
    return { encounterId: null, encounterType: null };
  }
  const encounterType = TREATMENT_ENCOUNTER_TYPES[treatmentType] || 'other';
  return {
    encounterId: stableEncounterId({
      patientId: pid,
      date,
      encounterType,
      sessionNumber: enc.sessionNumber || null,
    }),
    encounterType,
  };
}

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

  const encounter = buildDriveEncounterFields({
    patientId: row.patientId,
    documentDate,
    documentDateSource,
    enc,
  });

  return {
    name,
    documentDate: documentDate || null,
    documentDateSource: documentDateSource || null,
    encounterId: encounter.encounterId,
    encounterType: encounter.encounterType,
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

function filterInternalizeRemainingRows(
  remainingRows = [],
  {
    excludeUnknownMonth = true,
    requireDocumentDateSource = false,
    allowedDocumentDateSources = null,
  } = {}
) {
  const resolvedAllowedSources = resolveAllowedDocumentDateSources({
    requireDocumentDateSource,
    allowedDocumentDateSources,
  });
  const paired = asArray(remainingRows).map((row, index) => ({
    row,
    preview: buildInternalizeCandidatePreviewRow(row, index),
  }));
  let filtered = paired;
  if (excludeUnknownMonth) {
    filtered = filtered.filter(({ preview }) => preview.calendarBucketClear);
  }
  if (resolvedAllowedSources) {
    filtered = filtered.filter(({ preview }) =>
      matchesDocumentDateSourceGate(preview, resolvedAllowedSources)
    );
  }
  return { filtered, resolvedAllowedSources };
}

function selectInternalizeBatchRows(
  remainingRows = [],
  {
    offset = 0,
    limit = 0,
    excludeUnknownMonth = true,
    requireDocumentDateSource = false,
    allowedDocumentDateSources = null,
  } = {}
) {
  const { filtered, resolvedAllowedSources } = filterInternalizeRemainingRows(remainingRows, {
    excludeUnknownMonth,
    requireDocumentDateSource,
    allowedDocumentDateSources,
  });
  const start = Math.max(0, Number(offset) || 0);
  const cap = Math.max(0, Number(limit) || 0);
  const slice = filtered.slice(start, cap > 0 ? start + cap : undefined);
  return {
    batch: slice.map((item) => item.row),
    batchPreviews: slice.map((item) => item.preview),
    resolvedAllowedSources,
    filteredCount: filtered.length,
  };
}

function buildGatedBatchMeta(
  selection = {},
  { offset = 0, limit = 0, excludeUnknownMonth = true } = {}
) {
  return {
    documentDateSourceGate: selection.resolvedAllowedSources
      ? { allowedDocumentDateSources: selection.resolvedAllowedSources }
      : null,
    excludeUnknownMonth,
    offset: Math.max(0, Number(offset) || 0),
    limit: Math.max(0, Number(limit) || 0),
    filteredRemaining: selection.filteredCount || 0,
    batchSize: selection.batch?.length || 0,
    documentDateSources: (selection.batchPreviews || []).map(
      (preview) => preview.documentDateSource
    ),
    candidates: selection.batchPreviews || [],
  };
}

async function internalizeDriveAssets({
  rows = [],
  assetStore,
  importRunStore,
  reviewQueueStore,
  pipeline,
  storage = null,
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
  dateGateActive = false,
  excludeUnknownMonth = true,
  requireDocumentDateSource = false,
  allowedDocumentDateSources = null,
} = {}) {
  if (!assetStore) throw new Error('assetStore krävs.');
  const inventory = await inventoryDriveAssets({ rows, assetStore, storage, sampleSize });
  const dateGateOpts = dateGateActive
    ? { excludeUnknownMonth, requireDocumentDateSource, allowedDocumentDateSources }
    : null;
  let batch;
  let gatedBatch = null;
  if (dateGateActive) {
    const selection = selectInternalizeBatchRows(inventory.remainingRows, {
      offset,
      limit,
      ...dateGateOpts,
    });
    batch = selection.batch;
    gatedBatch = buildGatedBatchMeta(selection, {
      offset,
      limit,
      excludeUnknownMonth,
    });
  } else {
    const start = Math.max(0, Number(offset) || 0);
    const cap = Math.max(0, Number(limit) || 0);
    batch = inventory.remainingRows.slice(start, cap > 0 ? start + cap : undefined);
  }
  if (dryRun) {
    if (gatedBatch) {
      return { ...inventory, gatedBatch };
    }
    return inventory;
  }
  if (!go) throw new Error('commit kräver go=true.');
  if (!importRunStore) throw new Error('importRunStore krävs för commit.');
  if (!reviewQueueStore) throw new Error('reviewQueueStore krävs för commit.');
  if (!pipeline || typeof pipeline.importSingleAsset !== 'function') {
    throw new Error('pipeline.importSingleAsset krävs för commit.');
  }
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
          encounterId: driveMetadata.encounterId,
          encounterType: driveMetadata.encounterType,
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
          encounterId: maskValue(driveMetadata.encounterId, { keepStart: 4, keepEnd: 4 }),
          encounterType: driveMetadata.encounterType,
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
  if (typeof assetStore.beginBatch === 'function') assetStore.beginBatch();
  try {
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
  } finally {
    // Skriv index 1× för hela chunken (även vid fel) → storen lämnas aldrig i batch-läge.
    if (typeof assetStore.flushBatch === 'function') await assetStore.flushBatch();
  }

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
    gatedBatch,
  };
}

const UNKNOWN_MONTH_BUCKET = 'unknown_month';

const PILOT_STRONG_DOCUMENT_DATE_SOURCES = Object.freeze([
  'folder_iso',
  'folder_month',
  'filename_epoch',
  'row',
]);

function resolveAllowedDocumentDateSources({
  requireDocumentDateSource = false,
  allowedDocumentDateSources = null,
} = {}) {
  const explicit = asArray(allowedDocumentDateSources)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  if (explicit.length > 0) return explicit;
  if (requireDocumentDateSource) return [...PILOT_STRONG_DOCUMENT_DATE_SOURCES];
  return null;
}

function evaluatePilotWindowFailure(
  previewSlice = [],
  { allowedDocumentDateSources = null, requireCalendarClear = true } = {}
) {
  for (const preview of asArray(previewSlice)) {
    if (requireCalendarClear && !preview.calendarBucketClear) {
      return {
        reason: 'unknown_month',
        failingRemainingOffset: preview.remainingOffset,
        monthFolder: preview.monthFolder,
        documentDateSource: preview.documentDateSource,
      };
    }
    if (
      allowedDocumentDateSources &&
      !allowedDocumentDateSources.includes(preview.documentDateSource)
    ) {
      return {
        reason: 'weak_document_date_source',
        failingRemainingOffset: preview.remainingOffset,
        monthFolder: preview.monthFolder,
        documentDateSource: preview.documentDateSource,
      };
    }
  }
  return null;
}

function buildInternalizeCandidatePreviewRow(row, remainingOffset) {
  const normalized = normalizeDriveAssetRow(row);
  const enc = parseFolderEncounter(normalized.originalDrivePath, normalized.originalFileName);
  let documentDateSource = enc.documentDateSource;
  const documentDate = enc.documentDate || normalized.documentDate || null;
  if (!documentDateSource && documentDate) documentDateSource = 'row';
  const monthFolder = extractMonthFolder(normalized.originalDrivePath);
  return {
    remainingOffset,
    monthFolder,
    calendarBucketClear: monthFolder !== UNKNOWN_MONTH_BUCKET,
    documentDateSource: documentDateSource || 'none',
    documentDate,
    family: mimeFamily(normalized.mimeType, normalized.originalFileName),
    fileName: maskValue(normalized.originalFileName, { keepStart: 1, keepEnd: 1 }),
    driveRef: maskValue(normalized.driveFileId, { keepStart: 4, keepEnd: 4 }),
  };
}

function findConsecutivePilotWindow(remainingRows = [], windowSize = 10, options = {}) {
  const previewAll = asArray(remainingRows).map((row, index) =>
    typeof row?.remainingOffset === 'number' && typeof row?.monthFolder === 'string'
      ? row
      : buildInternalizeCandidatePreviewRow(row, index)
  );
  return buildPilotWindowSearch(previewAll, windowSize, options).pilotWindow;
}

function buildPilotWindowSearch(previewAll = [], windowSize = 10, options = {}) {
  const size = Math.max(1, Number(windowSize) || 10);
  const rows = asArray(previewAll);
  const allowedDocumentDateSources = resolveAllowedDocumentDateSources(options);
  const requireCalendarClear = options.requireCalendarClear !== false;
  const maxSkipSamples = Math.max(1, Math.min(50, Number(options.maxSkipSamples) || 20));
  const skipReasonCounts = { unknown_month: 0, weak_document_date_source: 0 };
  const skippedSamples = [];
  const windowsScanned = rows.length >= size ? Math.max(0, rows.length - size + 1) : 0;

  if (rows.length < size) {
    return {
      pilotWindow: null,
      search: {
        allowedDocumentDateSources,
        requireDocumentDateSource: Boolean(options.requireDocumentDateSource),
        skipReasonCounts,
        skippedSamples,
        windowsScanned: 0,
        matchedAtOffset: null,
      },
    };
  }

  for (let offset = 0; offset <= rows.length - size; offset += 1) {
    const slice = rows.slice(offset, offset + size);
    const failure = evaluatePilotWindowFailure(slice, {
      allowedDocumentDateSources,
      requireCalendarClear,
    });
    if (failure) {
      skipReasonCounts[failure.reason] += 1;
      if (skippedSamples.length < maxSkipSamples) {
        skippedSamples.push({
          offset,
          reason: failure.reason,
          failingRemainingOffset: failure.failingRemainingOffset,
          monthFolder: failure.monthFolder,
          documentDateSource: failure.documentDateSource,
        });
      }
      continue;
    }
    return {
      pilotWindow: {
        offset,
        size,
        calendarBucketClear: true,
        documentDateSourceGate: allowedDocumentDateSources ? { allowedDocumentDateSources } : null,
        documentDateSources: slice.map((preview) => preview.documentDateSource),
        candidates: slice,
      },
      search: {
        allowedDocumentDateSources,
        requireDocumentDateSource: Boolean(options.requireDocumentDateSource),
        skipReasonCounts,
        skippedSamples,
        windowsScanned,
        matchedAtOffset: offset,
      },
    };
  }

  return {
    pilotWindow: null,
    search: {
      allowedDocumentDateSources,
      requireDocumentDateSource: Boolean(options.requireDocumentDateSource),
      skipReasonCounts,
      skippedSamples,
      windowsScanned,
      matchedAtOffset: null,
    },
  };
}

function matchesDocumentDateSourceGate(preview, allowedDocumentDateSources) {
  if (!allowedDocumentDateSources || allowedDocumentDateSources.length === 0) return true;
  return allowedDocumentDateSources.includes(preview.documentDateSource);
}

async function previewInternalizeCandidates({
  rows = [],
  assetStore = null,
  storage = null,
  offset = 0,
  limit = 10,
  excludeUnknownMonth = false,
  requireDocumentDateSource = false,
  allowedDocumentDateSources = null,
  pilotWindowSize = 10,
  includePilotWindow = true,
  maxPilotWindowSkipSamples = 20,
} = {}) {
  const resolvedAllowedSources = resolveAllowedDocumentDateSources({
    requireDocumentDateSource,
    allowedDocumentDateSources,
  });
  const inventory = await inventoryDriveAssets({ rows, assetStore, storage, sampleSize: 0 });
  const remainingRows = inventory.remainingRows || [];
  const previewAll = remainingRows.map((row, index) =>
    buildInternalizeCandidatePreviewRow(row, index)
  );

  let calendarClearRemaining = 0;
  let unknownMonthRemaining = 0;
  let strongDateSourceRemaining = 0;
  for (const preview of previewAll) {
    if (preview.calendarBucketClear) calendarClearRemaining += 1;
    else unknownMonthRemaining += 1;
    if (matchesDocumentDateSourceGate(preview, resolvedAllowedSources)) {
      strongDateSourceRemaining += 1;
    }
  }

  const browseOffset = Math.max(0, Number(offset) || 0);
  const browseLimit = Math.max(1, Number(limit) || 10);
  const { filtered } = filterInternalizeRemainingRows(remainingRows, {
    excludeUnknownMonth,
    requireDocumentDateSource,
    allowedDocumentDateSources,
  });
  const browsePool = filtered.map((item) => item.preview);
  const candidates = browsePool.slice(browseOffset, browseOffset + browseLimit);

  const pilotSearch = includePilotWindow
    ? buildPilotWindowSearch(previewAll, pilotWindowSize, {
        requireDocumentDateSource,
        allowedDocumentDateSources: resolvedAllowedSources,
        maxSkipSamples: maxPilotWindowSkipSamples,
      })
    : { pilotWindow: null, search: null };
  const pilotWindow = pilotSearch.pilotWindow;
  const pilotWindowSearch = pilotSearch.search;

  return {
    generatedAt: nowIso(),
    zeroWrites: true,
    dryRun: true,
    model:
      'Read-only pilot candidate preview · masked · no patient IDs · commit offset = remainingOffset',
    stats: {
      scanned: inventory.stats.scanned,
      remaining: inventory.stats.remaining,
      calendarClearRemaining,
      unknownMonthRemaining,
      strongDateSourceRemaining,
      documentDateSourceGate: resolvedAllowedSources
        ? { allowedDocumentDateSources: resolvedAllowedSources }
        : null,
    },
    pilotWindow,
    pilotWindowSearch,
    candidates,
    pagination: {
      offset: browseOffset,
      limit: browseLimit,
      excludeUnknownMonth,
      requireDocumentDateSource,
      allowedDocumentDateSources: resolvedAllowedSources,
      returned: candidates.length,
      totalRemaining: remainingRows.length,
      totalCalendarClear: calendarClearRemaining,
      totalStrongDateSource: strongDateSourceRemaining,
    },
  };
}

module.exports = {
  assetBlobVerifiedOnStorage,
  buildExistingAssetIndex,
  collectDriveRowsForInternalization,
  collectDriveRowsFromAssetStore,
  collectPatientMasterDriveRows,
  findExistingInternalAsset,
  internalizeDriveAssets,
  inventoryDriveAssets,
  isInternalizedAsset,
  maskValue,
  mergeDriveRows,
  mimeFamily,
  extractMonthFolder,
  normalizeDriveAssetRow,
  parseFolderEncounter,
  buildInternalizeCandidatePreviewRow,
  findConsecutivePilotWindow,
  buildPilotWindowSearch,
  evaluatePilotWindowFailure,
  resolveAllowedDocumentDateSources,
  filterInternalizeRemainingRows,
  selectInternalizeBatchRows,
  buildGatedBatchMeta,
  PILOT_STRONG_DOCUMENT_DATE_SOURCES,
  previewInternalizeCandidates,
};
