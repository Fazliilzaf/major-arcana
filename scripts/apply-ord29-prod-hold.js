#!/usr/bin/env node
'use strict';

/**
 * ORD-29 prod-hold: Phase 2 ingest AV + asset store på persistent disk (Frankfurt).
 */
require('dotenv').config({ quiet: true });

// ORD-156: merge-PUT går via renderEnvApi. Egen GET med ?limit=100 utan cursor
// trunkerar vid 100 nycklar, och render.yaml deklarerar 122 — en sådan PUT
// raderar tyst resten. Skriv aldrig egen GET+PUT mot env-vars här.
const { putRenderEnvMerged } = require('./lib/renderEnvApi');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';

const KEYS = {
  ARCANA_CCO_HALSO_HD_INGEST_ENABLED: 'false',
  ARCANA_CCO_PATIENT_ASSETS_PATH: '/var/data/cco-patient-assets.json',
  ARCANA_CCO_ASSET_IMPORT_RUNS_PATH: '/var/data/cco-asset-import-runs.json',
  ARCANA_CCO_ASSET_REVIEW_QUEUE_PATH: '/var/data/cco-asset-review-queue.json',
};

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function main() {
  const { before, after, changed } = await putRenderEnvMerged(serviceId, KEYS);

  console.log(`✅ ORD-29 prod-hold applied on ${serviceId}`);
  console.log(`   env-nycklar: ${before} → ${after} (ändrade: ${changed.join(', ') || 'inga'})`);
  for (const [key, value] of Object.entries(KEYS)) {
    console.log(`   ${key}=${value}`);
  }
}

main().catch((err) => fail(err.message));
