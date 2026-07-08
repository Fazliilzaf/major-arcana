#!/usr/bin/env node
'use strict';

/**
 * BankID/Criipto go-live env på Render prod (merge PUT).
 * Kräver CRIIPTO_CLIENT_ID + CRIIPTO_CLIENT_SECRET (från .env eller CLI).
 *
 * Exempel:
 *   CRIIPTO_CLIENT_ID=urn:... CRIIPTO_CLIENT_SECRET=... node scripts/apply-portal-bankid-prod.js
 *   node scripts/apply-portal-bankid-prod.js --partial   # bara icke-hemliga nycklar
 */
require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const { resolveRenderApiKey, fetchAllRenderEnvMap } = require('./lib/renderEnvApi.js');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';
const partial = process.argv.includes('--partial');

/** Prod-kanonisk bas — dotenv får aldrig skriva över detta. */
const PROD_PUBLIC_BASE_URL = 'https://arcana.hairtpclinic.com';

const bankIdKeys = {
  CRIIPTO_DOMAIN: process.env.CRIIPTO_DOMAIN || 'hairtpclinic.test.idura.broker',
  CRIIPTO_CLIENT_ID: process.env.CRIIPTO_CLIENT_ID || '',
  CRIIPTO_CLIENT_SECRET: process.env.CRIIPTO_CLIENT_SECRET || '',
  BANKID_API_KEY: process.env.BANKID_API_KEY || 'criipto',
  PORTAL_BANKID_LIVE: process.env.PORTAL_BANKID_LIVE || '1',
  PORTAL_SESSION_SECRET:
    process.env.PORTAL_SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  PUBLIC_BASE_URL: PROD_PUBLIC_BASE_URL,
};

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

async function main() {
  const apiKey = resolveRenderApiKey();
  if (!apiKey) fail('Saknar Render API key (~/.render/cli.yaml eller RENDER_API_KEY)');

  if (!partial) {
    if (!bankIdKeys.CRIIPTO_CLIENT_ID.trim()) {
      fail('Saknar CRIIPTO_CLIENT_ID — hämta från Criipto dashboard eller kör --partial');
    }
    if (!bankIdKeys.CRIIPTO_CLIENT_SECRET.trim()) {
      fail('Saknar CRIIPTO_CLIENT_SECRET — hämta från Criipto dashboard eller kör --partial');
    }
  } else {
    delete bankIdKeys.CRIIPTO_CLIENT_ID;
    delete bankIdKeys.CRIIPTO_CLIENT_SECRET;
    delete bankIdKeys.PORTAL_BANKID_LIVE;
  }

  const map = await fetchAllRenderEnvMap(serviceId, apiKey);
  const existingSessionSecret = text(map.get('PORTAL_SESSION_SECRET'));
  for (const [key, value] of Object.entries(bankIdKeys)) {
    if (
      key === 'PORTAL_SESSION_SECRET' &&
      existingSessionSecret &&
      !text(process.env.PORTAL_SESSION_SECRET)
    ) {
      map.set(key, existingSessionSecret);
      continue;
    }
    map.set(key, value);
  }

  const payload = JSON.stringify([...map.entries()].map(([key, value]) => ({ key, value })));
  const putRes = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: payload,
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    fail(`Render env PUT failed: ${putRes.status} ${text.slice(0, 240)}`);
  }

  const setKeys = Object.keys(bankIdKeys);
  console.log(`✅ Render env uppdaterad (${map.size} nycklar totalt)`);
  for (const key of setKeys) {
    if (key.includes('SECRET') || key.includes('CLIENT_SECRET')) {
      console.log(`   ${key}=*** (${String(bankIdKeys[key]).length} tecken)`);
    } else {
      console.log(`   ${key}=${bankIdKeys[key]}`);
    }
  }

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
  if (!deployRes.ok && deployRes.status !== 202) {
    fail(`Render deploy failed: ${deployRes.status} ${deployText.slice(0, 200)}`);
  }
  let deploy = {};
  try {
    deploy = deployText ? JSON.parse(deployText) : {};
  } catch {
    deploy = {};
  }
  console.log(`✅ Deploy startad: ${deploy.id || deploy.deploy?.id || deployRes.status || 'ok'}`);
}

main().catch((err) => fail(err.message || String(err)));
