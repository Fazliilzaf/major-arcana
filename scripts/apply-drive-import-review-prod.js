#!/usr/bin/env node
'use strict';

/**
 * Aktivera Drive Import Review R2 canary på Render prod.
 *
 * Sätter:
 *   ENABLE_CCO_OPERATOR_CANARY=true
 *   ENABLE_DRIVE_IMPORT_REVIEW_WRITE=true
 *   DRIVE_IMPORT_REVIEW_CANARY_MAX_DECISIONS=50
 *
 * Usage:
 *   node scripts/apply-drive-import-review-prod.js
 *   DRIVE_IMPORT_REVIEW_WRITE=false node scripts/apply-drive-import-review-prod.js  # av
 */

require('dotenv').config({ quiet: true });

const { resolveRenderApiKey, fetchAllRenderEnvMap } = require('./lib/renderEnvApi');

const SERVICE_ID = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';
const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const WRITE_ENABLED = String(process.env.DRIVE_IMPORT_REVIEW_WRITE ?? 'true').trim() !== 'false';
const CANARY_MAX = String(process.env.DRIVE_IMPORT_REVIEW_CANARY_MAX_DECISIONS || '50').trim();

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function waitForReadyz() {
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    const readyRes = await fetch(`${BASE}/readyz`).catch(() => null);
    if (readyRes?.ok) {
      const body = await readyRes.json().catch(() => ({}));
      if (body.ready === true) return body;
    }
    console.log(`… väntar readyz ${attempt}/36`);
    await new Promise((r) => setTimeout(r, 10000));
  }
  fail('Timeout — readyz blev inte true efter deploy/restart');
}

async function main() {
  const apiKey = resolveRenderApiKey();
  if (!apiKey) fail('Saknar Render API key (~/.render/cli.yaml eller RENDER_API_KEY)');

  const map = await fetchAllRenderEnvMap(SERVICE_ID, apiKey);
  map.set('ENABLE_CCO_OPERATOR_CANARY', WRITE_ENABLED ? 'true' : 'false');
  map.set('ENABLE_DRIVE_IMPORT_REVIEW_WRITE', WRITE_ENABLED ? 'true' : 'false');
  map.set('DRIVE_IMPORT_REVIEW_CANARY_MAX_DECISIONS', CANARY_MAX);

  const payload = JSON.stringify([...map.entries()].map(([key, value]) => ({ key, value })));
  const putRes = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/env-vars`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: payload,
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    fail(`Render env PUT failed: ${putRes.status} ${text.slice(0, 240)}`);
  }

  console.log(`✅ Render env (${map.size} vars):`);
  console.log(`   ENABLE_CCO_OPERATOR_CANARY=${map.get('ENABLE_CCO_OPERATOR_CANARY')}`);
  console.log(`   ENABLE_DRIVE_IMPORT_REVIEW_WRITE=${map.get('ENABLE_DRIVE_IMPORT_REVIEW_WRITE')}`);
  console.log(
    `   DRIVE_IMPORT_REVIEW_CANARY_MAX_DECISIONS=${map.get('DRIVE_IMPORT_REVIEW_CANARY_MAX_DECISIONS')}`
  );

  const deployRes = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  if (!deployRes.ok && deployRes.status !== 202) {
    const text = await deployRes.text();
    fail(`Render deploy failed: ${deployRes.status} ${text.slice(0, 200)}`);
  }
  console.log('✅ Deploy/restart startad — väntar på readyz…');
  const ready = await waitForReadyz();
  console.log(`✅ readyz OK @ ${BASE} (commit ${ready.commit?.slice(0, 7) || '—'})`);
}

main().catch((err) => fail(err.message || String(err)));
