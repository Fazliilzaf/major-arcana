#!/usr/bin/env node
/**
 * Prod Graph read status — /api/v1/cco/runtime/status med STAFF-token.
 */
require('dotenv').config({ quiet: true });
const { execSync } = require('node:child_process');
const path = require('node:path');

const base = (process.env.ARCANA_PROD_URL || process.env.BASE_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const root = path.join(__dirname, '..');

function getStaffToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) {
    return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  }
  return execSync(`node "${path.join(root, 'scripts/get-prod-auth-token.js')}"`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function fetchJson(pathname, token) {
  const res = await fetch(`${base}${pathname}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function main() {
  let hardFail = false;
  const record = (name, pass, detail = '') => {
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!pass) hardFail = true;
  };
  const warn = (name, detail = '') => {
    console.log(`WARN: ${name}${detail ? ` — ${detail}` : ''}`);
  };

  const ready = await fetch(`${base}/readyz`).then((r) => r.json()).catch(() => ({}));
  record('Prod readyz', ready.ready === true, ready.reason || '');

  const token = getStaffToken();
  record('STAFF-token', Boolean(token));

  const status = await fetchJson('/api/v1/cco/runtime/status', token);
  const graph = status.graph || {};
  const readEnabled = graph.readEnabled === true;
  const connectorAvailable = graph.readConnectorAvailable === true;
  const runtimeMode = String(graph.runtimeMode || 'unknown');

  if (readEnabled) {
    record('Graph readEnabled', true, runtimeMode);
    record('Graph readConnectorAvailable', connectorAvailable);
    if (!connectorAvailable) {
      warn('Graph read på men connector saknas — kontrollera ARCANA_GRAPH_* secrets');
    } else {
      record('Graph live-läge', runtimeMode === 'live', runtimeMode);
    }
  } else {
    warn('Graph read av på Render', `${runtimeMode} — sätt ARCANA_GRAPH_READ_ENABLED=true + secrets`);
  }

  const worklist = await fetchJson(
    '/api/v1/cco/runtime/worklist/consumer?laneId=all&limit=5',
    token
  ).catch((err) => {
    warn('worklist/consumer', err.message || String(err));
    return null;
  });

  if (worklist && typeof worklist === 'object') {
    const rows = Array.isArray(worklist.rows)
      ? worklist.rows
      : Array.isArray(worklist.threads)
        ? worklist.threads
        : Array.isArray(worklist.items)
          ? worklist.items
          : [];
    const liveCount = rows.filter((row) => {
      const source = String(row?.source || row?.worklistSource || '').toLowerCase();
      return source !== 'demo';
    }).length;
    if (readEnabled && connectorAvailable && liveCount === 0) {
      warn('Live worklist tom trots Graph på', `${rows.length} rader (bootstrap/backfill kan pågå)`);
    } else {
      record('Worklist consumer svarar', true, `${liveCount} live / ${rows.length} totalt`);
    }
  }

  if (hardFail) process.exit(1);
  console.log('✅ Graph read prod verify klar');
}

main().catch((err) => {
  console.error('❌ Graph read prod verify:', err.message || err);
  process.exit(1);
});
