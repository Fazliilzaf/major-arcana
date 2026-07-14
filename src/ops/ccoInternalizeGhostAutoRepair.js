'use strict';

/**
 * Auto-repair ghost VISIBLE/VERIFIED efter sharp internalize när duplicate>0.
 * Körs endast i commit-kontext (ej dry-run). Använder samma gated repair som PR B.
 */

const {
  repairGhostVisibleAssets,
  repairGhostVisibleAssetsFromImportRun,
} = require('./ccoGhostVisibleAssetRepair');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseAutoRepairGhostVisible(value, defaultEnabled = true) {
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  return Boolean(defaultEnabled);
}

/**
 * @param {object} opts
 * @param {object} opts.internalizeReport — report från internalizeDriveAssets (sharp commit)
 * @param {boolean} [opts.enabled=true]
 */
async function autoRepairGhostVisibleAfterInternalize({
  internalizeReport = null,
  assetStore = null,
  storage = null,
  tenantId = null,
  actor = {},
  enabled = true,
  limit = 500,
  targetedByDriveFileId = false,
} = {}) {
  const stats = internalizeReport?.stats || {};
  const runId = normalizeText(internalizeReport?.runId) || null;
  const duplicateCount = Number(stats.duplicate) || 0;
  const importedCount = Number(stats.imported) || 0;
  const repairCandidateCount = duplicateCount + (targetedByDriveFileId ? importedCount : 0);

  const baseMeta = {
    enabled: Boolean(enabled),
    duplicateCount,
    importedCount,
    targetedByDriveFileId: Boolean(targetedByDriveFileId),
    runId,
  };

  if (!enabled) {
    return {
      triggered: false,
      skippedReason: 'disabled',
      ...baseMeta,
      repair: null,
    };
  }
  if (!runId) {
    return {
      triggered: false,
      skippedReason: 'no_run_id',
      ...baseMeta,
      repair: null,
    };
  }
  if (repairCandidateCount <= 0) {
    return {
      triggered: false,
      skippedReason: 'no_duplicates',
      ...baseMeta,
      repair: null,
    };
  }

  const repair = targetedByDriveFileId
    ? await repairGhostVisibleAssetsFromImportRun({
        assetStore,
        storage,
        tenantId,
        importRunId: runId,
        limit,
        actor,
      })
    : await repairGhostVisibleAssets({
        assetStore,
        storage,
        tenantId,
        importRunId: runId,
        limit,
        dryRun: false,
        actor,
      });

  return {
    triggered: true,
    skippedReason: null,
    ...baseMeta,
    repair,
  };
}

async function finalizeInternalizeReportWithAutoRepair({
  report = null,
  assetStore = null,
  storage = null,
  tenantId = null,
  actor = {},
  enabled = true,
  limit = 500,
  targetedByDriveFileId = false,
} = {}) {
  const ghostAutoRepair = await autoRepairGhostVisibleAfterInternalize({
    internalizeReport: report,
    assetStore,
    storage,
    tenantId,
    actor,
    enabled,
    limit,
    targetedByDriveFileId,
  });
  return {
    ...report,
    ghostAutoRepair,
  };
}

module.exports = {
  autoRepairGhostVisibleAfterInternalize,
  finalizeInternalizeReportWithAutoRepair,
  parseAutoRepairGhostVisible,
};
