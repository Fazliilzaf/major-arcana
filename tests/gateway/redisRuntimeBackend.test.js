const test = require('node:test');
const assert = require('node:assert/strict');

const { createRedisExecutionRuntimeBackend } = require('../../src/gateway/redisRuntimeBackend');

function createFakeRedis() {
  const store = new Map();
  const calls = {
    set: [],
    eval: [],
  };
  return {
    store,
    calls,
    async set(key, value, opts) {
      calls.set.push({ key, value, opts });
      if (opts?.NX && store.has(key)) return null;
      store.set(key, String(value));
      return 'OK';
    },
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async eval(_script, { keys, arguments: argv }) {
      calls.eval.push({ keys, arguments: argv });
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
  assert.throws(() => createRedisExecutionRuntimeBackend({ redisClient: null }), /redisClient/);
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
  assert.equal(redisClient.store.has('test:gw:queue:tenant:t1'), false);
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
  assert.equal(redisClient.calls.set.length, 0);
});

test('runSerialized plan mode bypasses per-tenant lock', async () => {
  const redisClient = createFakeRedis();
  const backend = createRedisExecutionRuntimeBackend({
    redisClient,
    keyPrefix: 'test:gw',
  });

  const out = await backend.runSerialized({
    tenantId: 't1',
    mode: 'plan',
    correlationId: 'corr-plan',
    task: async () => 'planned',
  });

  assert.equal(out, 'planned');
  assert.equal(redisClient.calls.set.length, 0);
  assert.equal(redisClient.store.has('test:gw:queue:tenant:t1'), false);
});

test('runSerialized execute mode serializes same-tenant runs', async () => {
  const redisClient = createFakeRedis();
  const backend = createRedisExecutionRuntimeBackend({
    redisClient,
    keyPrefix: 'test:gw',
    queuePollIntervalMs: 20,
    executionTimeoutMs: 1000,
  });
  let active = 0;
  let maxActive = 0;
  const order = [];

  const first = backend.runSerialized({
    tenantId: 't1',
    mode: 'execute',
    task: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push('first:start');
      await new Promise((resolve) => setTimeout(resolve, 50));
      order.push('first:end');
      active -= 1;
      return 'first';
    },
  });
  const second = backend.runSerialized({
    tenantId: 't1',
    mode: 'execute',
    task: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      order.push('second:start');
      active -= 1;
      order.push('second:end');
      return 'second';
    },
  });

  const out = await Promise.all([first, second]);
  assert.deepEqual(out, ['first', 'second']);
  assert.equal(maxActive, 1);
  assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'second:end']);
});

test('runSerialized execution timeout aborts task and releases lock', async () => {
  const logs = [];
  const redisClient = createFakeRedis();
  const backend = createRedisExecutionRuntimeBackend({
    redisClient,
    keyPrefix: 'test:gw',
    queueLockTtlMs: 5000,
    executionTimeoutMs: 25,
    logger: {
      warn: (...args) => logs.push(args),
    },
  });
  let receivedSignal = null;

  await assert.rejects(
    () =>
      backend.runSerialized({
        tenantId: 't1',
        mode: 'execute',
        correlationId: 'corr-timeout',
        task: async ({ signal }) => {
          receivedSignal = signal;
          await new Promise(() => {});
        },
      }),
    (error) => error?.code === 'gateway_execution_timeout'
  );

  assert.equal(receivedSignal?.aborted, true);
  assert.equal(redisClient.store.has('test:gw:queue:tenant:t1'), false);

  const after = await backend.runSerialized({
    tenantId: 't1',
    mode: 'execute',
    task: async () => 'after-timeout',
  });
  assert.equal(after, 'after-timeout');
  assert.equal(backend.getStats().queue.executionTimeouts, 1);
  assert.equal(
    logs.some(
      (entry) => entry[0] === '[gateway:redis] execution_timeout' && entry[1]?.tenantId === 't1'
    ),
    true
  );
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
