const test = require('node:test');
const assert = require('node:assert/strict');

const { createRedisRateLimitStore } = require('../../src/security/rateLimitStores');

test('createRedisRateLimitStore throws when redis client lacks eval', () => {
  assert.throws(
    () => createRedisRateLimitStore({ redisClient: { get: () => {} } }),
    /redisClient/
  );
});

test('createRedisRateLimitStore maps lua counter to allow remaining retryAfter', async () => {
  const counts = new Map();
  const redisClient = {
    async eval(_script, { keys, arguments: argv }) {
      const key = keys[0];
      const windowMs = Number(argv[0]);
      const next = (counts.get(key) || 0) + 1;
      counts.set(key, next);
      return [next, windowMs];
    },
  };
  const store = createRedisRateLimitStore({
    redisClient,
    keyPrefix: 'unit:ratelimit',
  });
  const now = 1_700_000_000_000;
  const first = await store.consume({
    scope: 'api',
    key: 'u1',
    max: 2,
    windowMs: 60_000,
    nowMs: now,
  });
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  const second = await store.consume({
    scope: 'api',
    key: 'u1',
    max: 2,
    windowMs: 60_000,
    nowMs: now,
  });
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  const third = await store.consume({
    scope: 'api',
    key: 'u1',
    max: 2,
    windowMs: 60_000,
    nowMs: now,
  });
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.ok(third.retryAfterSec >= 1);

  const stats = store.getStats();
  assert.equal(stats.backend, 'redis');
  assert.equal(stats.keyPrefix, 'unit:ratelimit');
});

test('createRedisRateLimitStore normalizes empty keyPrefix to default', () => {
  const redisClient = {
    async eval() {
      return [1, 60_000];
    },
  };
  const store = createRedisRateLimitStore({
    redisClient,
    keyPrefix: '   ',
  });
  const stats = store.getStats();
  assert.equal(stats.keyPrefix, 'arcana:ratelimit');
});

test('createRedisRateLimitStore clamps max and windowMs before consume', async () => {
  let lastArgs = null;
  const redisClient = {
    async eval(_script, args) {
      lastArgs = args;
      return [1, Number(args.arguments[0])];
    },
  };
  const store = createRedisRateLimitStore({ redisClient, keyPrefix: 'unit' });
  const res = await store.consume({
    scope: 'api',
    key: 'u1',
    max: 0,
    windowMs: 1,
    nowMs: 1_700_000_000_000,
  });
  assert.equal(res.limit, 1);
  assert.equal(lastArgs.arguments[0], '5000');
});

test('createRedisRateLimitStore falls back when lua returns invalid count/ttl', async () => {
  const redisClient = {
    async eval() {
      return ['bad-count', -1];
    },
  };
  const nowMs = 1_700_000_000_000;
  const store = createRedisRateLimitStore({ redisClient, keyPrefix: 'unit' });
  const res = await store.consume({ scope: 'api', key: 'u1', windowMs: 60_000, max: 2, nowMs });
  assert.equal(res.allowed, true);
  assert.equal(res.remaining, 1);
  assert.equal(res.resetAt, nowMs + 60_000);
});

test('createRedisRateLimitStore rethrows eval errors and logs warning', async () => {
  const warnings = [];
  const redisClient = {
    async eval() {
      throw new Error('redis unavailable');
    },
  };
  const logger = {
    warn(msg) {
      warnings.push(String(msg));
    },
  };
  const store = createRedisRateLimitStore({ redisClient, keyPrefix: 'unit', logger });
  await assert.rejects(
    () =>
      store.consume({
        scope: 'api',
        key: 'u1',
        windowMs: 60_000,
        max: 2,
        nowMs: 1_700_000_000_000,
      }),
    /redis unavailable/
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\[ratelimit\] redis eval failed for api/i);
});

test('createRedisRateLimitStore sets remaining to 0 when blocked', async () => {
  const redisClient = {
    async eval() {
      return [9, 30_000];
    },
  };
  const store = createRedisRateLimitStore({ redisClient, keyPrefix: 'unit' });
  const out = await store.consume({
    scope: 'api',
    key: 'u1',
    max: 2,
    windowMs: 60_000,
    nowMs: 1_700_000_000_000,
  });
  assert.equal(out.allowed, false);
  assert.equal(out.remaining, 0);
  assert.ok(out.retryAfterSec >= 1);
});
