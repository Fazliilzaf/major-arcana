'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectBatchSlice, emptyBatchStats } = require('../../scripts/lib/halsoHdBatchIngest');

test('selectBatchSlice returns correct batch window', () => {
  const entries = Array.from({ length: 120 }, (_, i) => ({ id: String(i) }));
  const batch1 = selectBatchSlice(entries, { batch: 1, batchSize: 50 });
  const batch2 = selectBatchSlice(entries, { batch: 2, batchSize: 50 });
  const batch3 = selectBatchSlice(entries, { batch: 3, batchSize: 50 });
  assert.equal(batch1.length, 50);
  assert.equal(batch1[0].id, '0');
  assert.equal(batch2[0].id, '50');
  assert.equal(batch3.length, 20);
});

test('emptyBatchStats starts at zero', () => {
  const stats = emptyBatchStats();
  assert.equal(stats.processed, 0);
  assert.equal(stats.matched, 0);
});
