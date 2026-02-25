function normalizeOrigin(origin) {
  if (typeof origin !== 'string') return '';
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

function safeOriginFromUrl(urlValue) {
  if (!urlValue || typeof urlValue !== 'string') return '';
  try {
    return normalizeOrigin(new URL(urlValue).origin);
  } catch {
    return '';
  }
}

function addOrigin(allowedOrigins, originValue) {
  const normalized = normalizeOrigin(originValue);
  if (normalized) allowedOrigins.add(normalized);
}

function addHostOrigins(allowedOrigins, hostValue) {
  if (typeof hostValue !== 'string') return;
  const host = hostValue.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!host) return;

  addOrigin(allowedOrigins, `https://${host}`);
  if (
    host === 'localhost' ||
    host.startsWith('localhost:') ||
    host === '127.0.0.1' ||
    host.startsWith('127.0.0.1:')
  ) {
    addOrigin(allowedOrigins, `http://${host}`);
  }
}

function collectAllowedCorsOrigins(config) {
  const allowedOrigins = new Set();
  const fromEnv = Array.isArray(config?.corsAllowedOrigins)
    ? config.corsAllowedOrigins
    : [];

  for (const origin of fromEnv) {
    addOrigin(allowedOrigins, origin);
  }

  const fromPublicBaseUrl = safeOriginFromUrl(config?.publicBaseUrl);
  addOrigin(allowedOrigins, fromPublicBaseUrl);

  const brandByHost = config?.brandByHost && typeof config.brandByHost === 'object'
    ? config.brandByHost
    : {};
  for (const host of Object.keys(brandByHost)) {
    addHostOrigins(allowedOrigins, host);
  }

  return Array.from(allowedOrigins.values());
}

function createCorsPolicy(config) {
  const strict = Boolean(config?.corsStrict);
  const includeCredentials = Boolean(config?.corsAllowCredentials);
  const allowNoOrigin = Boolean(config?.corsAllowNoOrigin);

  if (!strict) {
    return {
      origin: true,
      credentials: includeCredentials,
    };
  }

  const allowedOrigins = new Set(collectAllowedCorsOrigins(config));

  return {
    origin(origin, callback) {
      if (!origin) {
        return callback(null, allowNoOrigin);
      }
      const normalized = normalizeOrigin(origin);
      return callback(null, allowedOrigins.has(normalized));
    },
    credentials: includeCredentials,
  };
}

module.exports = {
  createCorsPolicy,
  collectAllowedCorsOrigins,
};
