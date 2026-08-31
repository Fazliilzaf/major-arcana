#!/usr/bin/env node
'use strict';

/**
 * Push Cliento env till Render prod (merge PUT).
 * Krävs för .com med ARCANA_PROVIDER=cliento.
 */
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

// ORD-156: merge-PUT går via renderEnvApi (paginerad GET + spärrar). Egen GET
// med ?limit=100 utan cursor trunkerar vid 100 nycklar, och render.yaml
// deklarerar 122 — en sådan PUT raderar tyst resten.
const { fetchAllRenderEnvMap, putRenderEnvMerged } = require('./lib/renderEnvApi');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';

const CLIENTO_KEYS = [
  'CLIENTO_PARTNER_ID',
  'CLIENTO_API_KEY',
  'CLIENTO_API_BASE_URL',
  'CLIENTO_ACCOUNT_IDS',
  'CLIENTO_BOOKING_URL',
  'CLIENTO_WIDGET_SRC',
  'CLIENTO_SERVICE_FILTERS',
  'CLIENTO_LOCALE',
  'CLIENTO_MERGE_LOCATIONS',
  'CLIENTO_API_AUTH_HEADER',
  'CLIENTO_API_AUTH_SCHEME',
  'CLIENTO_API_TIMEOUT_MS',
  'CLIENTO_PARTNER_ID_HAIR_TP_CLINIC',
  'CLIENTO_API_KEY_HAIR_TP_CLINIC',
  'CLIENTO_ACCOUNT_IDS_HAIR_TP_CLINIC',
  'CLIENTO_BOOKING_URL_HAIR_TP_CLINIC',
  'CLIENTO_WIDGET_SRC_HAIR_TP_CLINIC',
  'CLIENTO_SERVICE_FILTERS_HAIR_TP_CLINIC',
];

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const clientoKeys = {};
for (const key of CLIENTO_KEYS) {
  const value = (process.env[key] || '').trim();
  if (value) clientoKeys[key] = value;
}

if (!clientoKeys.CLIENTO_PARTNER_ID && !clientoKeys.CLIENTO_PARTNER_ID_HAIR_TP_CLINIC) {
  fail('Saknar CLIENTO_PARTNER_ID (eller _HAIR_TP_CLINIC) i .env');
}
if (!clientoKeys.CLIENTO_API_KEY && !clientoKeys.CLIENTO_API_KEY_HAIR_TP_CLINIC) {
  console.warn(
    '⚠ Saknar CLIENTO_API_KEY — slots kan faila tills nyckel läggs i .env och script körs igen'
  );
}

const cliPath = path.join(process.env.HOME, '.render/cli.yaml');
const cliYaml = fs.readFileSync(cliPath, 'utf8');
const apiKey = (cliYaml.match(/key: (rnd_\S+)/) || [])[1];
if (!apiKey) fail('Saknar Render API key i ~/.render/cli.yaml');

async function main() {
  // Läs befintliga för fallback-besluten nedan. Paginerat — se ORD-156.
  const current = await fetchAllRenderEnvMap(serviceId, apiKey);

  const updates = { ...clientoKeys };

  // Global fallback så prod fungerar även om brand-env läses sent vid boot.
  if (!current.get('CLIENTO_PARTNER_ID') && clientoKeys.CLIENTO_PARTNER_ID_HAIR_TP_CLINIC) {
    updates.CLIENTO_PARTNER_ID = clientoKeys.CLIENTO_PARTNER_ID_HAIR_TP_CLINIC;
  }
  if (!current.get('CLIENTO_ACCOUNT_IDS') && clientoKeys.CLIENTO_ACCOUNT_IDS_HAIR_TP_CLINIC) {
    updates.CLIENTO_ACCOUNT_IDS = clientoKeys.CLIENTO_ACCOUNT_IDS_HAIR_TP_CLINIC;
  }
  if (!current.get('CLIENTO_BOOKING_URL') && clientoKeys.CLIENTO_BOOKING_URL_HAIR_TP_CLINIC) {
    updates.CLIENTO_BOOKING_URL = clientoKeys.CLIENTO_BOOKING_URL_HAIR_TP_CLINIC;
  }

  const { before, after, changed } = await putRenderEnvMerged(serviceId, updates, { apiKey });

  console.log(`✅ Render env uppdaterad (${before} → ${after} nycklar) — Cliento keys merged`);
  console.log(`   ändrade: ${changed.join(', ') || 'inga'}`);

  const deployRes = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const deployText = await deployRes.text();
  let deployId = 'ok';
  try {
    const deploy = JSON.parse(deployText);
    deployId = deploy.id || deploy.deploy?.id || deployId;
  } catch {
    if (!deployRes.ok)
      fail(`Render deploy failed: ${deployRes.status} ${deployText.slice(0, 200)}`);
  }
  console.log(`✅ Deploy startad: ${deployId}`);
}

main().catch((err) => fail(err.message || String(err)));
