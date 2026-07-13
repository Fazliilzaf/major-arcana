'use strict';

/**
 * Read-only diagnosis for VISIBLE/VERIFIED assets whose bundle viewUrl would 404
 * (metadata + storageKey but blob missing), while a checksum sibling carries the blob.
 *
 * PR A — no writes. Repair commit lives in ccoGhostVisibleAssetRepair (PR B).
 */

const { maskValue } = require('./ccoDriveAssetInternalization');

const RENDER_STATUSES = new Set(['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function hasBinaryMetadata(asset = {}) {
  const key = normalizeText(asset.storageKey);
  if (!key || key === 'pending-no-binary') return false;
  if (!normalizeText(asset.checksum)) return false;
  return Number(asset.fileSize) > 0;
}

async function blobExistsOnStorage(asset = {}, storage = null) {
  if (!hasBinaryMetadata(asset)) return false;
  if (!storage || typeof storage.exists !== 'function') return true;
  try {
    return await storage.exists(normalizeText(asset.storageKey));
  } catch {
    return false;
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const rows = asArray(items);
  const results = new Array(rows.length);
  let cursor = 0;
  const width = Math.max(1, Math.min(Number(concurrency) || 1, rows.length || 1));
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (cursor < rows.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(rows[index], index);
      }
    })
  );
  return results;
}

async function buildBlobExistenceCache(items = [], storage = null, concurrency = 16) {
  const keys = [
    ...new Set(
      asArray(items)
        .filter(hasBinaryMetadata)
        .map((asset) => normalizeText(asset.storageKey))
        .filter(Boolean)
    ),
  ];
  if (!storage || typeof storage.exists !== 'function') {
    return new Map(keys.map((key) => [key, true]));
  }
  const checks = await mapWithConcurrency(keys, concurrency, async (key) => {
    try {
      return [key, Boolean(await storage.exists(key))];
    } catch {
      return [key, false];
    }
  });
  return new Map(checks);
}

function blobExistsFromCache(asset = {}, cache = new Map()) {
  if (!hasBinaryMetadata(asset)) return false;
  return cache.get(normalizeText(asset.storageKey)) === true;
}

function isBundleRenderCandidate(asset = {}) {
  return RENDER_STATUSES.has(normalizeText(asset.status));
}

function siblingScore(candidate = {}, ghost = {}) {
  let score = 0;
  if (normalizeText(candidate.patientId) === normalizeText(ghost.patientId)) score += 100;
  if (candidate.status === 'DUPLICATE') score += 50;
  if (normalizeText(candidate.originalDriveFileId)) score += 20;
  if (
    normalizeText(candidate.originalFileName) === normalizeText(ghost.originalFileName) &&
    normalizeText(ghost.originalFileName)
  ) {
    score += 15;
  }
  if (
    normalizeText(candidate.documentDate) === normalizeText(ghost.documentDate) &&
    normalizeText(ghost.documentDate)
  ) {
    score += 10;
  }
  if (Number(candidate.fileSize) === Number(ghost.fileSize) && Number(ghost.fileSize) > 0) {
    score += 10;
  }
  return score;
}

function pickBlobSibling(candidates = [], ghost = {}) {
  const ranked = asArray(candidates)
    .filter((candidate) => normalizeText(candidate.id) !== normalizeText(ghost.id))
    .map((candidate) => ({ candidate, score: siblingScore(candidate, ghost) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 50) return null;
  return best.candidate;
}

function buildVerifiedBlobIndex(items = [], blobCache = new Map()) {
  const byChecksum = new Map();
  const byDriveFileId = new Map();
  let verifiedBlobCount = 0;

  for (const asset of asArray(items)) {
    if (!blobExistsFromCache(asset, blobCache)) continue;
    verifiedBlobCount += 1;
    const checksum = normalizeText(asset.checksum);
    if (checksum) {
      if (!byChecksum.has(checksum)) byChecksum.set(checksum, []);
      byChecksum.get(checksum).push(asset);
    }
    const driveFileId = normalizeText(asset.originalDriveFileId);
    if (driveFileId && !byDriveFileId.has(driveFileId)) {
      byDriveFileId.set(driveFileId, asset);
    }
  }

  return { byChecksum, byDriveFileId, verifiedBlobCount };
}

function maskCase(row = {}) {
  return {
    ...row,
    patientId: maskValue(row.patientId, { keepStart: 4, keepEnd: 4 }),
    canonicalAssetId: maskValue(row.canonicalAssetId, { keepStart: 4, keepEnd: 4 }),
    duplicateAssetId: maskValue(row.duplicateAssetId, { keepStart: 4, keepEnd: 4 }),
    checksum: row.checksum ? maskValue(row.checksum, { keepStart: 6, keepEnd: 6 }) : null,
    canonicalStorageKey: row.canonicalStorageKey
      ? maskValue(row.canonicalStorageKey, { keepStart: 8, keepEnd: 8 })
      : null,
    siblingStorageKey: row.siblingStorageKey
      ? maskValue(row.siblingStorageKey, { keepStart: 8, keepEnd: 8 })
      : null,
    originalDriveFileId: row.originalDriveFileId
      ? maskValue(row.originalDriveFileId, { keepStart: 4, keepEnd: 4 })
      : null,
    canonicalFileName: row.canonicalFileName
      ? maskValue(row.canonicalFileName, { keepStart: 8, keepEnd: 8 })
      : null,
  };
}

/**
 * Read-only resolver: ghost VISIBLE/VERIFIED without blob + blob-bearing sibling.
 */
async function diagnoseGhostVisibleAssets({
  assetStore = null,
  storage = null,
  tenantId = null,
  importRunId = null,
  patientIds = null,
  limit = 500,
  sampleSize = 25,
  maskSamples = true,
  storageConcurrency = 16,
} = {}) {
  if (!assetStore || typeof assetStore.listItemsForEnrichment !== 'function') {
    throw new Error('assetStore.listItemsForEnrichment krävs.');
  }

  const items = assetStore.listItemsForEnrichment(tenantId);
  const blobCache = await buildBlobExistenceCache(items, storage, storageConcurrency);
  const blobIndex = buildVerifiedBlobIndex(items, blobCache);
  const patientFilter = asArray(patientIds).map(normalizeText).filter(Boolean);
  const patientSet = patientFilter.length ? new Set(patientFilter) : null;
  const runFilter = normalizeText(importRunId) || null;

  const cases = [];
  for (const asset of items) {
    if (!isBundleRenderCandidate(asset)) continue;
    if (patientSet && !patientSet.has(normalizeText(asset.patientId))) continue;
    if (blobExistsFromCache(asset, blobCache)) continue;

    const checksum = normalizeText(asset.checksum);
    let siblings = checksum ? blobIndex.byChecksum.get(checksum) || [] : [];
    if (!siblings.length && hasBinaryMetadata(asset)) {
      siblings = items.filter(
        (candidate) =>
          normalizeText(candidate.id) !== normalizeText(asset.id) &&
          Number(candidate.fileSize) === Number(asset.fileSize) &&
          normalizeText(candidate.documentDate) === normalizeText(asset.documentDate) &&
          normalizeText(candidate.patientId) === normalizeText(asset.patientId)
      );
    }

    const sibling = pickBlobSibling(siblings, asset);
    if (
      runFilter &&
      normalizeText(sibling?.importRunId) !== runFilter &&
      normalizeText(asset.importRunId) !== runFilter
    ) {
      continue;
    }

    const driveFileId =
      normalizeText(asset.originalDriveFileId) ||
      normalizeText(sibling?.originalDriveFileId) ||
      null;
    const indexedAsset = driveFileId ? blobIndex.byDriveFileId.get(driveFileId) || null : null;

    cases.push({
      kind: sibling ? 'ghost_visible_with_blob_sibling' : 'ghost_visible_no_blob_sibling',
      patientId: asset.patientId,
      canonicalAssetId: asset.id,
      canonicalStatus: asset.status,
      duplicateAssetId: sibling?.id || null,
      siblingStatus: sibling?.status || null,
      siblingImportRunId: sibling?.importRunId || null,
      checksum: checksum || normalizeText(sibling?.checksum) || null,
      canonicalStorageKey: normalizeText(asset.storageKey) || null,
      siblingStorageKey: sibling ? normalizeText(sibling.storageKey) : null,
      originalDriveFileId: driveFileId,
      canonicalFileName: normalizeText(asset.originalFileName) || null,
      category: normalizeText(asset.category) || null,
      documentDate: normalizeText(asset.documentDate) || null,
      sourceSystem: normalizeText(asset.sourceSystem) || null,
      bundlePointsToCanonical: true,
      bundleDownloadWould404: true,
      siblingDownloadLikely200: Boolean(sibling),
      crossPatientSibling:
        Boolean(sibling) && normalizeText(sibling.patientId) !== normalizeText(asset.patientId),
      driveFileIdIndexedOn: indexedAsset?.id || null,
      driveFileIdIndexedStatus: indexedAsset?.status || null,
    });
  }

  const capped = cases.slice(0, Math.max(1, Number(limit) || 500));
  const samples = capped.slice(0, Math.max(0, Number(sampleSize) || 25));

  const stats = {
    scannedAssets: items.length,
    verifiedBlobAssets: blobIndex.verifiedBlobCount,
    uniqueChecksumsWithBlob: blobIndex.byChecksum.size,
    uniqueDriveFileIdsWithBlob: blobIndex.byDriveFileId.size,
    ghostRenderCandidates: cases.length,
    withBlobSibling: cases.filter((row) => row.kind === 'ghost_visible_with_blob_sibling').length,
    withoutBlobSibling: cases.filter((row) => row.kind === 'ghost_visible_no_blob_sibling').length,
    crossPatientSibling: cases.filter((row) => row.crossPatientSibling).length,
    importRunIdFilter: runFilter || null,
  };

  return {
    generatedAt: nowIso(),
    dryRun: true,
    zeroWrites: true,
    model: 'Read-only: VISIBLE/VERIFIED utan blob i storage + checksum-sibling med verifierad blob',
    stats,
    samples: maskSamples ? samples.map(maskCase) : samples,
    cases: maskSamples ? capped.map(maskCase) : capped,
  };
}

async function diagnoseGhostVisibleAssetPage({
  assetStore = null,
  storage = null,
  tenantId = null,
  importRunId = null,
  patientIds = null,
  offset = 0,
  pageSize = 500,
  sampleSize = 25,
  maskSamples = true,
  storageConcurrency = 16,
} = {}) {
  if (!assetStore || typeof assetStore.listItemsForEnrichment !== 'function') {
    throw new Error('assetStore.listItemsForEnrichment krävs.');
  }
  const items = assetStore.listItemsForEnrichment(tenantId);
  const patientFilter = asArray(patientIds).map(normalizeText).filter(Boolean);
  const patientSet = patientFilter.length ? new Set(patientFilter) : null;
  const renderCandidates = items.filter(
    (asset) =>
      isBundleRenderCandidate(asset) &&
      (!patientSet || patientSet.has(normalizeText(asset.patientId)))
  );
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 500, 2000));
  const targets = renderCandidates.slice(safeOffset, safeOffset + safePageSize);

  const byChecksum = new Map();
  const bySignature = new Map();
  for (const asset of items) {
    const checksum = normalizeText(asset.checksum);
    if (checksum) {
      if (!byChecksum.has(checksum)) byChecksum.set(checksum, []);
      byChecksum.get(checksum).push(asset);
    }
    const signature = [
      normalizeText(asset.patientId),
      Number(asset.fileSize) || 0,
      normalizeText(asset.documentDate),
    ].join('|');
    if (!bySignature.has(signature)) bySignature.set(signature, []);
    bySignature.get(signature).push(asset);
  }

  const targetCache = await buildBlobExistenceCache(
    targets,
    storage,
    storageConcurrency
  );
  const ghosts = targets.filter((asset) => !blobExistsFromCache(asset, targetCache));
  const siblingCandidates = [];
  for (const ghost of ghosts) {
    const checksum = normalizeText(ghost.checksum);
    const signature = [
      normalizeText(ghost.patientId),
      Number(ghost.fileSize) || 0,
      normalizeText(ghost.documentDate),
    ].join('|');
    siblingCandidates.push(
      ...(checksum ? byChecksum.get(checksum) || [] : []).filter(
        (candidate) => normalizeText(candidate.id) !== normalizeText(ghost.id)
      )
    );
    if (!checksum && hasBinaryMetadata(ghost)) {
      siblingCandidates.push(
        ...(bySignature.get(signature) || []).filter(
          (candidate) => normalizeText(candidate.id) !== normalizeText(ghost.id)
        )
      );
    }
  }
  const siblingCache = await buildBlobExistenceCache(
    siblingCandidates,
    storage,
    storageConcurrency
  );
  const runFilter = normalizeText(importRunId) || null;
  const cases = [];
  for (const asset of ghosts) {
    const checksum = normalizeText(asset.checksum);
    const signature = [
      normalizeText(asset.patientId),
      Number(asset.fileSize) || 0,
      normalizeText(asset.documentDate),
    ].join('|');
    const candidates = checksum
      ? byChecksum.get(checksum) || []
      : bySignature.get(signature) || [];
    const verified = candidates.filter((candidate) =>
      blobExistsFromCache(candidate, siblingCache)
    );
    const sibling = pickBlobSibling(verified, asset);
    if (
      runFilter &&
      normalizeText(sibling?.importRunId) !== runFilter &&
      normalizeText(asset.importRunId) !== runFilter
    ) {
      continue;
    }
    cases.push({
      kind: sibling ? 'ghost_visible_with_blob_sibling' : 'ghost_visible_no_blob_sibling',
      patientId: asset.patientId,
      canonicalAssetId: asset.id,
      canonicalStatus: asset.status,
      duplicateAssetId: sibling?.id || null,
      siblingStatus: sibling?.status || null,
      siblingImportRunId: sibling?.importRunId || null,
      checksum: checksum || normalizeText(sibling?.checksum) || null,
      canonicalStorageKey: normalizeText(asset.storageKey) || null,
      siblingStorageKey: normalizeText(sibling?.storageKey) || null,
      originalDriveFileId:
        normalizeText(asset.originalDriveFileId) ||
        normalizeText(sibling?.originalDriveFileId) ||
        null,
      canonicalFileName: normalizeText(asset.originalFileName) || null,
      category: normalizeText(asset.category) || null,
      documentDate: normalizeText(asset.documentDate) || null,
      sourceSystem: normalizeText(asset.sourceSystem) || null,
      bundlePointsToCanonical: true,
      bundleDownloadWould404: true,
      siblingDownloadLikely200: Boolean(sibling),
      crossPatientSibling:
        Boolean(sibling) && normalizeText(sibling.patientId) !== normalizeText(asset.patientId),
    });
  }
  const nextOffset = safeOffset + targets.length;
  const samples = cases.slice(0, Math.max(0, Number(sampleSize) || 25));
  return {
    generatedAt: nowIso(),
    dryRun: true,
    zeroWrites: true,
    pagination: {
      offset: safeOffset,
      pageSize: safePageSize,
      scanned: targets.length,
      totalRenderCandidates: renderCandidates.length,
      nextOffset: nextOffset < renderCandidates.length ? nextOffset : null,
      hasMore: nextOffset < renderCandidates.length,
    },
    stats: {
      scannedAssets: targets.length,
      ghostRenderCandidates: cases.length,
      withBlobSibling: cases.filter((row) => row.kind === 'ghost_visible_with_blob_sibling')
        .length,
      withoutBlobSibling: cases.filter((row) => row.kind === 'ghost_visible_no_blob_sibling')
        .length,
      crossPatientSibling: cases.filter((row) => row.crossPatientSibling).length,
      importRunIdFilter: runFilter,
    },
    samples: maskSamples ? samples.map(maskCase) : samples,
    cases: maskSamples ? cases.map(maskCase) : cases,
  };
}

/**
 * Read-only inventory hint: how many verified assets are indexable by checksum vs driveFileId.
 * Used to plan checksum-aware alreadyInternal (PR C).
 */
async function summarizeChecksumInventoryCoverage({
  assetStore = null,
  storage = null,
  tenantId = null,
} = {}) {
  if (!assetStore || typeof assetStore.listItemsForEnrichment !== 'function') {
    throw new Error('assetStore.listItemsForEnrichment krävs.');
  }
  const items = assetStore.listItemsForEnrichment(tenantId);
  const blobCache = await buildBlobExistenceCache(items, storage);
  const blobIndex = buildVerifiedBlobIndex(items, blobCache);
  let renderWithoutBlob = 0;
  for (const asset of items) {
    if (!isBundleRenderCandidate(asset)) continue;
    if (!blobExistsFromCache(asset, blobCache)) renderWithoutBlob += 1;
  }
  return {
    verifiedBlobAssets: blobIndex.verifiedBlobCount,
    uniqueChecksumsWithBlob: blobIndex.byChecksum.size,
    uniqueDriveFileIdsWithBlob: blobIndex.byDriveFileId.size,
    renderCandidatesMissingBlob: renderWithoutBlob,
    note: 'Checksum-index kan användas post-download för alreadyInternal; pre-download kräver driveFileId eller repair av ghost-VISIBLE.',
  };
}

module.exports = {
  RENDER_STATUSES,
  blobExistsOnStorage,
  buildBlobExistenceCache,
  buildVerifiedBlobIndex,
  diagnoseGhostVisibleAssets,
  diagnoseGhostVisibleAssetPage,
  summarizeChecksumInventoryCoverage,
  pickBlobSibling,
};
