#!/usr/bin/env node
'use strict';

/**
 * CI: paginerad env-räkning + kritiska nycklar efter heal.
 */
const { resolveRenderApiKey, fetchAllRenderEnvMap } = require('./lib/renderEnvApi.js');

const serviceId = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';
const minCount = Number(process.env.RENDER_ENV_MIN_COUNT || '25');

const CRITICAL = [
  'ARCANA_GRAPH_CLIENT_SECRET',
  'ARCANA_GRAPH_TENANT_ID',
  'ARCANA_GRAPH_CLIENT_ID',
  'ARCANA_GRAPH_USER_ID',
];

function fail(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

async function main() {
  const apiKey = resolveRenderApiKey();
  if (!apiKey) fail('RENDER_API_KEY saknas — kan inte verifiera env count');

  const map = await fetchAllRenderEnvMap(serviceId, apiKey);
  const count = map.size;
  console.log(`Render env keys (paginerad): ${count}`);

  if (count < minCount) {
    fail(`För få env-nycklar på prod (${count} < ${minCount})`);
  }

  const missingCritical = CRITICAL.filter((key) => !String(map.get(key) || '').trim());
  if (missingCritical.length) {
    fail(`Saknar kritiska Graph-nycklar: ${missingCritical.join(', ')}`);
  }

  console.log('✅ Env count + kritiska Graph-nycklar OK');
}

main().catch((err) => fail(err.message || String(err)));
