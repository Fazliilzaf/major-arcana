'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  loadSummary,
  listQueue,
  invalidateImportReviewCache,
} = require('../../src/ops/ccoImportReviewReadService');

const REPO = path.join(__dirname, '../..');
const dataDir = path.join(REPO, 'data');

test('counts halso@ and GetAccept from object items', () => {
  invalidateImportReviewCache();
  const summary = loadSummary(dataDir, REPO);
  if (!summary.liveQueuePath) {
    assert.equal(summary.total, 1497);
    return;
  }
  assert.equal(summary.operatorScope, true);
  assert.ok(summary.total > 0);
  const halso = summary.sources.find((s) => s.id === 'halso');
  const ga = summary.sources.find((s) => s.id === 'getaccept');
  assert.ok(halso.queueCount > 0);
  assert.ok(ga.queueCount > 0);
  assert.equal(halso.queueCount + ga.queueCount, summary.total);
});

test('lists pending queue page read-only', () => {
  invalidateImportReviewCache();
  const page = listQueue(dataDir, { source: 'halso', limit: 5, offset: 0 });
  if (page.total === 0) return;
  assert.ok(page.items.length <= 5);
  assert.equal(page.writeEnabled, false);
  assert.ok(page.items[0].preparedActions?.length > 0);
});
