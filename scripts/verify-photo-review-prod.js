#!/usr/bin/env node
'use strict';

/**
 * Photo Review prod verify — readyz, UI routes, summary + canary API.
 *
 * Usage:
 *   npm run verify:photo-review-prod
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

async function fetchHtml(route) {
  const res = await fetch(`${BASE}${route}`, { redirect: 'manual' });
  const loc = res.headers.get('location') || '';
  return { status: res.status, location: loc };
}

async function main() {
  let hardFail = false;
  const fail = (name, detail) => {
    record(name, false, detail);
    hardFail = true;
  };

  console.log(`Photo Review verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`)
    .then((r) => r.json())
    .catch(() => ({}));
  if (!record('PR-01 readyz', ready.ready === true)) hardFail = true;

  const page = await fetchHtml('/photo-review.html');
  if (!record('PR-02 /photo-review.html', page.status === 200, `HTTP ${page.status}`))
    hardFail = true;

  const alias = await fetchHtml('/cco-photo-review.html');
  const aliasOk = alias.status === 200 || alias.status === 302 || alias.status === 301;
  if (
    !record(
      'PR-03 /cco-photo-review.html',
      aliasOk,
      `HTTP ${alias.status}${alias.location ? ` → ${alias.location}` : ''}`
    )
  ) {
    hardFail = true;
  }

  let token;
  try {
    token = getToken();
  } catch (err) {
    fail('PR-04 auth token', err.message);
    process.exit(hardFail ? 1 : 0);
  }

  const summary = await api(token, '/api/v1/cco/photo-review/summary');
  if (!record('PR-05 summary API', summary.status === 200, `HTTP ${summary.status}`)) {
    hardFail = true;
  } else {
    const pending = Number(summary.body.pendingPhotosAll ?? summary.body.pendingPhotos ?? 0);
    const write = summary.body.writeEnabled === true;
    record('PR-06 pending queue', pending > 0, `${pending} foton`);
    record('PR-07 write mode', write, write ? 'CANARY PÅ' : 'READ-ONLY (aktivera Render env)');
    if (write) {
      const max = summary.body.pilot?.maxDecisions ?? 25;
      record('PR-08 canary max', max === 25, `max=${max}`);
    } else {
      console.log(
        'INFO: write AV — sätt ENABLE_CCO_OPERATOR_CANARY + ENABLE_PHOTO_REVIEW_WRITE + ENABLE_PHOTO_REVIEW_CANARY_ON_PROD'
      );
    }
  }

  const canary = await api(token, '/api/v1/cco/photo-review/canary-status');
  if (!record('PR-09 canary-status API', canary.status === 200, `HTTP ${canary.status}`)) {
    hardFail = true;
  } else if (canary.body.writeEnabled) {
    const max = canary.body.canary?.maxDecisions ?? 0;
    record(
      'PR-10 canary rules',
      max === 25,
      `remaining=${canary.body.canary?.decisionsRemaining ?? '—'}`
    );
  }

  let snapPending = 0;
  try {
    const out = execSync('node scripts/photo-review-batch-status.js', {
      cwd: REPO,
      encoding: 'utf8',
    });
    const snap = JSON.parse(out.trim().split('\n').pop());
    snapPending = Number(snap.pendingPhotos) || 0;
    record('PR-11 local snapshot', snapPending > 0, `${snapPending} pending (reference)`);
  } catch (err) {
    fail('PR-11 local snapshot', err.message);
  }

  console.log('\n--- Summary ---');
  if (summary.status === 200) {
    console.log(`API pending: ${summary.body.pendingPhotosAll ?? summary.body.pendingPhotos ?? 0}`);
    console.log(`Write: ${summary.body.writeEnabled ? 'CANARY' : 'READ-ONLY'}`);
    console.log(`Phase: ${summary.body.phase || '—'}`);
  }
  console.log(`Snapshot reference pending: ${snapPending}`);
  console.log(`Operator: ${BASE}/photo-review.html`);

  process.exit(hardFail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
