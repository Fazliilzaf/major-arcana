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
    const ipLimiter = createRateLimiter({
      store,
      points: layers.ip.points || 200,
      duration: layers.ip.durationSec || 60,
      name: `${name}:ip`,
      keyGenerator: makeIpKey,
    });
    middlewares.push(ipLimiter);
  }

  if (layers.user) {
    const userLimiter = createRateLimiter({
      store,
      points: layers.user.points || 100,
      duration: layers.user.durationSec || 60,
      name: `${name}:user`,
      keyGenerator: (req) => makeUserKey(req) || makeIpKey(req),
    });
    middlewares.push(userLimiter);
  }

  if (layers.tenant) {
    const tenantLimiter = createRateLimiter({
      store,
      points: layers.tenant.points || 1000,
      duration: layers.tenant.durationSec || 60,
      name: `${name}:tenant`,
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
