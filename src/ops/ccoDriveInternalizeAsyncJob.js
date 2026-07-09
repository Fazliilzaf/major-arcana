'use strict';

/**
 * Bakgrundsjobb för Drive-internalize-commit.
 *
 * Prod 502 under långa synkrona POST:ar (Cloudflare ~100s) avbryter HTTP-svaret
 * medan importen kan fortsätta — orphan-runs utan finishedAt. Commit körs här
 * async: klienten får 202 direkt och pollar status.
 */

const { internalizeDriveAssets } = require('./ccoDriveAssetInternalization');

function idleState() {
  return {
    running: false,
    startedAt: null,
    finishedAt: null,
    runId: null,
    limit: null,
    offset: null,
    tenantId: null,
    lastError: null,
    stats: null,
    report: null,
  };
}

let jobState = idleState();

function cloneState(state = jobState) {
  return {
    ...state,
    stats: state.stats ? { ...state.stats } : null,
    report: state.report ? { ...state.report } : null,
  };
}

function getInternalizeJobState() {
  return cloneState(jobState);
}

function isInternalizeJobRunning() {
  return Boolean(jobState.running);
}

function resetInternalizeJobStateForTests() {
  jobState = idleState();
}

async function executeInternalizeJob(ctx = {}) {
  try {
    const report = await internalizeDriveAssets(ctx);
    jobState.runId = report.runId || null;
    jobState.stats = report.stats || null;
    jobState.report = typeof ctx.redactReport === 'function' ? ctx.redactReport(report) : report;
    if (typeof ctx.onComplete === 'function') {
      await ctx.onComplete(cloneState(jobState), report);
    }
  } catch (error) {
    jobState.lastError = error?.message || String(error);
    if (typeof ctx.onError === 'function') {
      await ctx.onError(error, cloneState(jobState));
    }
  } finally {
    jobState.running = false;
    jobState.finishedAt = new Date().toISOString();
  }
}

/**
 * Starta commit i bakgrunden. Returnerar direkt — polla via getInternalizeJobState().
 */
function startInternalizeJob(ctx = {}) {
  if (jobState.running) {
    return { accepted: false, already: true, state: getInternalizeJobState() };
  }
  jobState = {
    ...idleState(),
    running: true,
    startedAt: new Date().toISOString(),
    limit: ctx.limit ?? null,
    offset: ctx.offset ?? null,
    tenantId: ctx.tenantId || null,
  };
  setImmediate(() => {
    void executeInternalizeJob(ctx);
  });
  return { accepted: true, state: getInternalizeJobState() };
}

module.exports = {
  startInternalizeJob,
  getInternalizeJobState,
  isInternalizeJobRunning,
  resetInternalizeJobStateForTests,
  executeInternalizeJob,
};
