#!/usr/bin/env node
'use strict';

/**
 * ORD-29 prod-hold: Phase 2 ingest AV + asset store på persistent disk (Frankfurt).
 */
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

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

const cliPath = path.join(process.env.HOME, '.render/cli.yaml');
if (!fs.existsSync(cliPath)) fail('Saknar ~/.render/cli.yaml');
const apiKey = (fs.readFileSync(cliPath, 'utf8').match(/key: (rnd_\S+)/) || [])[1];
if (!apiKey) fail('Saknar Render API key');

async function main() {
  const existingRes = await fetch(
    `https://api.render.com/v1/services/${serviceId}/env-vars?limit=100`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );
  if (!existingRes.ok) fail(`Render GET env failed: ${existingRes.status}`);
  const existing = await existingRes.json();
  const map = new Map(
    existing.map((row) => {
      const ev = row.envVar || row;
      return [ev.key, ev.value ?? ''];
    })
  );

  for (const [key, value] of Object.entries(KEYS)) {
    map.set(key, value);
  }

  const putRes = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([...map.entries()].map(([key, value]) => ({ key, value }))),
  });
  if (!putRes.ok) {
    fail(`Render env PUT failed: ${putRes.status} ${(await putRes.text()).slice(0, 200)}`);
  }

  console.log(`✅ ORD-29 prod-hold applied on ${serviceId}`);
  for (const [key, value] of Object.entries(KEYS)) {
    console.log(`   ${key}=${value}`);
  }
}

main().catch((err) => fail(err.message));
