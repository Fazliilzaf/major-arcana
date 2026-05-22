function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function tryLoadRedisFactory() {
  try {
    const mod = require('redis');
    if (mod && typeof mod.createClient === 'function') {
      return mod.createClient;
    }
  } catch {
    // optional dependency; handled by status response
  }
  return null;
}

function createRedisConnection({
  url = '',
  connectTimeoutMs = 4000,
  required = false,
  logger = console,
} = {}) {
  const normalizedUrl = normalizeText(url);
  const createClient = tryLoadRedisFactory();

  let client = null;
  let enabled = Boolean(normalizedUrl);
  let connected = false;
  let lastError = null;

  function getStatus() {
    return {
      enabled,
      connected,
      moduleAvailable: Boolean(createClient),
      required: Boolean(required),
      urlConfigured: Boolean(normalizedUrl),
      lastError,
    };
  }

  async function connect() {
    enabled = Boolean(normalizedUrl);
    if (!enabled) {
      connected = false;
      return getStatus();
    }

    if (!createClient) {
      connected = false;
      lastError = 'redis_module_missing';
      if (required) {
        throw new Error('ARCANA_REDIS_REQUIRED=true men npm-paketet "redis" saknas.');
      }
      logger?.warn?.('[redis] module missing, fallback to memory backend');
      return getStatus();
    }

    try {
      client = createClient({
        url: normalizedUrl,
        socket: {
          connectTimeout: parsePositiveInt(connectTimeoutMs, 4000),
        },
      });
      client.on('error', (error) => {
        lastError = normalizeText(error?.message || 'redis_error');
      });
      await client.connect();
      connected = Boolean(client?.isReady || client?.isOpen);
      lastError = null;
      return getStatus();
    } catch (error) {
      connected = false;
      lastError = normalizeText(error?.message || 'redis_connect_failed') || 'redis_connect_failed';
      if (required) {
        throw error;
      }
      logger?.warn?.(`[redis] connect failed, fallback to memory backend: ${lastError}`);
      return getStatus();
    }
  }

  async function close() {
    if (!client) return;
    try {
      if (typeof client.quit === 'function') {
        await client.quit();
      } else if (typeof client.disconnect === 'function') {
        await client.disconnect();
      }
    } catch {
      // ignore shutdown errors
    } finally {
      connected = false;
      client = null;
    }
  }

  return {
    connect,
    close,
    getStatus,
    getClient: () => client,
    isConnected: () => Boolean(connected && client),
  };
}

module.exports = {
  createRedisConnection,
};
