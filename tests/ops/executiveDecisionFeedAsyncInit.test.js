'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createExecutiveDecisionFeed,
  createPersistentExecutiveDecisionFeed,
} = require('../../src/ops/executiveDecisionFeed');

// Regression för /api/v1/executive/feed 500:
// createPersistentExecutiveDecisionFeed är async → returnerar ett Promise, INTE feed-objektet.
// Om man tilldelar Promiset direkt blir feed.list undefined → route kastar → 500.

test('createExecutiveDecisionFeed (sync) is immediately usable', () => {
  const feed = createExecutiveDecisionFeed();
  assert.equal(typeof feed.list, 'function');
  assert.equal(typeof feed.getSummary, 'function');
  assert.ok(Array.isArray(feed.list()));
  const s = feed.getSummary();
  assert.equal(typeof s.totalActive, 'number');
});

test('createPersistentExecutiveDecisionFeed returns a Promise, not the feed', () => {
  const maybe = createPersistentExecutiveDecisionFeed({ filePath: null });
  assert.ok(typeof maybe.then === 'function', 'persistent factory must be awaited');
  assert.equal(typeof maybe.list, 'undefined', 'Promise has no .list — must not be used directly');
});

test('awaited persistent feed exposes list/getSummary (no 500)', async () => {
  const feed = await createPersistentExecutiveDecisionFeed({ filePath: null });
  assert.equal(typeof feed.list, 'function');
  assert.equal(typeof feed.getSummary, 'function');
  assert.ok(Array.isArray(feed.list({ ownerAction: true, limit: 10 })));
  assert.doesNotThrow(() => feed.getSummary());
});
