#!/usr/bin/env node
'use strict';

/**
 * Graph send-only go-live på Render prod (merge PUT).
 * Sätter ARCANA_GRAPH_SEND_ENABLED=true men lämnar READ=false (OOM-säker).
 * Lägger till cco_daily_digest i scheduler-allowlist om den saknas.
 *
 * Kräver .env med ARCANA_GRAPH_CLIENT_SECRET.
 */
require('dotenv').config({ quiet: true });

const { resolveRenderApiKey, fetchAllRenderEnvMap } = require('./lib/renderEnvApi.js');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';

const DEFAULT_TENANT = '90b09262-dfbf-42b7-9c56-1149703a76e5';
const DEFAULT_CLIENT_ID = '13adfc91-69ab-4c35-ac80-b52ebba7e09f';
const DEFAULT_USER_ID = 'fazli@hairtpclinic.com';
const DEFAULT_ALLOWLIST =
  'kons@hairtpclinic.com,contact@hairtpclinic.com,halso@hairtpclinic.com,egzona@hairtpclinic.com,fazli@hairtpclinic.com,marknad@hairtpclinic.com,kvitto@hairtpclinic.com';
const DEFAULT_SCHEDULER_JOBS =
  'alert_probe,backup_prune,cco_dashboard_snapshot_refresh,cco_daily_digest';

const graphSendKeys = {
  ARCANA_GRAPH_READ_ENABLED: 'false',
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
  ARCANA_SCHEDULER_JOBS: process.env.ARCANA_SCHEDULER_JOBS || DEFAULT_SCHEDULER_JOBS,
  OPERATOR_NOTIFY_TO: (process.env.OPERATOR_NOTIFY_TO || 'contact@hairtpclinic.com').trim(),
};

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function mergeSchedulerJobs(existingValue, desiredCsv) {
  const desired = desiredCsv
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const existing = String(existingValue || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const merged = [];
  const seen = new Set();
  for (const jobId of [...existing, ...desired]) {
    if (!jobId || seen.has(jobId)) continue;
    seen.add(jobId);
    merged.push(jobId);
  }
  return merged.join(',');
}

if (!graphSendKeys.ARCANA_GRAPH_CLIENT_SECRET.trim()) {
  fail('Saknar ARCANA_GRAPH_CLIENT_SECRET i .env. Se docs/ops/graph-resend-go-live.md');
}

async function main() {
  const apiKey = resolveRenderApiKey();
  if (!apiKey) fail('Saknar Render API key (~/.render/cli.yaml eller RENDER_API_KEY)');

  const map = await fetchAllRenderEnvMap(serviceId, apiKey);

  for (const [key, value] of Object.entries(graphSendKeys)) {
    if (key === 'ARCANA_SCHEDULER_JOBS') {
      map.set(key, mergeSchedulerJobs(map.get(key), value));
      continue;
    }
    if (key === 'ARCANA_MAILBOX_ALLOWLIST' || key === 'ARCANA_GRAPH_SEND_ALLOWLIST') {
      if (String(map.get(key) || '').trim()) {
        continue;
      }
    }
    map.set(key, value);
  }

  map.set('ARCANA_GRAPH_READ_ENABLED', 'false');
  map.set('ARCANA_GRAPH_SEND_ENABLED', 'true');

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

  console.log(`✅ Render env uppdaterad (${map.size} nycklar) — Graph send ON, read OFF`);
  console.log(`   ARCANA_SCHEDULER_JOBS=${map.get('ARCANA_SCHEDULER_JOBS')}`);

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
