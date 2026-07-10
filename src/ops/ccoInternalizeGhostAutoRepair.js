'use strict';

/**
 * Auto-repair ghost VISIBLE/VERIFIED efter sharp internalize när duplicate>0.
 * Körs endast i commit-kontext (ej dry-run). Använder samma gated repair som PR B.
 */

const { repairGhostVisibleAssets } = require('./ccoGhostVisibleAssetRepair');

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
} = {}) {
  const stats = internalizeReport?.stats || {};
  const runId = normalizeText(internalizeReport?.runId) || null;
  const duplicateCount = Number(stats.duplicate) || 0;

  const baseMeta = {
    enabled: Boolean(enabled),
    duplicateCount,
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
  if (duplicateCount <= 0) {
    return {
      triggered: false,
      skippedReason: 'no_duplicates',
      ...baseMeta,
      repair: null,
    };
  }

  const repair = await repairGhostVisibleAssets({
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
} = {}) {
  const ghostAutoRepair = await autoRepairGhostVisibleAfterInternalize({
    internalizeReport: report,
    assetStore,
    storage,
    tenantId,
    actor,
    enabled,
    limit,
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
