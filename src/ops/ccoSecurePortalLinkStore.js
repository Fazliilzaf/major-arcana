/**
 * ccoSecurePortalLinkStore — stub (2026-06-02)
 *
 * Pausad bakom secure-portal-link-spåret. Stubben håller server.js-IIFE
 * vid liv så CF.2–CF.9-routes mountar. Read-metoder returnerar null/empty,
 * write-metoder kastar 503.
 */

'use strict';

const SCHEMA_VERSION = '0.0.0-stub';

function disabled(name) {
  const err = new Error(
    `Secure portal link pausad (stub) — '${name}' inte tillgänglig.`
  );
  err.statusCode = 503;
  err.stub = true;
  throw err;
}

async function createCcoSecurePortalLinkStore(_opts = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    isStub: true,
    // Peek = read-only, returnera null om länk inte finns
    peek() { return null; },
    listAll() { return []; },
    // Skapa länk eller konsumera → 503 (paused)
    async createLink() { return disabled('createLink'); },
    async consume() { return disabled('consume'); },
    async revoke() { return disabled('revoke'); },
  };
}

module.exports = { createCcoSecurePortalLinkStore, SCHEMA_VERSION };
