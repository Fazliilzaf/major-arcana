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

async function resolveDriveFileName(row, driveClient) {
  if (typeof driveClient?.getFileMetadata === 'function') {
    const metadata = await driveClient.getFileMetadata(row.driveFileId);
    return normalizeText(metadata?.name) || row.originalFileName;
  }
  if (typeof driveClient?.getDriveFileName === 'function') {
    const result = await driveClient.getDriveFileName(row.driveFileId);
    return normalizeText(result?.name) || row.originalFileName;
  }
  return row.originalFileName;
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

  for (const row of batch) {
    stats.attempted += 1;
    try {
      const driveName = await resolveDriveFileName(row, driveClient);
      const body = await downloadDriveFile(row, driveClient);
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
          originalFileName: driveName,
          mimeType: row.mimeType,
          documentDate: row.documentDate,
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
          name: maskValue(driveName, { keepStart: 1, keepEnd: 1 }),
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
};
