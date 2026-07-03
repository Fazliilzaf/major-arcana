#!/usr/bin/env node
'use strict';

/**
 * Drive Import Review prod verify — readyz, UI, summary + canary API.
 *
 * Usage:
 *   npm run verify:drive-import-review-prod
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function getToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ARCANA_PROD_URL: BASE },
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

  console.log(`Drive Import Review verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`)
    .then((r) => r.json())
    .catch(() => ({}));
  if (!record('DIR-01 readyz', ready.ready === true)) hardFail = true;

  const page = await fetch(`${BASE}/drive-import-review.html`, { redirect: 'follow' });
  if (!record('DIR-02 /drive-import-review.html', page.status === 200, `HTTP ${page.status}`)) {
    hardFail = true;
  }
  const html = await page.text();
  record('DIR-03 UI bundle', html.includes('drive-import-review.js'), 'script tag');

  let token;
  try {
    token = getToken();
  } catch (err) {
    fail('DIR-04 auth token', err.message);
    const decideProbe = await fetch(
      `${BASE}/api/v1/ops/cco/drive-import-review/assets/__probe__/decide`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'reject', reason: 'probe', reviewer: 'probe' }),
      }
    );
    record(
      'DIR-04b decide route probe (no auth)',
      decideProbe.status === 401,
      `HTTP ${decideProbe.status} (401=write route mounted, 404=write AV)`
    );
    console.log('\n--- Summary ---');
    console.log('Auth saknas — kör med giltig ARCANA_SMOKE_BEARER_TOKEN eller owner .env');
    process.exit(hardFail ? 1 : 0);
  }

  const summary = await api(token, '/api/v1/ops/cco/drive-import-review/summary');
  if (!record('DIR-05 summary API', summary.status === 200, `HTTP ${summary.status}`)) {
    hardFail = true;
  } else {
    const total = Number(summary.body.totalNeedsReview ?? 0);
    const write = summary.body.writeEnabled === true;
    record('DIR-06 NEEDS_REVIEW total', total > 0, `${total.toLocaleString('sv-SE')} filer`);
    record('DIR-07 phase', summary.body.phase === 'R2_canary' || !write, summary.body.phase || '—');
    record('DIR-08 write mode', write, write ? 'CANARY PÅ' : 'READ-ONLY (aktivera Render env)');
    if (write) {
      const max = summary.body.canary?.maxDecisions ?? 0;
      record(
        'DIR-09 canary max',
        max === 50,
        `remaining=${summary.body.canary?.decisionsRemaining ?? '—'}`
      );
    }
  }

  const queue = await api(token, '/api/v1/ops/cco/drive-import-review/queue?limit=1');
  if (!record('DIR-10 queue API', queue.status === 200, `HTTP ${queue.status}`)) {
    hardFail = true;
  } else {
    record('DIR-11 queue total', (queue.body.total ?? 0) > 0, `total=${queue.body.total ?? 0}`);
  }

  const canary = await api(token, '/api/v1/ops/cco/drive-import-review/canary-status');
  if (!record('DIR-12 canary-status API', canary.status === 200, `HTTP ${canary.status}`)) {
    hardFail = true;
  } else if (canary.body.writeEnabled) {
    record(
      'DIR-13 canary remaining',
      Number.isFinite(Number(canary.body.canary?.decisionsRemaining)),
      `used=${canary.body.canary?.decisionsUsed ?? 0}`
    );
  }

  if (summary.status === 200 && summary.body.writeEnabled) {
    const probe = await api(
      token,
      '/api/v1/ops/cco/drive-import-review/assets/__nonexistent__/decide',
      {
        method: 'POST',
        body: { decision: 'reject', reason: 'probe', reviewer: 'verify-script' },
      }
    );
    record(
      'DIR-14 decide route mounted',
      probe.status === 404 || probe.status === 409,
      `HTTP ${probe.status} (404=route OK, 405=write AV)`
    );
    if (probe.status === 405) hardFail = true;
  }

  console.log('\n--- Summary ---');
  if (summary.status === 200) {
    console.log(`NEEDS_REVIEW: ${summary.body.totalNeedsReview ?? 0}`);
    console.log(`Write: ${summary.body.writeEnabled ? 'CANARY' : 'READ-ONLY'}`);
    console.log(`Phase: ${summary.body.phase || '—'}`);
  }
  console.log(`Operator: ${BASE}/drive-import-review.html`);

  process.exit(hardFail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
