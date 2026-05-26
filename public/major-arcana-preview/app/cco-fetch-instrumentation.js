/**
 * CCO fetch instrumentation — Fas 1.
 * Wraps central fetch/apiRequest paths and exposes window.__getFetchStats().
 */
(() => {
  'use strict';

  if (window.__ARCANA_CCO_FETCH_INSTRUMENTATION__) return;
  window.__ARCANA_CCO_FETCH_INSTRUMENTATION__ = true;

  const stats = {
    total: 0,
    ok: 0,
    error: 0,
    inFlight: 0,
    deduped: 0,
    lastPath: '',
    lastDurationMs: 0,
    byPathPrefix: Object.create(null),
    startedAt: Date.now(),
  };

  function pathPrefix(path) {
    const text = String(path || '');
    const match = text.match(/^(\/api\/v1\/[^/?#]+)/);
    return match ? match[1] : text.split('?')[0] || 'unknown';
  }

  function bumpPrefix(prefix, field) {
    if (!stats.byPathPrefix[prefix]) {
      stats.byPathPrefix[prefix] = { total: 0, ok: 0, error: 0, lastDurationMs: 0 };
    }
    stats.byPathPrefix[prefix][field] = (stats.byPathPrefix[prefix][field] || 0) + 1;
  }

  function instrumentAsyncFn(fn, { label = 'fetch', getPath = () => '' } = {}) {
    if (typeof fn !== 'function') return fn;
    return async function instrumentedRequest(...args) {
      const path = getPath(...args);
      const prefix = pathPrefix(path);
      const started = performance.now();
      stats.total += 1;
      stats.inFlight += 1;
      stats.lastPath = path;
      bumpPrefix(prefix, 'total');
      try {
        const result = await fn.apply(this, args);
        stats.ok += 1;
        bumpPrefix(prefix, 'ok');
        return result;
      } catch (error) {
        stats.error += 1;
        bumpPrefix(prefix, 'error');
        throw error;
      } finally {
        stats.inFlight = Math.max(0, stats.inFlight - 1);
        const duration = Math.round(performance.now() - started);
        stats.lastDurationMs = duration;
        if (stats.byPathPrefix[prefix]) {
          stats.byPathPrefix[prefix].lastDurationMs = duration;
        }
        void label;
      }
    };
  }

  function noteDedupe(count = 1) {
    stats.deduped += Math.max(0, Number(count) || 0);
  }

  window.__getFetchStats = () => ({
    ...stats,
    byPathPrefix: { ...stats.byPathPrefix },
    uptimeMs: Date.now() - stats.startedAt,
  });

  window.ArcanaCcoFetchInstrumentation = {
    instrumentAsyncFn,
    noteDedupe,
    pathPrefix,
    getStats: () => window.__getFetchStats(),
  };
})();
