const { createInMemoryRateLimitStore } = require('./rateLimitStores');

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function defaultKeyGenerator(req) {
  return String(req.ip || 'unknown-ip');
}

function createRateLimiter({
  windowMs = 60_000,
  max = 30,
  keyGenerator = defaultKeyGenerator,
  message = 'För många förfrågningar. Försök igen snart.',
  store = null,
  scope = 'default',
} = {}) {
  const safeWindowMs = clampNumber(windowMs, 60_000, 5_000, 24 * 60 * 60 * 1000);
  const safeMax = clampNumber(max, 30, 1, 10_000);
  const normalizedScope = String(scope || 'default').trim() || 'default';
  const rateLimitStore =
    store && typeof store.consume === 'function' ? store : createInMemoryRateLimitStore();

  return async function rateLimiter(req, res, next) {
    try {
      const nowMs = Date.now();
      const key = String((typeof keyGenerator === 'function' && keyGenerator(req)) || 'anonymous');
      const result = await rateLimitStore.consume({
        scope: normalizedScope,
        key,
        windowMs: safeWindowMs,
        max: safeMax,
        nowMs,
      });
      const limit = Number.isFinite(Number(result?.limit)) ? Number(result.limit) : safeMax;
      const remaining = Number.isFinite(Number(result?.remaining))
        ? Math.max(0, Number(result.remaining))
        : 0;
      const resetAtMs = Number.isFinite(Number(result?.resetAt))
        ? Number(result.resetAt)
        : nowMs + safeWindowMs;
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAtMs / 1000)));

      if (result?.allowed === false) {
        const retryAfterSec = Number.isFinite(Number(result?.retryAfterSec))
          ? Math.max(1, Number(result.retryAfterSec))
          : 1;
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({
          error: message,
          retryAfterSec,
        });
      }

      return next();
    } catch {
      // Fail-open to avoid total outage if backend is degraded.
      return next();
    }
  };
}

module.exports = {
  createRateLimiter,
};
