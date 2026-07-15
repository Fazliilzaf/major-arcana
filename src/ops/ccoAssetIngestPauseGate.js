'use strict';

// ── CCO Asset-ingest hård-gate + persistent paus ──
// Isolerad, ren logik så den kan enhetstestas utan server-closuren.
// SÄKERHET FRAMFÖR ALLT: vid minsta osäkerhet — persistera en paus och stoppa,
// fortsätt aldrig förbi en tripped gate. Samma hårda grindar som den säkra
// runnern (poll-drive-ingest-until-done + driveIngestCompletionGate).

const fs = require('node:fs');
const path = require('node:path');

function stateRootOf(stateRoot) {
  return stateRoot || process.env.ARCANA_STATE_ROOT || '/var/data';
}

function pausePath(stateRoot) {
  return path.join(stateRootOf(stateRoot), 'asset-ingest-pause.json');
}

function readPause(stateRoot) {
  try {
    const raw = fs.readFileSync(pausePath(stateRoot), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.paused === true) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writePause(stateRoot, { reason, detail } = {}) {
  const record = {
    paused: true,
    reason: reason || 'manual',
    detail: detail ?? null,
    at: new Date().toISOString(),
  };
  try {
    const p = pausePath(stateRoot);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(record, null, 2));
  } catch {
    /* never throw — fail safe: caller still stops */
  }
  return record;
}

function clearPause(stateRoot) {
  try {
    fs.rmSync(pausePath(stateRoot), { force: true });
  } catch {
    /* never throw */
  }
}

// PURE hård-gate. Samma stoppvillkor som den säkra runnern, plus needsReview
// och "unclear response" (saknad/ogiltig snapshot → behandla som tripped).
// Returnerar { tripped, reason?, detail? }. Ordningen är avsiktlig.
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
  pausePath,
  readPause,
  writePause,
  clearPause,
  evaluateHardGate,
  shouldAutoResume,
};
