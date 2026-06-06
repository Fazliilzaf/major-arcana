#!/usr/bin/env node
'use strict';

/**
 * D1/D3 — Push CMO connector live config to Render prod.
 *
 * Modes:
 *   bridge (default) — generic HTTP via /api/internal/marketing-bridge (no Google/Meta tokens)
 *   platform         — native adapters; requires full ARCANA_MARKETING_* tokens in .env
 *
 * Usage:
 *   npm run apply:cmo-connectors-prod
 *   CMO_CONNECTOR_MODE=platform npm run apply:cmo-connectors-prod
 */
require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';
const mode = String(process.env.CMO_CONNECTOR_MODE || 'bridge').toLowerCase();
const baseUrl = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function hasPlatformGoogle() {
  return Boolean(
    (process.env.ARCANA_MARKETING_GOOGLE_ADS_CUSTOMER_ID || '').trim() &&
    (process.env.ARCANA_MARKETING_GOOGLE_ADS_DEVELOPER_TOKEN || '').trim() &&
    (process.env.ARCANA_MARKETING_GOOGLE_ADS_ACCESS_TOKEN || '').trim()
  );
}

function hasPlatformMeta() {
  return Boolean(
    (process.env.ARCANA_MARKETING_META_AD_ACCOUNT_ID || '').trim() &&
    (process.env.ARCANA_MARKETING_META_ACCESS_TOKEN || '').trim()
  );
}

function hasPlatformLinkedIn() {
  return Boolean(
    (process.env.ARCANA_MARKETING_LINKEDIN_AD_ACCOUNT_ID || '').trim() &&
    (process.env.ARCANA_MARKETING_LINKEDIN_ACCESS_TOKEN || '').trim()
  );
}

function bridgeKeys(bridgeToken) {
  const bridgePath = (channel) => `/api/internal/marketing-bridge/${channel}/metrics`;
  return {
    ARCANA_MARKETING_CONNECTORS_ENABLED: 'true',
    ARCANA_MARKETING_CONNECTORS_MODE: 'live',
    ARCANA_MARKETING_CONNECTORS_LIVE_FETCH: 'true',
    ARCANA_MARKETING_BRIDGE_TOKEN: bridgeToken,
    ARCANA_MARKETING_CONNECTOR_ALERT_AFTER_MS: '900000',
    ARCANA_MARKETING_GOOGLE_ADS_ENABLED: 'true',
    ARCANA_MARKETING_GOOGLE_ADS_LIVE_FETCH: 'true',
    ARCANA_MARKETING_GOOGLE_ADS_API_BASE_URL: baseUrl,
    ARCANA_MARKETING_GOOGLE_ADS_METRICS_PATH: bridgePath('google_ads'),
    ARCANA_MARKETING_GOOGLE_ADS_ACCESS_TOKEN: bridgeToken,
    ARCANA_MARKETING_GOOGLE_ADS_CUSTOMER_ID: '',
    ARCANA_MARKETING_GOOGLE_ADS_DEVELOPER_TOKEN: '',
    ARCANA_MARKETING_META_ENABLED: 'true',
    ARCANA_MARKETING_META_LIVE_FETCH: 'true',
    ARCANA_MARKETING_META_API_BASE_URL: baseUrl,
    ARCANA_MARKETING_META_METRICS_PATH: bridgePath('meta'),
    ARCANA_MARKETING_META_ACCESS_TOKEN: bridgeToken,
    ARCANA_MARKETING_META_AD_ACCOUNT_ID: '',
    ARCANA_MARKETING_LINKEDIN_ENABLED: 'true',
    ARCANA_MARKETING_LINKEDIN_LIVE_FETCH: 'true',
    ARCANA_MARKETING_LINKEDIN_API_BASE_URL: baseUrl,
    ARCANA_MARKETING_LINKEDIN_METRICS_PATH: bridgePath('linkedin'),
    ARCANA_MARKETING_LINKEDIN_ACCESS_TOKEN: bridgeToken,
    ARCANA_MARKETING_LINKEDIN_AD_ACCOUNT_ID: '',
    ARCANA_MARKETING_MAIL_ENABLED: 'true',
    ARCANA_MARKETING_MAIL_LIVE_FETCH: 'true',
    ARCANA_MARKETING_MAIL_API_BASE_URL: baseUrl,
    ARCANA_MARKETING_MAIL_METRICS_PATH: bridgePath('mail'),
    ARCANA_MARKETING_MAIL_ACCESS_TOKEN: bridgeToken,
  };
}

function platformKeys() {
  const keys = {
    ARCANA_MARKETING_CONNECTORS_ENABLED: 'true',
    ARCANA_MARKETING_CONNECTORS_MODE: 'live',
    ARCANA_MARKETING_CONNECTORS_LIVE_FETCH: 'true',
    ARCANA_MARKETING_CONNECTOR_ALERT_AFTER_MS: '900000',
    ARCANA_MARKETING_GOOGLE_ADS_ENABLED: hasPlatformGoogle() ? 'true' : 'false',
    ARCANA_MARKETING_META_ENABLED: hasPlatformMeta() ? 'true' : 'false',
    ARCANA_MARKETING_LINKEDIN_ENABLED: hasPlatformLinkedIn() ? 'true' : 'false',
  };

  const copyIfSet = [
    'ARCANA_MARKETING_BRIDGE_TOKEN',
    'ARCANA_MARKETING_GOOGLE_ADS_CUSTOMER_ID',
    'ARCANA_MARKETING_GOOGLE_ADS_DEVELOPER_TOKEN',
    'ARCANA_MARKETING_GOOGLE_ADS_ACCESS_TOKEN',
    'ARCANA_MARKETING_GOOGLE_ADS_LOGIN_CUSTOMER_ID',
    'ARCANA_MARKETING_META_AD_ACCOUNT_ID',
    'ARCANA_MARKETING_META_ACCESS_TOKEN',
    'ARCANA_MARKETING_LINKEDIN_AD_ACCOUNT_ID',
    'ARCANA_MARKETING_LINKEDIN_ACCESS_TOKEN',
  ];
  for (const key of copyIfSet) {
    const value = (process.env[key] || '').trim();
    if (value) keys[key] = value;
  }

  if (hasPlatformGoogle()) keys.ARCANA_MARKETING_GOOGLE_ADS_LIVE_FETCH = 'true';
  if (hasPlatformMeta()) keys.ARCANA_MARKETING_META_LIVE_FETCH = 'true';
  if (hasPlatformLinkedIn()) keys.ARCANA_MARKETING_LINKEDIN_LIVE_FETCH = 'true';

  return keys;
}

async function main() {
  const cliPath = path.join(process.env.HOME, '.render/cli.yaml');
  const cliYaml = fs.readFileSync(cliPath, 'utf8');
  const apiKey = (cliYaml.match(/key: (rnd_\S+)/) || [])[1];
  if (!apiKey) fail('Saknar Render API key i ~/.render/cli.yaml');

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

  let bridgeToken = (process.env.ARCANA_MARKETING_BRIDGE_TOKEN || '').trim();
  if (mode === 'bridge' && !bridgeToken) {
    const existingBridge = map.get('ARCANA_MARKETING_BRIDGE_TOKEN');
    if (existingBridge) {
      bridgeToken = existingBridge;
      console.log('ℹ Återanvänder befintlig ARCANA_MARKETING_BRIDGE_TOKEN från Render');
    } else {
      bridgeToken = crypto.randomBytes(24).toString('hex');
      console.log(
        'ℹ Genererade ARCANA_MARKETING_BRIDGE_TOKEN — spara i .env för reproducerbar deploy'
      );
      console.log(`ARCANA_MARKETING_BRIDGE_TOKEN=${bridgeToken}`);
    }
  }

  if (mode === 'platform') {
    if (!hasPlatformGoogle() && !hasPlatformMeta() && !hasPlatformLinkedIn()) {
      fail('platform-läge kräver minst en kanal med tokens i .env (Google/Meta/LinkedIn)');
    }
  }

  const connectorKeys = mode === 'platform' ? platformKeys() : bridgeKeys(bridgeToken);

  for (const [key, value] of Object.entries(connectorKeys)) {
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
    fail(`Render env PUT failed: ${putRes.status} ${text.slice(0, 200)}`);
  }

  console.log(
    `✅ Render CMO connectors env (${mode}) — ${Object.keys(connectorKeys).length} nycklar`
  );

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
  console.log('✅ Deploy startad — kör npm run verify:cmo-connectors-prod efter readyz');
}

main().catch((err) => fail(err.message || String(err)));
