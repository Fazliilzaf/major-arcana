function normalizeSearch(search) {
  const raw = String(search || '').trim();
  if (!raw) return '';
  return raw.startsWith('?') ? raw : `?${raw}`;
}

function parseSearchParams(requestSearch = '') {
  const raw = normalizeSearch(requestSearch);
  if (!raw) return new URLSearchParams();
  return new URLSearchParams(raw.slice(1));
}

/**
 * Maps legacy /cco-next HTML routes to canonical major-arcana-preview paths.
 * Returns null for legacy PWA asset paths (no preview equivalent).
 */
function resolveCcoNextPreviewPath(requestPath, requestSearch = '') {
  const rawPath = String(requestPath || '').trim();
  const normalizedPath = rawPath.toLowerCase();
  if (!normalizedPath.startsWith('/cco-next')) return null;

  if (
    normalizedPath.startsWith('/cco-next/assets/') ||
    normalizedPath === '/cco-next/manifest.json' ||
    normalizedPath === '/cco-next/sw.js' ||
    normalizedPath === '/cco-next/icon.svg'
  ) {
    return null;
  }

  const suffix = rawPath.slice('/cco-next'.length).replace(/^\//, '');
  const params = parseSearchParams(requestSearch);
  const firstSegment = suffix.split('/').filter(Boolean)[0] || '';
  if (firstSegment === 'customers') {
    params.set('view', 'customers');
  }

  const qs = params.toString();
  return `/major-arcana-preview/${qs ? `?${qs}` : ''}`;
}

module.exports = {
  normalizeSearch,
  resolveCcoNextPreviewPath,
};
