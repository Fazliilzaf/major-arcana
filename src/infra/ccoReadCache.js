'use strict';

const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stableHash(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex').slice(0, 16);
}

function createMemoryReadCache({ defaultTtlMs = 30_000, maxEntries = 500 } = {}) {
  const entries = new Map();

  function get(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      entries.delete(key);
      return null;
    }
    return entry.value;
  }

  function set(key, value, ttlMs = defaultTtlMs) {
    if (entries.size >= maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest) entries.delete(oldest);
    }
    entries.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || defaultTtlMs),
    });
  }

  function del(keyOrPrefix) {
    const token = normalizeText(keyOrPrefix);
    if (!token) return;
    for (const key of [...entries.keys()]) {
      if (key === token || key.startsWith(token)) entries.delete(key);
    }
  }

  return { get, set, del, backend: 'memory' };
}

function createCcoReadCache({ redisClient = null, keyPrefix = 'cco:read', defaultTtlMs = 30_000 } = {}) {
  const memory = createMemoryReadCache({ defaultTtlMs });
  const prefix = normalizeText(keyPrefix) || 'cco:read';

  function buildKey(namespace, tenantId, suffix = '') {
    const parts = [prefix, normalizeText(namespace), normalizeText(tenantId)];
    if (suffix) parts.push(stableHash(suffix));
    return parts.filter(Boolean).join(':');
  }

  async function get(key) {
    if (redisClient && typeof redisClient.get === 'function') {
      try {
        const raw = await redisClient.get(key);
        if (raw) return JSON.parse(raw);
      } catch {
        /* fallback */
      }
    }
    return memory.get(key);
  }

  async function set(key, value, ttlMs = defaultTtlMs) {
    const ttl = Math.max(1000, Number(ttlMs) || defaultTtlMs);
    memory.set(key, value, ttl);
    if (redisClient && typeof redisClient.setEx === 'function') {
      try {
        await redisClient.setEx(key, Math.ceil(ttl / 1000), JSON.stringify(value));
      } catch {
        /* memory fallback already set */
      }
    }
  }

  async function del(keyOrPrefix) {
    memory.del(keyOrPrefix);
    if (redisClient && typeof redisClient.keys === 'function') {
      try {
        const keys = await redisClient.keys(`${keyOrPrefix}*`);
        if (Array.isArray(keys) && keys.length) {
          await redisClient.del(keys);
        }
      } catch {
        /* ignore */
      }
    }
  }

  async function wrap(key, ttlMs, fn) {
    const cached = await get(key);
    if (cached !== null && cached !== undefined) {
      return { value: cached, cacheHit: true };
    }
    const value = await fn();
    await set(key, value, ttlMs);
    return { value, cacheHit: false };
  }

  return {
    buildKey,
    get,
    set,
    del,
    wrap,
    backend: redisClient ? 'redis+memory' : 'memory',
  };
}

module.exports = {
  createCcoReadCache,
  createMemoryReadCache,
};
