const { normalizeHost } = require('./resolveBrand');
const { CANONICAL_PUBLIC_ORIGIN } = require('./canonicalPublicOrigin');

/**
 * Frankfurt-cutover: legacy .se-alias → canonical .com (301).
 *
 * NYCKLARNA SKA LIGGA KVAR. De är domänigenkänning, inte fallbacks — tas de
 * bort slutar gamla länkar i patienternas inkorgar att fungera. Det är VÄRDENA
 * som ska komma från en enda källa, och gör det nu.
 */
const DEFAULT_LEGACY_HOST_REDIRECTS = Object.freeze({
  'arcana.hairtpclinic.se': CANONICAL_PUBLIC_ORIGIN,
  'ma.hairtpclinic.se': CANONICAL_PUBLIC_ORIGIN,
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
