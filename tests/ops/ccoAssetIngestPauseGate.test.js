'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateHardGate, shouldAutoResume } = require('../../src/ops/ccoAssetIngestPauseGate');

const cleanSnapshot = {
  metrics: { totalFilesFailedImport: 0, totalOrphanFiles: 0 },
  ghostBlobBlockers: 0,
  linkOnlyBlockers: 0,
};

test('evaluateHardGate does not trip on a clean snapshot', () => {
  const gate = evaluateHardGate({ state: {}, snapshot: cleanSnapshot });
  assert.equal(gate.tripped, false);
});

test('evaluateHardGate trips on state.lastError', () => {
  const gate = evaluateHardGate({ state: { lastError: 'boom' }, snapshot: cleanSnapshot });
  assert.equal(gate.tripped, true);
  assert.equal(gate.reason, 'last_error');
});

test('evaluateHardGate trips on state.failed > 0', () => {
  const gate = evaluateHardGate({ state: { failed: 2 }, snapshot: cleanSnapshot });
  assert.equal(gate.tripped, true);
  assert.equal(gate.reason, 'failed_imports');
});

test('evaluateHardGate trips on state.needsReview > 0', () => {
  const gate = evaluateHardGate({ state: { needsReview: 1 }, snapshot: cleanSnapshot });
  assert.equal(gate.tripped, true);
  assert.equal(gate.reason, 'needs_review');
});

test('evaluateHardGate trips on metrics.totalFilesFailedImport > 0', () => {
  const gate = evaluateHardGate({
    state: {},
    snapshot: { metrics: { totalFilesFailedImport: 3, totalOrphanFiles: 0 } },
  });
  assert.equal(gate.tripped, true);
  assert.equal(gate.reason, 'failed_imports');
});

test('evaluateHardGate trips on metrics.totalOrphanFiles > 0', () => {
  const gate = evaluateHardGate({
    state: {},
    snapshot: { metrics: { totalFilesFailedImport: 0, totalOrphanFiles: 5 } },
  });
  assert.equal(gate.tripped, true);
  assert.equal(gate.reason, 'orphan_files');
});

test('evaluateHardGate trips on ghostBlobBlockers > 0', () => {
  const gate = evaluateHardGate({
    state: {},
    snapshot: {
      metrics: { totalFilesFailedImport: 0, totalOrphanFiles: 0 },
      ghostBlobBlockers: 1,
      linkOnlyBlockers: 0,
    },
  });
  assert.equal(gate.tripped, true);
  assert.equal(gate.reason, 'ghost_blob_blockers');
});

test('evaluateHardGate trips on linkOnlyBlockers > 0', () => {
  const gate = evaluateHardGate({
    state: {},
    snapshot: {
      metrics: { totalFilesFailedImport: 0, totalOrphanFiles: 0 },
      ghostBlobBlockers: 0,
      linkOnlyBlockers: 4,
    },
  });
  assert.equal(gate.tripped, true);
  assert.equal(gate.reason, 'link_only_blockers');
});

test('evaluateHardGate trips on unclear snapshot (null)', () => {
  const gate = evaluateHardGate({ state: {}, snapshot: null });
  assert.equal(gate.tripped, true);
  assert.equal(gate.reason, 'unclear_snapshot');
});

test('evaluateHardGate trips on unclear snapshot (no metrics)', () => {
  const gate = evaluateHardGate({ state: {}, snapshot: { foo: 'bar' } });
  assert.equal(gate.tripped, true);
  assert.equal(gate.reason, 'unclear_snapshot');
});

test('shouldAutoResume resumes when enabled, idle and unpaused', () => {
  assert.deepEqual(shouldAutoResume({ enabled: true, running: false, paused: false }), {
    resume: true,
  });
});

test('shouldAutoResume precedence: disabled beats pause beats running beats backoff', () => {
  assert.deepEqual(
    shouldAutoResume({
      enabled: false,
      running: true,
      paused: true,
      now: 0,
      backoffUntil: 10_000,
    }),
    { resume: false, reason: 'disabled' }
  );
  assert.deepEqual(
    shouldAutoResume({ enabled: true, running: true, paused: true, now: 0, backoffUntil: 10_000 }),
    { resume: false, reason: 'persistent_pause' }
  );
  assert.deepEqual(
    shouldAutoResume({ enabled: true, running: true, paused: false, now: 0, backoffUntil: 10_000 }),
    { resume: false, reason: 'already_running' }
  );
  assert.deepEqual(
    shouldAutoResume({
      enabled: true,
      running: false,
      paused: false,
      now: 0,
      backoffUntil: 10_000,
    }),
    { resume: false, reason: 'backoff' }
  );
});
