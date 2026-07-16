'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createDriveIngestRuntimeControl,
  evaluateDriveIngestHardGate,
} = require('../../src/ops/ccoDriveIngestRuntimeControl');

function withControl(nowValue = Date.parse('2026-07-15T00:00:00.000Z')) {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-ingest-control-'));
  let current = nowValue;
  const control = createDriveIngestRuntimeControl({ stateRoot, now: () => current });
  return {
    control,
    stateRoot,
    advance(ms) {
      current += ms;
    },
    cleanup() {
      fs.rmSync(stateRoot, { recursive: true, force: true });
    },
  };
}

test('manual pause persists until an explicit resume', () => {
  const fixture = withControl();
  try {
    fixture.control.pause({ reason: 'manual_stop' });
    const restartedControl = createDriveIngestRuntimeControl({
      stateRoot: fixture.stateRoot,
    });
    assert.equal(restartedControl.readControl().paused, true);
    fixture.control.resume();
    assert.equal(fixture.control.readControl().paused, false);
  } finally {
    fixture.cleanup();
  }
});

test('lease prevents a second runner until the first lease is stale', () => {
  const fixture = withControl();
  try {
    assert.equal(fixture.control.acquireLease({ ownerId: 'a' }).acquired, true);
    assert.equal(fixture.control.acquireLease({ ownerId: 'b' }).acquired, false);
    fixture.advance(10 * 60 * 1000 + 1);
    assert.equal(fixture.control.acquireLease({ ownerId: 'b' }).acquired, true);
  } finally {
    fixture.cleanup();
  }
});

test('hard gates include failed and needs-review rows', () => {
  assert.deepEqual(evaluateDriveIngestHardGate({ failed: 2 }), {
    reason: 'failed_import',
    count: 2,
  });
  assert.deepEqual(evaluateDriveIngestHardGate({ needsReview: 1 }), {
    reason: 'needs_review',
    count: 1,
  });
  assert.equal(evaluateDriveIngestHardGate({ imported: 3 }), null);
});

test('a caller can replace transient report review counts with persisted run counts', () => {
  const reportStats = { imported: 130, needsReview: 1, failed: 0 };
  const persistedNeedsReview = 0;

  assert.equal(
    evaluateDriveIngestHardGate({ ...reportStats, needsReview: persistedNeedsReview }),
    null
  );
  assert.deepEqual(
    evaluateDriveIngestHardGate({ ...reportStats, needsReview: 1 }),
    { reason: 'needs_review', count: 1 }
  );
});
