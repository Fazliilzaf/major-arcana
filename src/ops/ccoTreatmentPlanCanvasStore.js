/**
 * ccoTreatmentPlanCanvasStore — stub (2026-06-02)
 *
 * Pausad bakom Treatment Planning Canvas-spåret. Stubben håller server.js-
 * IIFE vid liv så CF.2–CF.9-routes mountar. Read-metoder returnerar tomt,
 * write-metoder kastar 503.
 */

'use strict';

const SCHEMA_VERSION = '0.0.0-stub';

function disabled(name) {
  const err = new Error(
    `Treatment plan canvas pausad (stub) — '${name}' inte tillgänglig.`
  );
  err.statusCode = 503;
  err.stub = true;
  throw err;
}

async function createCcoTreatmentPlanCanvasStore(_opts = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    isStub: true,
    getByCustomer() { return []; },
    getById() { return null; },
    listPlans() { return []; },
    async createPlan() { return disabled('createPlan'); },
    async updatePlan() { return disabled('updatePlan'); },
    async setStatus() { return disabled('setStatus'); },
    async deletePlan() { return disabled('deletePlan'); },
  };
}

module.exports = { createCcoTreatmentPlanCanvasStore, SCHEMA_VERSION };
