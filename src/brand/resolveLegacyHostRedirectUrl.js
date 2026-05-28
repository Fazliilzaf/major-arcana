const { normalizeHost } = require('./resolveBrand');

/** Frankfurt-cutover: legacy .se-alias → canonical .com (301). */
const DEFAULT_LEGACY_HOST_REDIRECTS = Object.freeze({
  'arcana.hairtpclinic.se': 'https://arcana.hairtpclinic.com',
  'ma.hairtpclinic.se': 'https://arcana.hairtpclinic.com',
});

function normalizeSearch(search) {
  const raw = String(search || '').trim();
  if (!raw) return '';
  return raw.startsWith('?') ? raw : `?${raw}`;
}

function normalizeRedirectMap(redirectMap = {}) {
  const normalized = {};
  for (const [host, origin] of Object.entries(redirectMap)) {
    const normalizedHost = normalizeHost(host);
    const normalizedOrigin = String(origin || '').trim();
    if (!normalizedHost || !normalizedOrigin) continue;
    normalized[normalizedHost] = normalizedOrigin;
  }
  return normalized;
}

function resolveLegacyHostRedirectUrl({
  requestHost,
  requestPath = '/',
  requestSearch = '',
  redirectMap = DEFAULT_LEGACY_HOST_REDIRECTS,
  enabled = true,
} = {}) {
  if (!enabled) return null;

  const normalizedRequestHost = normalizeHost(requestHost);
  if (!normalizedRequestHost) return null;

  const map = normalizeRedirectMap(redirectMap);
  const canonicalOrigin =
    map[normalizedRequestHost] || map[normalizeHost(normalizedRequestHost.replace(/^www\./, ''))];
  if (!canonicalOrigin) return null;

  let canonicalHost = '';
  try {
    canonicalHost = normalizeHost(new URL(canonicalOrigin).host);
  } catch {
    return null;
  }
  if (canonicalHost && normalizedRequestHost === canonicalHost) return null;

  const normalizedPath = String(requestPath || '/').trim() || '/';
  try {
    return new URL(
      `${normalizedPath}${normalizeSearch(requestSearch)}`,
      canonicalOrigin
    ).toString();
  } catch {
    return null;
  }
}

module.exports = {
  DEFAULT_LEGACY_HOST_REDIRECTS,
  resolveLegacyHostRedirectUrl,
};
