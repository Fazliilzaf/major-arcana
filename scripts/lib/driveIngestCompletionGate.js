'use strict';

function shouldStopForFailedImports(state = {}, metrics = {}) {
  return (Number(state.failed) || 0) > 0 || (Number(metrics.totalFilesFailedImport) || 0) > 0;
}

function canCompleteDriveIngest({ dryRemaining, snapshot = {}, metrics = {} } = {}) {
  if (Number(dryRemaining) !== 0) {
    return { ok: false, reason: 'remaining', dryRemaining: Number(dryRemaining) };
  }
  if ((Number(metrics.totalFilesFailedImport) || 0) > 0) {
    return {
      ok: false,
      reason: 'persistent_failed',
      totalFilesFailedImport: metrics.totalFilesFailedImport,
    };
  }
  if ((Number(metrics.totalOrphanFiles) || 0) > 0) {
    return { ok: false, reason: 'orphans', totalOrphanFiles: metrics.totalOrphanFiles };
  }
  if ((Number(snapshot.ghostBlobBlockers) || 0) > 0) {
    return { ok: false, reason: 'ghost_blob', ghostBlobBlockers: snapshot.ghostBlobBlockers };
  }
  if ((Number(snapshot.linkOnlyBlockers) || 0) > 0) {
    return { ok: false, reason: 'link_only', linkOnlyBlockers: snapshot.linkOnlyBlockers };
  }
  return { ok: true };
}

module.exports = {
  canCompleteDriveIngest,
  shouldStopForFailedImports,
};
