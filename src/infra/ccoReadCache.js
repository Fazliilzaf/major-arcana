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

  // ORD-85 — in-flight-dedupliering. Utan den startar varje samtidig miss sin
  // EGEN fulla laddning, eftersom den första inte hunnit fram till set().
  //
  // Det tog ner prod 2026-07-27. Nyckeln för identitetspopulationen är per
  // TENANT, inte per patient, och laddaren hämtar hela patientregistret.
  // Uppmätt mot realistisk poststorlek: ett anrop +517 MB heap, tre
  // överlappande +1 516 MB. Node kastade aldrig "out of memory" — processen
  // svällde tills containern tog den, därför bara "Instance restarted" i loggen.
  //
  // Kartan håller PÅGÅENDE löften, aldrig färdiga värden. Den är inte en cache
  // ovanpå cachen — posten tas bort i finally så en misslyckad laddning aldrig
  // fastnar som permanent svar, och ett kast når alla väntande anropare.
  const inFlight = new Map();

  async function wrap(key, ttlMs, fn) {
    const cached = await get(key);
    if (cached !== null && cached !== undefined) {
      return { value: cached, cacheHit: true };
    }
    const pending = inFlight.get(key);
    if (pending) {
      // Delar den pågående laddningen. cacheHit=false — det här ÄR en miss,
      // den råkar bara redan vara på väg. Att rapportera true hade dolt
      // stampede-trycket i statistiken.
      return { value: await pending, cacheHit: false };
    }
    const promise = (async () => {
      const value = await fn();
      await set(key, value, ttlMs);
      return value;
    })();
    inFlight.set(key, promise);
    try {
      return { value: await promise, cacheHit: false };
    } finally {
      inFlight.delete(key);
    }
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
