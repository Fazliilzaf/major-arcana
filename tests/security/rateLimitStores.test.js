const test = require('node:test');
const assert = require('node:assert/strict');

const { createInMemoryRateLimitStore } = require('../../src/security/rateLimitStores');

test('in-memory store allows until max then blocks with retryAfterSec', async () => {
  const store = createInMemoryRateLimitStore();
  const now = 1_700_000_000_000;

  const first = await store.consume({ scope: 'api', key: 'u1', max: 2, windowMs: 60_000, nowMs: now });
  const second = await store.consume({ scope: 'api', key: 'u1', max: 2, windowMs: 60_000, nowMs: now + 1 });
  const third = await store.consume({ scope: 'api', key: 'u1', max: 2, windowMs: 60_000, nowMs: now + 2 });

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.ok(third.retryAfterSec >= 1);
});

test('in-memory store resets counter after window expiry', async () => {
  const store = createInMemoryRateLimitStore();
  const now = 1_700_000_000_000;

  await store.consume({ scope: 'api', key: 'u1', max: 1, windowMs: 10_000, nowMs: now });
  const blocked = await store.consume({ scope: 'api', key: 'u1', max: 1, windowMs: 10_000, nowMs: now + 100 });
  const reset = await store.consume({ scope: 'api', key: 'u1', max: 1, windowMs: 10_000, nowMs: now + 10_001 });

  assert.equal(blocked.allowed, false);
  assert.equal(reset.allowed, true);
  assert.equal(reset.remaining, 0);
});

test('in-memory store normalizes scope/key and clamps min window/max', async () => {
  const store = createInMemoryRateLimitStore();
  const now = 1_700_000_000_000;

  const a = await store.consume({
    scope: '  my-scope ',
    key: '  ',
    max: 0,
    windowMs: 1,
    nowMs: now,
  });
  const b = await store.consume({
    scope: 'my-scope',
    key: 'anonymous',
    max: 1,
    windowMs: 5_000,
    nowMs: now + 1,
  });

  assert.equal(a.limit, 1);
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, false);
});

test('in-memory store keeps counters separated by scope', async () => {
  const store = createInMemoryRateLimitStore();
  const now = 1_700_000_000_000;

  await store.consume({ scope: 'api-a', key: 'u1', max: 1, windowMs: 60_000, nowMs: now });
  const inOtherScope = await store.consume({
    scope: 'api-b',
    key: 'u1',
    max: 1,
    windowMs: 60_000,
    nowMs: now + 1,
  });

  assert.equal(inOtherScope.allowed, true);
});

test('in-memory store getStats reports clamped maxKeys bounds', () => {
  const low = createInMemoryRateLimitStore({ maxKeys: 1 });
  const high = createInMemoryRateLimitStore({ maxKeys: 999999999 });
  assert.equal(low.getStats().maxKeys, 1000);
  assert.equal(high.getStats().maxKeys, 200000);
});

test('in-memory store defaults scope/key to default:anonymous when missing', async () => {
  const store = createInMemoryRateLimitStore();
  const now = 1_700_000_000_000;
  const a = await store.consume({ nowMs: now, max: 1, windowMs: 60_000 });
  const b = await store.consume({ nowMs: now + 1, max: 1, windowMs: 60_000 });
  assert.equal(a.allowed, true);
  assert.equal(b.allowed, false);
});

