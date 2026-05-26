'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCcoReadCache } = require('../../src/infra/ccoReadCache');

test('createCcoReadCache wraps and hits memory cache', async () => {
  const cache = createCcoReadCache({ defaultTtlMs: 60_000 });
  let calls = 0;
  const first = await cache.wrap('test:key', 60_000, async () => {
    calls += 1;
    return { ok: true };
  });
  const second = await cache.wrap('test:key', 60_000, async () => {
    calls += 1;
    return { ok: false };
  });
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(second.value.ok, true);
  assert.equal(calls, 1);
});

test('createCcoReadCache buildKey scopes by tenant', () => {
  const cache = createCcoReadCache();
  const a = cache.buildKey('patients', 'tenant-a', 'q=foo');
  const b = cache.buildKey('patients', 'tenant-b', 'q=foo');
  assert.notEqual(a, b);
});
