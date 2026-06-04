'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  assertCanaryAllows,
  recordCanaryDecision,
  loadState,
  getTrackSummary,
} = require('../../src/ops/ccoOperatorCanary');

test('assertCanaryAllows blocks at max 25 decisions', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-canary-'));
  const prev = process.env.ARCANA_STATE_ROOT;
  process.env.ARCANA_STATE_ROOT = tmp;
  try {
    for (let i = 0; i < 25; i += 1) {
      recordCanaryDecision('photo', { approved: 1 }, { projectRoot: tmp, maxDecisions: 25 });
    }
    const { state } = loadState(tmp);
    const summary = getTrackSummary(state, 'photo', 25);
    assert.equal(summary.limitReached, true);
    assert.throws(
      () => assertCanaryAllows('photo', { projectRoot: tmp, maxDecisions: 25, enabled: true }),
      (err) => err.statusCode === 429
    );
  } finally {
    if (prev == null) delete process.env.ARCANA_STATE_ROOT;
    else process.env.ARCANA_STATE_ROOT = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('recordCanaryDecision tracks import counters separately', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-canary-'));
  const prev = process.env.ARCANA_STATE_ROOT;
  process.env.ARCANA_STATE_ROOT = tmp;
  try {
    recordCanaryDecision(
      'import',
      { approved: 2, rejected: 1 },
      { projectRoot: tmp, maxDecisions: 25 }
    );
    const { state } = loadState(tmp);
    assert.equal(state.import.approved, 2);
    assert.equal(state.import.rejected, 1);
    assert.equal(state.import.decisionsUsed, 1);
  } finally {
    if (prev == null) delete process.env.ARCANA_STATE_ROOT;
    else process.env.ARCANA_STATE_ROOT = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
