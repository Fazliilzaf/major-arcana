const { normalizeHost } = require('./resolveBrand');

function normalizeSearch(search) {
  const raw = String(search || '').trim();
  if (!raw) return '';
  return raw.startsWith('?') ? raw : `?${raw}`;
}

function resolveCcoNextCanonicalUrl({
  requestHost,
  requestPath,
  requestSearch = '',
  canonicalOrigin,
  redirectHosts = [],
} = {}) {
  const normalizedPath = String(requestPath || '').trim();
  if (!normalizedPath.startsWith('/cco-next')) return null;

  const normalizedRequestHost = normalizeHost(requestHost);
  const normalizedCanonicalHost = normalizeHost(canonicalOrigin);
  if (!normalizedRequestHost || !normalizedCanonicalHost) return null;
  if (normalizedRequestHost === normalizedCanonicalHost) return null;

  const normalizedRedirectHosts = redirectHosts
    .map((value) => normalizeHost(value))
    .filter(Boolean);
  if (!normalizedRedirectHosts.includes(normalizedRequestHost)) return null;

  return new URL(
    `${normalizedPath}${normalizeSearch(requestSearch)}`,
    canonicalOrigin
  ).toString();
}

module.exports = { resolveCcoNextCanonicalUrl };
