'use strict';

const {
  diagnoseGhostVisibleAssets,
  summarizeChecksumInventoryCoverage,
} = require('./ccoGhostVisibleAssetDiagnosis');

function idleState() {
  return {
    running: false,
    startedAt: null,
    finishedAt: null,
    tenantId: null,
    lastError: null,
    report: null,
  };
}

let jobState = idleState();

function cloneState() {
  return {
    ...jobState,
    report: jobState.report ? { ...jobState.report } : null,
  };
}

function getGhostVisibleDiagnosisJobState() {
  return cloneState();
}

function resetGhostVisibleDiagnosisJobStateForTests() {
  jobState = idleState();
}

async function executeGhostVisibleDiagnosisJob(ctx = {}) {
  try {
    const report = await diagnoseGhostVisibleAssets(ctx);
    if (ctx.includeInventoryCoverage) {
      report.inventoryCoverage = await summarizeChecksumInventoryCoverage(ctx);
    }
    jobState.report = report;
    if (typeof ctx.onComplete === 'function') {
      await ctx.onComplete(cloneState(), report);
    }
  } catch (error) {
    jobState.lastError = error?.message || String(error);
    if (typeof ctx.onError === 'function') {
      await ctx.onError(error, cloneState());
    }
  } finally {
    jobState.running = false;
    jobState.finishedAt = new Date().toISOString();
  }
}

function startGhostVisibleDiagnosisJob(ctx = {}) {
  if (jobState.running) {
    return { accepted: false, already: true, state: cloneState() };
  }
  jobState = {
    ...idleState(),
    running: true,
    startedAt: new Date().toISOString(),
    tenantId: ctx.tenantId || null,
  };
  setImmediate(() => {
    void executeGhostVisibleDiagnosisJob(ctx);
  });
  return { accepted: true, state: cloneState() };
}

module.exports = {
  executeGhostVisibleDiagnosisJob,
  getGhostVisibleDiagnosisJobState,
  resetGhostVisibleDiagnosisJobStateForTests,
  startGhostVisibleDiagnosisJob,
};
