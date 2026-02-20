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
} = {}) {
  const safeWindowMs = clampNumber(windowMs, 60_000, 5_000, 24 * 60 * 60 * 1000);
  const safeMax = clampNumber(max, 30, 1, 10_000);
  const bucket = new Map();

  function sweep(now) {
    if (bucket.size <= 2_000) return;
    for (const [key, entry] of bucket.entries()) {
      if (!entry || entry.resetAt <= now) {
        bucket.delete(key);
      }
    }
  }

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    sweep(now);

    const key = String((typeof keyGenerator === 'function' && keyGenerator(req)) || 'anonymous');
    const existing = bucket.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + safeWindowMs;
      bucket.set(key, {
        count: 1,
        resetAt,
      });
      res.setHeader('X-RateLimit-Limit', String(safeMax));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, safeMax - 1)));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
      return next();
    }

    if (existing.count >= safeMax) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.setHeader('X-RateLimit-Limit', String(safeMax));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(existing.resetAt / 1000)));
      return res.status(429).json({
        error: message,
        retryAfterSec,
      });
    }

    existing.count += 1;
    bucket.set(key, existing);
    res.setHeader('X-RateLimit-Limit', String(safeMax));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, safeMax - existing.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(existing.resetAt / 1000)));
    return next();
  };
}

module.exports = {
  createRateLimiter,
};
