#!/usr/bin/env node
'use strict';

/**
 * Import Review prod verify — readyz, UI, summary + canary API.
 *
 * Usage:
 *   npm run verify:import-review-prod
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const REPO = path.join(__dirname, '..');

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function getToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function api(token, route, opts = {}) {
  const res = await fetch(`${BASE}${route}`, {
    ...opts,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
      'x-cco-role': 'owner',
      'x-cco-tenant': 'hairtpclinic',
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

async function main() {
  let hardFail = false;
  const fail = (name, detail) => {
    record(name, false, detail);
    hardFail = true;
  };

  console.log(`Import Review verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`)
    .then((r) => r.json())
    .catch(() => ({}));
  if (!record('IR-01 readyz', ready.ready === true)) hardFail = true;

  const page = await fetch(`${BASE}/cco-import-review.html`);
  if (!record('IR-02 /cco-import-review.html', page.status === 200, `HTTP ${page.status}`)) {
    hardFail = true;
  }

  let token;
  try {
    token = getToken();
  } catch (err) {
    fail('IR-03 auth token', err.message);
    process.exit(hardFail ? 1 : 0);
  }

  const summary = await api(token, '/api/v1/ops/cco/import-review/summary');
  if (!record('IR-04 summary API', summary.status === 200, `HTTP ${summary.status}`)) {
    hardFail = true;
  } else {
    const total = Number(summary.body.total ?? 0);
    const write = summary.body.writeEnabled === true;
    record('IR-05 queue total', total > 0, `${total} poster`);
    const halso = summary.body.sources?.find((s) => s.id === 'halso');
    const ga = summary.body.sources?.find((s) => s.id === 'getaccept');
    if (halso) record('IR-06 halso@ pending', halso.queueCount > 0, `${halso.queueCount}`);
    if (ga) record('IR-07 GetAccept pending', ga.queueCount > 0, `${ga.queueCount}`);
    record('IR-08 write mode', write, write ? 'CANARY PÅ' : 'READ-ONLY (aktivera Render env)');
  }

  const queue = await api(token, '/api/v1/ops/cco/import-review/queue?limit=1&status=pending');
  if (!record('IR-09 queue API', queue.status === 200, `HTTP ${queue.status}`)) {
    hardFail = true;
  } else {
    record('IR-10 queue page', (queue.body.total ?? 0) > 0, `total=${queue.body.total ?? 0}`);
  }

  const canary = await api(token, '/api/v1/ops/cco/import-review/canary-status');
  if (!record('IR-11 canary-status API', canary.status === 200, `HTTP ${canary.status}`)) {
    hardFail = true;
  } else if (canary.body.writeEnabled) {
    const max = canary.body.canary?.maxDecisions ?? 0;
    record(
      'IR-12 canary max',
      max === 25,
      `remaining=${canary.body.canary?.decisionsRemaining ?? '—'}`
    );
  }

  try {
    const out = execSync('node scripts/import-review-batch-status.js', {
      cwd: REPO,
      encoding: 'utf8',
    });
    const snap = JSON.parse(out.trim().split('\n').pop());
    record('IR-13 local batch status', snap.total > 0, `${snap.total} reference`);
  } catch (err) {
    fail('IR-13 local batch status', err.message);
  }

  console.log('\n--- Summary ---');
  if (summary.status === 200) {
    console.log(`Total: ${summary.body.total ?? 0}`);
    console.log(`Write: ${summary.body.writeEnabled ? 'CANARY' : 'READ-ONLY'}`);
    console.log(`Data: ${summary.body.dataSource || '—'}`);
  }
  console.log(`Operator: ${BASE}/cco-import-review.html`);

  process.exit(hardFail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
