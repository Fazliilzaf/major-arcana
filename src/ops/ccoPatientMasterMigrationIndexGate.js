'use strict';

const RENDERABLE_NATIVE_STATUSES = new Set(['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO']);
const BLOCKED_NATIVE_STATUSES = new Set([
  'NEEDS_REVIEW',
  'REJECTED',
  'DUPLICATE',
  'LINK_ONLY_BLOCKER',
  'FAILED_IMPORT',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function indexDriveFileId(file) {
  return normalizeText(file?.driveFileId || file?.originalDriveFileId);
}

function buildNativeAssetsByDriveFileId(nativeAssets = []) {
  const map = new Map();
  for (const asset of asArray(nativeAssets)) {
    const driveFileId = normalizeText(asset?.originalDriveFileId);
    if (!driveFileId || map.has(driveFileId)) continue;
    map.set(driveFileId, asset);
  }
  return map;
}

function isMigrationIndexFile(file) {
  const source = normalizeText(file?.source);
  if (source === 'migration_index') return true;
  if (source === 'patient_asset') return false;
  if (normalizeText(file?.assetId)) return false;
  return Boolean(normalizeText(file?.id) || normalizeText(file?.relativePath));
}

/**
 * Resolve how a migration-index row relates to native patient assets.
 * Read-only — never mutates storage.
 */
function resolveMigrationIndexBinding(indexFile, nativeByDriveFileId = new Map()) {
  const driveFileId = indexDriveFileId(indexFile);
  const linked = driveFileId ? nativeByDriveFileId.get(driveFileId) : null;
  if (!linked) {
    return {
      binding: 'unlinked',
      nativeAssetId: null,
      nativeStatus: null,
      renderAsClear: false,
      includeInPatientCard: true,
      reviewReason: 'migration_index_unverified',
    };
  }

  const nativeStatus = normalizeText(linked.status);
  if (RENDERABLE_NATIVE_STATUSES.has(nativeStatus)) {
    return {
      binding: 'native_renderable',
      nativeAssetId: linked.id,
      nativeStatus,
      renderAsClear: true,
      includeInPatientCard: false,
      reviewReason: null,
    };
  }

  if (BLOCKED_NATIVE_STATUSES.has(nativeStatus)) {
    return {
      binding: 'native_blocked',
      nativeAssetId: linked.id,
      nativeStatus,
      renderAsClear: false,
      includeInPatientCard: false,
      reviewReason: 'migration_index_native_blocked',
    };
  }

  return {
    binding: 'native_unverified',
    nativeAssetId: linked.id,
    nativeStatus: nativeStatus || 'unknown',
    renderAsClear: false,
    includeInPatientCard: true,
    reviewReason: 'migration_index_unverified',
  };
}

function annotateMigrationIndexFile(indexFile, bindingResult) {
  return {
    ...indexFile,
    source: normalizeText(indexFile?.source) || 'migration_index',
    migrationIndexBinding: bindingResult.binding,
    linkedNativeAssetId: bindingResult.nativeAssetId,
    linkedNativeStatus: bindingResult.nativeStatus,
    renderAsClear: bindingResult.renderAsClear,
    assetStatus:
      bindingResult.binding === 'native_renderable'
        ? bindingResult.nativeStatus
        : 'MIGRATION_INDEX_UNVERIFIED',
    migrationIndexReviewReason: bindingResult.reviewReason,
  };
}

/**
 * Gate migration-index rows before they reach patient card / visit-segments.
 * - Renderable native wins over index duplicate (dedupe by driveFileId).
 * - Blocked native suppresses index row entirely.
 * - Unlinked index rows stay visible but never as "clear".
 */
function gateMigrationIndexFiles({ indexFiles = [], nativeAssets = [] } = {}) {
  const nativeByDriveFileId = buildNativeAssetsByDriveFileId(nativeAssets);
  const gated = [];
  let suppressedRenderableDuplicates = 0;
  let suppressedBlocked = 0;
  let unverifiedIncluded = 0;

  for (const raw of asArray(indexFiles)) {
    if (!isMigrationIndexFile(raw)) {
      gated.push(raw);
      continue;
    }

    const binding = resolveMigrationIndexBinding(raw, nativeByDriveFileId);
    if (binding.binding === 'native_renderable') {
      suppressedRenderableDuplicates += 1;
      continue;
    }
    if (binding.binding === 'native_blocked') {
      suppressedBlocked += 1;
      continue;
    }

    unverifiedIncluded += 1;
    gated.push(annotateMigrationIndexFile(raw, binding));
  }

  return {
    files: gated,
    stats: {
      input: indexFiles.length,
      output: gated.length,
      suppressedRenderableDuplicates,
      suppressedBlocked,
      unverifiedIncluded,
    },
  };
}

module.exports = {
  BLOCKED_NATIVE_STATUSES,
  RENDERABLE_NATIVE_STATUSES,
  annotateMigrationIndexFile,
  buildNativeAssetsByDriveFileId,
  gateMigrationIndexFiles,
  isMigrationIndexFile,
  resolveMigrationIndexBinding,
};
