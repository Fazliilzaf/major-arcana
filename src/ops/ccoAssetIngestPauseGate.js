'use strict';

// ── CCO Asset-ingest hård-gate + auto-resume-beslut (PURE) ──
// Ren, IO-fri logik så den kan enhetstestas utan server-closuren.
//
// OBS: main har redan PERSISTENT paus via ccoDriveIngestRuntimeControl
// (stateRoot/cco-drive-ingest-control.json, med lease + heartbeat + atomiska
// skrivningar). Den här modulen adderar bara det som faktiskt saknades:
//  1. evaluateHardGate — en BREDARE hård-gate som även trippar på orphan-filer,
//     ghost-blob-blockers och link-only-blockers (via buildAssetQaSnapshot),
//     inte bara failed/needsReview som evaluateDriveIngestHardGate.
//  2. shouldAutoResume — ren beslutslogik för watchdogen med tydlig precedens
//     (disabled → persistent_pause → already_running → backoff).

function evaluateHardGate({ state = {}, snapshot } = {}) {
  if (state && state.lastError) {
    return { tripped: true, reason: 'last_error', detail: String(state.lastError) };
  }

  const runFailed = Number(state.failed) || 0;
  if (runFailed > 0) {
    return { tripped: true, reason: 'failed_imports', detail: { runFailed } };
  }

  const runNeedsReview = Number(state.needsReview) || 0;
  if (runNeedsReview > 0) {
    return { tripped: true, reason: 'needs_review', detail: { runNeedsReview } };
  }

  if (!snapshot || typeof snapshot !== 'object' || !snapshot.metrics) {
    return { tripped: true, reason: 'unclear_snapshot', detail: 'missing_metrics' };
  }

  const metrics = snapshot.metrics || {};
  const totalFilesFailedImport = Number(metrics.totalFilesFailedImport) || 0;
  if (totalFilesFailedImport > 0) {
    return { tripped: true, reason: 'failed_imports', detail: { totalFilesFailedImport } };
  }

  const totalOrphanFiles = Number(metrics.totalOrphanFiles) || 0;
  if (totalOrphanFiles > 0) {
    return { tripped: true, reason: 'orphan_files', detail: { totalOrphanFiles } };
  }

  const ghostBlobBlockers = Number(snapshot.ghostBlobBlockers) || 0;
  if (ghostBlobBlockers > 0) {
    return { tripped: true, reason: 'ghost_blob_blockers', detail: { ghostBlobBlockers } };
  }

  const linkOnlyBlockers = Number(snapshot.linkOnlyBlockers) || 0;
  if (linkOnlyBlockers > 0) {
    return { tripped: true, reason: 'link_only_blockers', detail: { linkOnlyBlockers } };
  }

  return { tripped: false };
}

// PURE beslutslogik för watchdogen. Precedens: disabled → persistent_pause →
// already_running → backoff → resume.
function shouldAutoResume({ enabled, running, paused, now = Date.now(), backoffUntil = 0 } = {}) {
  if (!enabled) return { resume: false, reason: 'disabled' };
  if (paused) return { resume: false, reason: 'persistent_pause' };
  if (running) return { resume: false, reason: 'already_running' };
  if (now < (Number(backoffUntil) || 0)) return { resume: false, reason: 'backoff' };
  return { resume: true };
}

module.exports = {
  evaluateHardGate,
  shouldAutoResume,
};
