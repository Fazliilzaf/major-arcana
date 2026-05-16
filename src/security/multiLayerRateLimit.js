'use strict';

/**
 * Multi-Layer Rate Limit (S10 från Säkerhet & compliance).
 *
 * Wraps existing createRateLimiter med tre lager:
 *   • Per-IP: skydd mot DoS från enskild IP
 *   • Per-user (auth): skydd mot abuse från enskilt auth-konto
 *   • Per-tenant: skydd mot abuse från enskild kund-organisation
 *
 * Returnerar 429 med Retry-After-header vid första triggerade lager.
 *
 * Designprinciper:
 *   • Komponerbar middleware — varje lager kan slås av via config
 *   • Tar upp existing createRateLimiter (ingen ny store-typ)
 *   • Konfigurerbar threshold per resource-type
 */

const { createRateLimiter } = require('./rateLimit');

function makeIpKey(req) {
  // Trust proxy: Render sätter x-forwarded-for
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0].trim();
    if (first) return `ip:${first}`;
  }
  return `ip:${req.ip || req.connection?.remoteAddress || 'unknown'}`;
}

function makeUserKey(req) {
  const userId = req.auth?.user?.id || req.auth?.userId;
  if (userId) return `user:${userId}`;
  return null; // Auth saknas → använd ip-fallback istället
}

function makeTenantKey(req) {
  const tenantId = req.auth?.tenantId;
  if (tenantId) return `tenant:${tenantId}`;
  return null;
}

/**
 * Bygg en multi-layer rate-limit middleware.
 *
 * @param {Object} options
 * @param {Object} options.store     - rate-limit-store (memory eller redis)
 * @param {Object} options.layers    - { ip, user, tenant } each med { points, durationSec }
 * @param {string} options.name      - Identifier för audit/log
 */
function createMultiLayerRateLimit({
  store,
  name = 'multi-layer',
  layers = {},
} = {}) {
  const middlewares = [];

  if (layers.ip) {
    const ipPoints = layers.ip.points || 200;
    const ipDurationSec = layers.ip.durationSec || 60;
    const ipLimiter = createRateLimiter({
      store,
      max: ipPoints,
      windowMs: Math.max(1000, ipDurationSec * 1000),
      scope: `${name}:ip`,
      keyGenerator: makeIpKey,
    });
    middlewares.push(ipLimiter);
  }

  if (layers.user) {
    const userPoints = layers.user.points || 100;
    const userDurationSec = layers.user.durationSec || 60;
    const userLimiter = createRateLimiter({
      store,
      max: userPoints,
      windowMs: Math.max(1000, userDurationSec * 1000),
      scope: `${name}:user`,
      keyGenerator: (req) => makeUserKey(req) || makeIpKey(req),
    });
    middlewares.push(userLimiter);
  }

  if (layers.tenant) {
    const tenantPoints = layers.tenant.points || 1000;
    const tenantDurationSec = layers.tenant.durationSec || 60;
    const tenantLimiter = createRateLimiter({
      store,
      max: tenantPoints,
      windowMs: Math.max(1000, tenantDurationSec * 1000),
      scope: `${name}:tenant`,
      keyGenerator: (req) => makeTenantKey(req) || makeIpKey(req),
    });
    middlewares.push(tenantLimiter);
  }

  // Compose: kör alla lager i sekvens, första 429 avbryter
  return function multiLayerRateLimit(req, res, next) {
    let i = 0;
    function runNext() {
      if (i >= middlewares.length) return next();
      const mw = middlewares[i++];
      mw(req, res, (err) => {
        if (err) return next(err);
        // Om svar redan har skickat (429), avbryt kedjan
        if (res.headersSent) return;
        runNext();
      });
    }
    runNext();
  };
}

module.exports = {
  createMultiLayerRateLimit,
  makeIpKey,
  makeUserKey,
  makeTenantKey,
};
