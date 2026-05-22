function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function createInMemoryRateLimitStore({ maxKeys = 20000 } = {}) {
  const bucket = new Map();
  const safeMaxKeys = clampNumber(maxKeys, 20000, 1000, 200000);

  function sweep(nowMs) {
    if (bucket.size <= safeMaxKeys) return;
    for (const [key, entry] of bucket.entries()) {
      if (!entry || Number(entry.resetAt || 0) <= nowMs) {
        bucket.delete(key);
      }
    }
  }

  async function consume({ scope = 'default', key = '', windowMs = 60000, max = 30, nowMs = Date.now() }) {
    const normalizedScope = normalizeText(scope) || 'default';
    const normalizedKey = normalizeText(String(key || 'anonymous')) || 'anonymous';
    const compositeKey = `${normalizedScope}:${normalizedKey}`;

    const safeWindowMs = clampNumber(windowMs, 60000, 5000, 24 * 60 * 60 * 1000);
    const safeMax = clampNumber(max, 30, 1, 100000);

    sweep(nowMs);

    const existing = bucket.get(compositeKey);
    if (!existing || Number(existing.resetAt || 0) <= nowMs) {
      const resetAt = nowMs + safeWindowMs;
      bucket.set(compositeKey, {
        count: 1,
        resetAt,
      });
      return {
        allowed: true,
        limit: safeMax,
        remaining: Math.max(0, safeMax - 1),
        resetAt,
        retryAfterSec: 0,
      };
    }

    if (existing.count >= safeMax) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000));
      return {
        allowed: false,
        limit: safeMax,
        remaining: 0,
        resetAt: existing.resetAt,
        retryAfterSec,
      };
    }

    existing.count += 1;
    bucket.set(compositeKey, existing);

    return {
      allowed: true,
      limit: safeMax,
      remaining: Math.max(0, safeMax - existing.count),
      resetAt: existing.resetAt,
      retryAfterSec: 0,
    };
  }

  function getStats() {
    return {
      backend: 'memory',
      keys: bucket.size,
      maxKeys: safeMaxKeys,
    };
  }

  return {
    consume,
    getStats,
  };
}

const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = ARGV[1]
end
return {current, ttl}
`;

function createRedisRateLimitStore({
  redisClient,
  keyPrefix = 'arcana:ratelimit',
  logger = console,
} = {}) {
  if (!redisClient || typeof redisClient.eval !== 'function') {
    throw new Error('createRedisRateLimitStore kräver en ansluten redisClient.');
  }

  const prefix = normalizeText(keyPrefix) || 'arcana:ratelimit';

  async function consume({ scope = 'default', key = '', windowMs = 60000, max = 30, nowMs = Date.now() }) {
    const normalizedScope = normalizeText(scope) || 'default';
    const normalizedKey = normalizeText(String(key || 'anonymous')) || 'anonymous';
    const safeWindowMs = clampNumber(windowMs, 60000, 5000, 24 * 60 * 60 * 1000);
    const safeMax = clampNumber(max, 30, 1, 100000);

    const redisKey = `${prefix}:${normalizedScope}:${normalizedKey}`;

    let count = 0;
    let ttlMs = safeWindowMs;

    try {
      const result = await redisClient.eval(RATE_LIMIT_LUA, {
        keys: [redisKey],
        arguments: [String(safeWindowMs)],
      });
      if (Array.isArray(result)) {
        count = Number(result[0] || 0);
        ttlMs = Number(result[1] || safeWindowMs);
      }
    } catch (error) {
      logger?.warn?.(`[ratelimit] redis eval failed for ${normalizedScope}: ${error?.message || error}`);
      throw error;
    }

    if (!Number.isFinite(count) || count <= 0) {
      count = 1;
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      ttlMs = safeWindowMs;
    }

    const resetAt = nowMs + ttlMs;
    const allowed = count <= safeMax;
    const retryAfterSec = allowed ? 0 : Math.max(1, Math.ceil(ttlMs / 1000));

    return {
      allowed,
      limit: safeMax,
      remaining: allowed ? Math.max(0, safeMax - count) : 0,
      resetAt,
      retryAfterSec,
    };
  }

  function getStats() {
    return {
      backend: 'redis',
      keyPrefix: prefix,
    };
  }

  return {
    consume,
    getStats,
  };
}

module.exports = {
  createInMemoryRateLimitStore,
  createRedisRateLimitStore,
};
