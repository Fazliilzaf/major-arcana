const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRedisExecutionRuntimeBackend,
} = require('../../src/gateway/redisRuntimeBackend');

function createFakeRedis() {
  const store = new Map();
  return {
    async set(key, value, opts) {
      if (opts?.NX && store.has(key)) return null;
      store.set(key, String(value));
      return 'OK';
    },
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async eval(_script, { keys, arguments: argv }) {
      const k = keys[0];
      if (store.get(k) === argv[0]) {
        store.delete(k);
        return 1;
      }
      return 0;
    },
    async lPush() {},
    async lTrim() {},
  };
}

test('createRedisExecutionRuntimeBackend throws without redis client', () => {
  assert.throws(
    () => createRedisExecutionRuntimeBackend({ redisClient: null }),
    /redisClient/
  );
});

test('runSerialized acquires per-tenant lock runs task and releases', async () => {
  const redisClient = createFakeRedis();
  const backend = createRedisExecutionRuntimeBackend({
    redisClient,
    keyPrefix: 'test:gw',
    queuePollIntervalMs: 0,
  });
  const out = await backend.runSerialized({
    tenantId: 't1',
    task: async () => 'done',
  });
  assert.equal(out, 'done');
});

test('runSerialized with blank tenant runs task without locking', async () => {
  const redisClient = createFakeRedis();
  const backend = createRedisExecutionRuntimeBackend({ redisClient });
  let ran = false;
  await backend.runSerialized({
    tenantId: '   ',
    task: async () => {
      ran = true;
    },
  });
  assert.equal(ran, true);
});

test('idempotency helpers round-trip stored result', async () => {
  const redisClient = createFakeRedis();
  const backend = createRedisExecutionRuntimeBackend({ redisClient });
  assert.equal(await backend.getResolvedIdempotency({ tenantId: '', idempotencyKey: 'k' }), null);
  await backend.setResolvedIdempotency({
    tenantId: 'acme',
    idempotencyKey: 'req-1',
    result: { ok: true, n: 1 },
  });
  const hit = await backend.getResolvedIdempotency({
    tenantId: 'acme',
    idempotencyKey: 'req-1',
  });
  assert.deepEqual(hit, { ok: true, n: 1 });
  const s = backend.getStats();
  assert.equal(s.backend, 'redis');
  assert.ok(s.idempotency.readHits >= 1);
});
