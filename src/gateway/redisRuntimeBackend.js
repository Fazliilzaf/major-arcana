const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function sleep(ms) {
  const safeMs = Math.max(0, Number(ms || 0));
  if (safeMs === 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, safeMs));
}

const RELEASE_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

function createRedisExecutionRuntimeBackend({
  redisClient,
  keyPrefix = 'arcana:gateway',
  logger = console,
  queueLockTtlMs = 30000,
  queueAcquireTimeoutMs = 10000,
  queuePollIntervalMs = 80,
  idempotencyTtlMs = 10 * 60 * 1000,
} = {}) {
  if (!redisClient || typeof redisClient.set !== 'function' || typeof redisClient.get !== 'function') {
    throw new Error('createRedisExecutionRuntimeBackend kräver en redisClient.');
  }

  const prefix = normalizeText(keyPrefix) || 'arcana:gateway';
  const safeLockTtlMs = clampNumber(queueLockTtlMs, 30000, 5000, 5 * 60 * 1000);
  const safeAcquireTimeoutMs = clampNumber(queueAcquireTimeoutMs, 10000, 500, 60 * 1000);
  const safePollIntervalMs = clampNumber(queuePollIntervalMs, 80, 20, 1000);
  const safeIdempotencyTtlMs = clampNumber(idempotencyTtlMs, 10 * 60 * 1000, 1000, 24 * 60 * 60 * 1000);

  const stats = {
    backend: 'redis',
    queue: {
      lockTtlMs: safeLockTtlMs,
      acquireTimeoutMs: safeAcquireTimeoutMs,
      pollIntervalMs: safePollIntervalMs,
      waits: 0,
      lockTimeouts: 0,
      lockErrors: 0,
    },
    idempotency: {
      ttlMs: safeIdempotencyTtlMs,
      readHits: 0,
      writes: 0,
      readErrors: 0,
      writeErrors: 0,
    },
  };

  async function runSerialized({ tenantId = '', task }) {
    const normalizedTenantId = normalizeText(tenantId);
    if (!normalizedTenantId || typeof task !== 'function') {
      return task();
    }

    const lockKey = `${prefix}:queue:tenant:${normalizedTenantId}`;
    const token = crypto.randomUUID();
    const deadline = Date.now() + safeAcquireTimeoutMs;
    let acquired = false;

    while (!acquired && Date.now() < deadline) {
      try {
        const lockResult = await redisClient.set(lockKey, token, {
          NX: true,
          PX: safeLockTtlMs,
        });
        if (lockResult === 'OK') {
          acquired = true;
          break;
        }
      } catch (error) {
        stats.queue.lockErrors += 1;
        logger?.warn?.(`[gateway:redis] queue lock failed: ${error?.message || error}`);
      }
      stats.queue.waits += 1;
      await sleep(safePollIntervalMs);
    }

    if (!acquired) {
      stats.queue.lockTimeouts += 1;
      throw new Error('gateway_tenant_queue_lock_timeout');
    }

    try {
      return await task();
    } finally {
      try {
        await redisClient.eval(RELEASE_LOCK_LUA, {
          keys: [lockKey],
          arguments: [token],
        });
      } catch (error) {
        stats.queue.lockErrors += 1;
        logger?.warn?.(`[gateway:redis] queue lock release failed: ${error?.message || error}`);
      }
    }
  }

  async function getResolvedIdempotency({ tenantId = '', idempotencyKey = '' } = {}) {
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedKey = normalizeText(idempotencyKey);
    if (!normalizedTenantId || !normalizedKey) return null;

    const redisKey = `${prefix}:idem:${normalizedTenantId}:${normalizedKey}`;
    try {
      const payload = await redisClient.get(redisKey);
      if (!payload) return null;
      const parsed = JSON.parse(payload);
      if (!parsed || typeof parsed !== 'object') return null;
      stats.idempotency.readHits += 1;
      return parsed.result || null;
    } catch (error) {
      stats.idempotency.readErrors += 1;
      logger?.warn?.(`[gateway:redis] idempotency read failed: ${error?.message || error}`);
      return null;
    }
  }

  async function setResolvedIdempotency({
    tenantId = '',
    idempotencyKey = '',
    result = null,
    ttlMs = safeIdempotencyTtlMs,
  } = {}) {
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedKey = normalizeText(idempotencyKey);
    if (!normalizedTenantId || !normalizedKey || !result) return;

    const redisKey = `${prefix}:idem:${normalizedTenantId}:${normalizedKey}`;
    const payload = JSON.stringify({
      storedAt: new Date().toISOString(),
      result,
    });
    const safeTtlMs = clampNumber(ttlMs, safeIdempotencyTtlMs, 1000, 24 * 60 * 60 * 1000);

    try {
      await redisClient.set(redisKey, payload, {
        PX: safeTtlMs,
      });
      stats.idempotency.writes += 1;
    } catch (error) {
      stats.idempotency.writeErrors += 1;
      logger?.warn?.(`[gateway:redis] idempotency write failed: ${error?.message || error}`);
    }
  }

  async function onDeadLetter(deadLetter) {
    if (!deadLetter || typeof deadLetter !== 'object') return;
    const redisKey = `${prefix}:deadletters`;
    try {
      await redisClient.lPush(redisKey, JSON.stringify(deadLetter));
      await redisClient.lTrim(redisKey, 0, 999);
    } catch (error) {
      logger?.warn?.(`[gateway:redis] dead-letter write failed: ${error?.message || error}`);
    }
  }

  function getStats() {
    return {
      ...stats,
      keyPrefix: prefix,
    };
  }

  return {
    runSerialized,
    getResolvedIdempotency,
    setResolvedIdempotency,
    onDeadLetter,
    getStats,
  };
}

module.exports = {
  createRedisExecutionRuntimeBackend,
};
