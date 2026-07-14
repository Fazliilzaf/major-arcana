'use strict';

/**
 * Gated repair for ghost VISIBLE/VERIFIED assets (bundle 404) using blob-bearing sibling.
 * PR B — dryRun default; commit requires confirmText.
 */

const { diagnoseGhostVisibleAssets } = require('./ccoGhostVisibleAssetDiagnosis');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function isRepairableCase(row = {}) {
  const siblingStatus = normalizeText(row.siblingStatus);
  return (
    row.kind === 'ghost_visible_with_blob_sibling' &&
    normalizeText(row.canonicalAssetId) &&
    normalizeText(row.duplicateAssetId) &&
    ['DUPLICATE', 'VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(siblingStatus) &&
    !row.crossPatientSibling
  );
}

/**
 * @param {object} opts
 * @param {boolean} [opts.dryRun=true]
 */
async function repairGhostVisibleAssets({
  assetStore = null,
  storage = null,
  tenantId = null,
  importRunId = null,
  patientIds = null,
  limit = 500,
  dryRun = true,
  actor = {},
} = {}) {
  if (!assetStore || typeof assetStore.reattachGhostVisibleBlobFromSibling !== 'function') {
    throw new Error('assetStore.reattachGhostVisibleBlobFromSibling krävs.');
  }

  const diagnosis = await diagnoseGhostVisibleAssets({
    assetStore,
    storage,
    tenantId,
    importRunId: importRunId || null,
    patientIds,
    limit,
    sampleSize: Math.min(25, Number(limit) || 500),
    maskSamples: false,
  });

  const repairable = diagnosis.cases.filter(isRepairableCase);
  const results = [];
  const errors = [];
  const useBatchPersist =
    !dryRun &&
    typeof assetStore.beginBatch === 'function' &&
    typeof assetStore.flushBatch === 'function';

  if (useBatchPersist) assetStore.beginBatch();
  try {
    for (const row of repairable) {
      if (dryRun) {
        results.push({
          action: 'would_repair',
          patientId: row.patientId,
          canonicalAssetId: row.canonicalAssetId,
          duplicateAssetId: row.duplicateAssetId,
          checksum: row.checksum,
          siblingStorageKey: row.siblingStorageKey,
        });
        continue;
      }

      try {
        const updated = await assetStore.reattachGhostVisibleBlobFromSibling(
          row.canonicalAssetId,
          row.duplicateAssetId,
          {
            storage,
            actor,
            reason: importRunId ? `ghost_visible_repair:${importRunId}` : 'ghost_visible_repair',
          }
        );
        results.push({
          action: 'repaired',
          patientId: row.patientId,
          canonicalAssetId: row.canonicalAssetId,
          duplicateAssetId: row.duplicateAssetId,
          checksum: updated.checksum,
          storageKey: updated.storageKey,
          status: updated.status,
        });
      } catch (error) {
        if (
          Number(error?.statusCode) === 409 &&
          /redan verifierad blob/i.test(String(error.message))
        ) {
          results.push({
            action: 'already_repaired',
            patientId: row.patientId,
            canonicalAssetId: row.canonicalAssetId,
            duplicateAssetId: row.duplicateAssetId,
          });
          continue;
        }
        errors.push({
          canonicalAssetId: row.canonicalAssetId,
          duplicateAssetId: row.duplicateAssetId,
          code: normalizeText(error?.code) || 'repair_failed',
          message: error?.message || String(error),
        });
      }
    }
  } finally {
    if (useBatchPersist) await assetStore.flushBatch();
  }

  const stats = {
    diagnosisCases: diagnosis.cases.length,
    repairable: repairable.length,
    wouldRepair: results.filter((row) => row.action === 'would_repair').length,
    repaired: results.filter((row) => row.action === 'repaired').length,
    alreadyRepaired: results.filter((row) => row.action === 'already_repaired').length,
    failed: errors.length,
    importRunIdFilter: normalizeText(importRunId) || null,
  };

  return {
    generatedAt: nowIso(),
    dryRun: Boolean(dryRun),
    zeroWrites: Boolean(dryRun),
    model:
      'Ghost VISIBLE/VERIFIED utan blob → kopiera storageKey/checksum från verifierad same-patient blob-sibling',
    stats,
    results,
    errors,
    diagnosisStats: diagnosis.stats,
  };
}

async function repairGhostVisibleAssetsFromImportRun({
  assetStore = null,
  storage = null,
  tenantId = null,
  importRunId = null,
  limit = 500,
  actor = {},
} = {}) {
  if (!assetStore || typeof assetStore.listItemsForEnrichment !== 'function') {
    throw new Error('assetStore.listItemsForEnrichment krävs.');
  }
  if (typeof assetStore.reattachGhostVisibleBlobFromSibling !== 'function') {
    throw new Error('assetStore.reattachGhostVisibleBlobFromSibling krävs.');
  }
  const runId = normalizeText(importRunId);
  if (!runId) throw new Error('importRunId krävs för riktad repair.');

  const items = assetStore.listItemsForEnrichment(tenantId);
  const runSiblings = items.filter(
    (asset) => normalizeText(asset.importRunId) === runId && normalizeText(asset.originalDriveFileId)
  );
  const siblingByDriveId = new Map();
  for (const sibling of runSiblings) {
    if (!normalizeText(sibling.storageKey) || !normalizeText(sibling.checksum)) continue;
    if (storage?.exists && !(await storage.exists(sibling.storageKey))) continue;
    siblingByDriveId.set(normalizeText(sibling.originalDriveFileId), sibling);
  }

  const repairable = [];
  for (const canonical of items) {
    if (repairable.length >= Math.max(1, Number(limit) || 500)) break;
    if (!['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(normalizeText(canonical.status))) {
      continue;
    }
    const driveFileId = normalizeText(canonical.originalDriveFileId);
    const sibling = siblingByDriveId.get(driveFileId);
    if (!sibling || normalizeText(sibling.id) === normalizeText(canonical.id)) continue;
    if (normalizeText(sibling.patientId) !== normalizeText(canonical.patientId)) continue;
    if (storage?.exists && (await storage.exists(canonical.storageKey))) continue;
    repairable.push({ canonical, sibling });
  }

  const results = [];
  const errors = [];
  const useBatchPersist =
    typeof assetStore.beginBatch === 'function' && typeof assetStore.flushBatch === 'function';
  if (useBatchPersist) assetStore.beginBatch();
  try {
    for (const { canonical, sibling } of repairable) {
      try {
        const updated = await assetStore.reattachGhostVisibleBlobFromSibling(
          canonical.id,
          sibling.id,
          { storage, actor, reason: `ghost_visible_repair:${runId}` }
        );
        results.push({
          action: 'repaired',
          patientId: canonical.patientId,
          canonicalAssetId: canonical.id,
          duplicateAssetId: sibling.id,
          checksum: updated.checksum,
          storageKey: updated.storageKey,
          status: updated.status,
        });
      } catch (error) {
        errors.push({
          canonicalAssetId: canonical.id,
          duplicateAssetId: sibling.id,
          code: normalizeText(error?.code) || 'repair_failed',
          message: error?.message || String(error),
        });
      }
    }
  } finally {
    if (useBatchPersist) await assetStore.flushBatch();
  }

  return {
    generatedAt: nowIso(),
    dryRun: false,
    zeroWrites: false,
    model: 'Riktad run-repair via originalDriveFileId; ingen global blob-scan',
    stats: {
      diagnosisCases: repairable.length,
      repairable: repairable.length,
      wouldRepair: 0,
      repaired: results.length,
      alreadyRepaired: 0,
      failed: errors.length,
      importRunIdFilter: runId,
    },
    results,
    errors,
    diagnosisStats: {
      scannedAssets: items.length,
      runSiblings: runSiblings.length,
      verifiedRunSiblings: siblingByDriveId.size,
    },
  };
}

module.exports = {
  repairGhostVisibleAssets,
  repairGhostVisibleAssetsFromImportRun,
  isRepairableCase,
};
