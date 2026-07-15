'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canCompleteDriveIngest,
  shouldStopForFailedImports,
} = require('../../scripts/lib/driveIngestCompletionGate');

test('shouldStopForFailedImports stoppar vid run-failed eller persistent failed', () => {
  assert.equal(shouldStopForFailedImports({ failed: 1 }, { totalFilesFailedImport: 0 }), true);
  assert.equal(shouldStopForFailedImports({ failed: 0 }, { totalFilesFailedImport: 2 }), true);
  assert.equal(shouldStopForFailedImports({ failed: 0 }, { totalFilesFailedImport: 0 }), false);
});

test('canCompleteDriveIngest kräver remaining=0 och inga blockerare', () => {
  assert.deepEqual(
    canCompleteDriveIngest({
      dryRemaining: 0,
      snapshot: { ghostBlobBlockers: 0, linkOnlyBlockers: 0 },
      metrics: { totalFilesFailedImport: 0, totalOrphanFiles: 0 },
    }),
    { ok: true }
  );
  assert.equal(
    canCompleteDriveIngest({
      dryRemaining: 3,
      snapshot: {},
      metrics: {},
    }).reason,
    'remaining'
  );
  assert.equal(
    canCompleteDriveIngest({
      dryRemaining: 0,
      snapshot: { linkOnlyBlockers: 1 },
      metrics: { totalFilesFailedImport: 0, totalOrphanFiles: 0 },
    }).reason,
    'link_only'
  );
});
