'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasStorageKey(asset = {}) {
  const storageKey = normalizeText(asset.storageKey);
  return Boolean(storageKey && storageKey !== 'pending-no-binary');
}

async function inspectStuckImport({ assetStore, storage, tenantId = null, assetId } = {}) {
  if (!assetStore || typeof assetStore.listItemsForEnrichment !== 'function') {
    throw new Error('assetStore.listItemsForEnrichment krävs.');
  }
  if (!storage || typeof storage.exists !== 'function') {
    throw new Error('storage.exists krävs.');
  }
  const id = normalizeText(assetId);
  if (!id) throw new Error('assetId krävs.');
  // The audit uses this tenant-filtered index. Some legacy assets are present
  // there before they are addressable through the direct id index.
  const asset = assetStore
    .listItemsForEnrichment(tenantId)
    .find((candidate) => normalizeText(candidate?.id) === id);
  if (!asset) {
    const error = new Error('Asset hittades inte.');
    error.statusCode = 404;
    throw error;
  }

  let blobExists = false;
  let storageError = null;
  if (hasStorageKey(asset)) {
    try {
      blobExists = Boolean(await storage.exists(asset.storageKey));
    } catch (error) {
      storageError = error.message || 'storage_exists_failed';
    }
  }
  const blockers = [];
  if (normalizeText(asset.status) !== 'IMPORTING') blockers.push('status_not_importing');
  if (!hasStorageKey(asset)) blockers.push('missing_storage_key');
  if (!blobExists) blockers.push(storageError ? 'storage_check_failed' : 'missing_storage_blob');

  return {
    asset,
    plan: {
      assetId: asset.id,
      patientId: asset.patientId || null,
      importRunId: asset.importRunId || null,
      currentStatus: normalizeText(asset.status),
      storageKey: normalizeText(asset.storageKey) || null,
      blobExists,
      storageError,
      blockers,
      repairable: blockers.length === 0,
      targetStatus: 'VERIFIED_IN_CCO',
      willMakeVisible: false,
    },
  };
}

async function reconcileStuckImport({
  assetStore,
  storage,
  tenantId = null,
  assetId,
  dryRun = true,
  actor = {},
} = {}) {
  const inspection = await inspectStuckImport({ assetStore, storage, tenantId, assetId });
  const result = {
    dryRun: Boolean(dryRun),
    zeroWrites: Boolean(dryRun),
    plan: inspection.plan,
    reconciled: false,
    finalStatus: inspection.plan.currentStatus,
  };
  if (dryRun || !inspection.plan.repairable) return result;

  await assetStore.transitionStatus(inspection.asset.id, 'IMPORTED_TO_CCO', {
    actor,
    reason: 'stuck_import_blob_reconciled',
  });
  const verified = await assetStore.transitionStatus(inspection.asset.id, 'VERIFIED_IN_CCO', {
    actor,
    reason: 'stuck_import_blob_verified',
  });
  result.reconciled = true;
  result.finalStatus = verified.status;
  return result;
}

module.exports = { inspectStuckImport, reconcileStuckImport };
