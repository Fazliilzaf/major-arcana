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
  return (
    row.kind === 'ghost_visible_with_blob_sibling' &&
    normalizeText(row.canonicalAssetId) &&
    normalizeText(row.duplicateAssetId) &&
    normalizeText(row.siblingStatus) === 'DUPLICATE' &&
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
      'Ghost VISIBLE/VERIFIED utan blob → kopiera storageKey/checksum från blob-sibling (typ DUPLICATE)',
    stats,
    results,
    errors,
    diagnosisStats: diagnosis.stats,
  };
}

module.exports = {
  repairGhostVisibleAssets,
  isRepairableCase,
};
