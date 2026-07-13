'use strict';

const { buildCanonicalAssetPatientRepairPlan } = require('./ccoCanonicalAssetPatientRepair');

function idleState() {
  return {
    running: false,
    startedAt: null,
    finishedAt: null,
    tenantId: null,
    lastError: null,
    stats: null,
  };
}

let jobState = idleState();

function cloneState() {
  return {
    ...jobState,
    stats: jobState.stats ? { ...jobState.stats } : null,
  };
}

function getCanonicalPatientRepairJobState() {
  return cloneState();
}

function resetCanonicalPatientRepairJobStateForTests() {
  jobState = idleState();
}

async function executeCanonicalPatientRepairJob({
  assets = [],
  patients = [],
  loadInputs,
  assetStore,
  tenantId,
  actor = {},
  batchSize = 200,
  onComplete,
  onError,
} = {}) {
  try {
    const loaded = typeof loadInputs === 'function' ? await loadInputs() : { assets, patients };
    const plan = buildCanonicalAssetPatientRepairPlan({
      assets: loaded?.assets || assets,
      patients: loaded?.patients || patients,
    });
    const size = Math.max(1, Math.min(200, Number(batchSize) || 200));
    jobState.stats = {
      candidates: plan.candidates.length,
      identityResolved: plan.mappings.filter((row) => row.canonicalPatientId).length,
      eligible: plan.eligible.length,
      linked: 0,
      failed: 0,
      batchesCompleted: 0,
      remainingEligible: plan.eligible.length,
    };

    for (let offset = 0; offset < plan.eligible.length; offset += size) {
      const batch = plan.eligible.slice(offset, offset + size);
      assetStore.beginBatch?.();
      try {
        for (const mapping of batch) {
          await assetStore.linkAssetToPatient(mapping.assetId, mapping.canonicalPatientId, {
            actor,
          });
          jobState.stats.linked += 1;
          jobState.stats.remainingEligible -= 1;
        }
      } finally {
        await assetStore.flushBatch?.();
      }
      jobState.stats.batchesCompleted += 1;
    }

    if (typeof onComplete === 'function') await onComplete(cloneState());
  } catch (error) {
    jobState.lastError = error?.message || String(error);
    if (jobState.stats) jobState.stats.failed += 1;
    if (typeof onError === 'function') await onError(error, cloneState());
  } finally {
    jobState.running = false;
    jobState.finishedAt = new Date().toISOString();
  }
}

function startCanonicalPatientRepairJob(context = {}) {
  if (jobState.running) {
    return { accepted: false, already: true, state: cloneState() };
  }
  jobState = {
    ...idleState(),
    running: true,
    startedAt: new Date().toISOString(),
    tenantId: context.tenantId || null,
  };
  setImmediate(() => void executeCanonicalPatientRepairJob(context));
  return { accepted: true, state: cloneState() };
}

module.exports = {
  executeCanonicalPatientRepairJob,
  getCanonicalPatientRepairJobState,
  resetCanonicalPatientRepairJobStateForTests,
  startCanonicalPatientRepairJob,
};
