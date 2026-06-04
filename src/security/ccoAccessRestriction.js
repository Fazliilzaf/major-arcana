/**
 * ccoAccessRestriction — stub (2026-06-02)
 *
 * Pausad. Returnerar middleware som inte gör något (pass-through), och
 * setAccessRestriction som kastar 503.
 *
 * Syfte: hålla server.js-IIFE vid liv så CF.2–CF.9-routes mountar.
 */

'use strict';

const SCHEMA_VERSION = '0.0.0-stub';

function createAccessRestrictionMiddleware(_opts = {}) {
  // No-op middleware — släpper igenom alla requests
  return function accessRestrictionMiddleware(_req, _res, next) {
    return next();
  };
}

async function setAccessRestriction(_input = {}) {
  const err = new Error(
    "Access restriction pausad (stub) — 'setAccessRestriction' inte tillgänglig."
  );
  err.statusCode = 503;
  err.stub = true;
  throw err;
}

module.exports = {
  createAccessRestrictionMiddleware,
  setAccessRestriction,
  SCHEMA_VERSION,
};
