#!/usr/bin/env node
'use strict';

/**
 * Push Cliento env till Render prod (merge PUT).
 * Krävs för .com med ARCANA_PROVIDER=cliento.
 */
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d6b11o0boq4c73chm7f0';

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
  console.warn('⚠ Saknar CLIENTO_API_KEY — slots kan faila tills nyckel läggs i .env och script körs igen');
}

const cliPath = path.join(process.env.HOME, '.render/cli.yaml');
const cliYaml = fs.readFileSync(cliPath, 'utf8');
const apiKey = (cliYaml.match(/key: (rnd_\S+)/) || [])[1];
if (!apiKey) fail('Saknar Render API key i ~/.render/cli.yaml');

async function main() {
  const existingRes = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!existingRes.ok) fail(`Render GET env failed: ${existingRes.status}`);
  const existing = await existingRes.json();
  const map = new Map(
    existing.map((row) => {
      const ev = row.envVar || row;
      return [ev.key, ev.value ?? ''];
    })
  );

for (const [key, value] of Object.entries(clientoKeys)) {
  map.set(key, value);
}

// Global fallback så prod fungerar även om brand-env läses sent vid boot.
if (!map.get('CLIENTO_PARTNER_ID') && clientoKeys.CLIENTO_PARTNER_ID_HAIR_TP_CLINIC) {
  map.set('CLIENTO_PARTNER_ID', clientoKeys.CLIENTO_PARTNER_ID_HAIR_TP_CLINIC);
}
if (!map.get('CLIENTO_ACCOUNT_IDS') && clientoKeys.CLIENTO_ACCOUNT_IDS_HAIR_TP_CLINIC) {
  map.set('CLIENTO_ACCOUNT_IDS', clientoKeys.CLIENTO_ACCOUNT_IDS_HAIR_TP_CLINIC);
}
if (!map.get('CLIENTO_BOOKING_URL') && clientoKeys.CLIENTO_BOOKING_URL_HAIR_TP_CLINIC) {
  map.set('CLIENTO_BOOKING_URL', clientoKeys.CLIENTO_BOOKING_URL_HAIR_TP_CLINIC);
}

  const payload = JSON.stringify([...map.entries()].map(([key, value]) => ({ key, value })));
  const putRes = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: payload,
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    fail(`Render env PUT failed: ${putRes.status} ${text.slice(0, 200)}`);
  }

  console.log(`✅ Render env uppdaterad (${map.size} nycklar) — Cliento keys merged`);

  const deployRes = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const deployText = await deployRes.text();
  let deployId = 'ok';
  try {
    const deploy = JSON.parse(deployText);
    deployId = deploy.id || deploy.deploy?.id || deployId;
  } catch {
    if (!deployRes.ok) fail(`Render deploy failed: ${deployRes.status} ${deployText.slice(0, 200)}`);
  }
  console.log(`✅ Deploy startad: ${deployId}`);
}

main().catch((err) => fail(err.message || String(err)));
