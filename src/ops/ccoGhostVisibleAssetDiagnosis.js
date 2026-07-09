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

async function buildVerifiedBlobIndex(items = [], storage = null) {
  const byChecksum = new Map();
  const byDriveFileId = new Map();
  let verifiedBlobCount = 0;

  for (const asset of asArray(items)) {
    if (!(await blobExistsOnStorage(asset, storage))) continue;
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
} = {}) {
  if (!assetStore || typeof assetStore.listItemsForEnrichment !== 'function') {
    throw new Error('assetStore.listItemsForEnrichment krävs.');
  }

  const items = assetStore.listItemsForEnrichment(tenantId);
  const blobIndex = await buildVerifiedBlobIndex(items, storage);
  const patientFilter = asArray(patientIds).map(normalizeText).filter(Boolean);
  const patientSet = patientFilter.length ? new Set(patientFilter) : null;
  const runFilter = normalizeText(importRunId) || null;

  const cases = [];
  for (const asset of items) {
    if (!isBundleRenderCandidate(asset)) continue;
    if (patientSet && !patientSet.has(normalizeText(asset.patientId))) continue;
    if (await blobExistsOnStorage(asset, storage)) continue;

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
    if (runFilter && sibling && normalizeText(sibling.importRunId) !== runFilter) continue;

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
  const blobIndex = await buildVerifiedBlobIndex(items, storage);
  let renderWithoutBlob = 0;
  for (const asset of items) {
    if (!isBundleRenderCandidate(asset)) continue;
    if (!(await blobExistsOnStorage(asset, storage))) renderWithoutBlob += 1;
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
  buildVerifiedBlobIndex,
  diagnoseGhostVisibleAssets,
  summarizeChecksumInventoryCoverage,
  pickBlobSibling,
};
