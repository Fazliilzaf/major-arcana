#!/usr/bin/env node
'use strict';

/**
 * Graph read + Resend go-live på Render prod (merge PUT).
 * Kräver .env med ARCANA_GRAPH_CLIENT_SECRET (+ RESEND_API_KEY om inte SKIP_RESEND).
 */
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d6b11o0boq4c73chm7f0';
const skipResend = String(process.env.SKIP_RESEND || 'false').toLowerCase() === 'true';

const DEFAULT_TENANT = '90b09262-dfbf-42b7-9c56-1149703a76e5';
const DEFAULT_CLIENT_ID = '13adfc91-69ab-4c35-ac80-b52ebba7e09f';
const DEFAULT_USER_ID = 'fazli@hairtpclinic.com';
const DEFAULT_ALLOWLIST =
  'egzona@hairtpclinic.com,contact@hairtpclinic.com,fazli@hairtpclinic.com,info@hairtpclinic.com,kons@hairtpclinic.com,marknad@hairtpclinic.com,receipt@hairtpclinic.com';

const graphKeys = {
  ARCANA_GRAPH_READ_ENABLED: 'true',
  ARCANA_GRAPH_SEND_ENABLED: 'true',
  ARCANA_GRAPH_TENANT_ID: process.env.ARCANA_GRAPH_TENANT_ID || DEFAULT_TENANT,
  ARCANA_GRAPH_CLIENT_ID: process.env.ARCANA_GRAPH_CLIENT_ID || DEFAULT_CLIENT_ID,
  ARCANA_GRAPH_CLIENT_SECRET: process.env.ARCANA_GRAPH_CLIENT_SECRET || '',
  ARCANA_GRAPH_USER_ID: process.env.ARCANA_GRAPH_USER_ID || DEFAULT_USER_ID,
  ARCANA_GRAPH_FULL_TENANT: process.env.ARCANA_GRAPH_FULL_TENANT || 'true',
  ARCANA_GRAPH_USER_SCOPE: process.env.ARCANA_GRAPH_USER_SCOPE || 'all',
  ARCANA_MAILBOX_ALLOWLIST: process.env.ARCANA_MAILBOX_ALLOWLIST || DEFAULT_ALLOWLIST,
  ARCANA_GRAPH_SEND_ALLOWLIST: process.env.ARCANA_GRAPH_SEND_ALLOWLIST || DEFAULT_ALLOWLIST,
  ARCANA_BOOTSTRAP_PHASE1_ONLY: process.env.ARCANA_BOOTSTRAP_PHASE1_ONLY || 'true',
  OPERATOR_NOTIFY_TO: (process.env.OPERATOR_NOTIFY_TO || 'contact@hairtpclinic.com').trim(),
};

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const missing = [];
if (!graphKeys.ARCANA_GRAPH_CLIENT_SECRET.trim()) missing.push('ARCANA_GRAPH_CLIENT_SECRET');
if (missing.length) {
  fail(`Saknar secrets i .env: ${missing.join(', ')}. Se docs/ops/graph-resend-go-live.md`);
}

const resendKeys = {};
if (!skipResend) {
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!resendApiKey) {
    fail('Saknar RESEND_API_KEY i .env (eller kör SKIP_RESEND=true för endast Graph)');
  }
  resendKeys.RESEND_API_KEY = resendApiKey;
  resendKeys.RESEND_FROM = (process.env.RESEND_FROM || 'contact@hairtpclinic.com').trim();
  resendKeys.OPERATOR_NOTIFY_TO = (process.env.OPERATOR_NOTIFY_TO || 'contact@hairtpclinic.com').trim();
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

  for (const [key, value] of Object.entries({ ...graphKeys, ...resendKeys })) {
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

  const resendLabel = Object.keys(resendKeys).length ? ' + Resend' : '';
  console.log(`✅ Render env uppdaterad (${map.size} nycklar) — Graph read ON${resendLabel}`);

  const deployRes = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const deployText = await deployRes.text();
  let deploy = {};
  try {
    deploy = deployText ? JSON.parse(deployText) : {};
  } catch {
    deploy = {};
  }
  if (!deployRes.ok && deployRes.status !== 202) {
    fail(`Render deploy failed: ${deployRes.status} ${deployText.slice(0, 200)}`);
  }
  console.log(`✅ Deploy startad: ${deploy.id || deploy.deploy?.id || deployRes.status || 'ok'}`);
}

main().catch((err) => fail(err.message || String(err)));
