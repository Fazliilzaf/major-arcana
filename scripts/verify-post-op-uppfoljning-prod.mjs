#!/usr/bin/env node
/**
 * U4.6 — Post-op patient /uppfoljning/[token] prod smoke (fetch-based).
 * Triggar token via capability, verifierar HTML + lookup API.
 *
 * Usage:
 *   npm run verify:post-op-uppfoljning-prod
 *   BASE=http://127.0.0.1:3100 npm run verify:post-op-uppfoljning-prod
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const CASE_ID = process.env.POST_OP_UPPFOLJNING_CASE_ID || `post-op-uppfoljning-${Date.now()}`;
const IS_PROD = BASE.includes('arcana.hairtpclinic.se');

let hardFail = false;

function pass(name, detail = '') {
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  hardFail = true;
}

function extractToken(reviewLink = '') {
  const match = String(reviewLink).match(/\/uppfoljning\/([^/?#]+)/);
  return match ? match[1] : '';
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

function getOwnerToken() {
  return execSync(`node "${path.join(ROOT, 'scripts/get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function triggerToken(ownerToken) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-arcana-client': 'major_arcana_admin',
  };
  if (ownerToken) headers.Authorization = `Bearer ${ownerToken}`;

  const trigger = await fetchJson(
    `${BASE}/api/v1/cco-bookings/${encodeURIComponent(CASE_ID)}/mark-follow-up-completed`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        customerName: 'Uppföljning Verify Patient',
        locale: 'sv',
        baseUrl: BASE,
        skipGraphSend: true,
      }),
    }
  );

  if (trigger.status === 200 && trigger.body?.ok && trigger.body?.reviewLink) {
    return trigger.body;
  }

  if (!ownerToken) return null;

  const cap = await fetchJson(`${BASE}/api/v1/capabilities/RequestPostOpReview/run`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({
      input: {
        bookingCaseId: CASE_ID,
        customerName: 'Uppföljning Verify Patient',
        locale: 'sv',
        baseUrl: BASE,
      },
    }),
  });
  const capData = cap.body?.output?.data;
  if (cap.status === 200 && capData?.token) {
    return {
      ok: true,
      token: capData.token,
      reviewLink: capData.reviewLink || `${BASE}/uppfoljning/${capData.token}`,
    };
  }
  return null;
}

async function main() {
  console.log(`Post-op uppföljning verify @ ${BASE}`);
  console.log(`case=${CASE_ID}`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (ready.ready === true) pass('POU-01 readyz');
  else fail('POU-01 readyz');

  let ownerToken = '';
  if (IS_PROD) {
    try {
      ownerToken = getOwnerToken();
      if (!ownerToken || ownerToken.length < 8) throw new Error('empty token');
      pass('POU-02 owner auth token');
    } catch (err) {
      fail('POU-02 owner auth token', err.message || 'missing');
    }
  }

  const triggerBody = await triggerToken(ownerToken);
  if (!triggerBody?.reviewLink) {
    fail('POU-03 trigger token', `status missing reviewLink (prod auth required on ${BASE})`);
    process.exit(1);
  }
  pass('POU-03 trigger token');

  const token = extractToken(triggerBody.reviewLink) || triggerBody.token;
  if (!token || token.length < 8) {
    fail('POU-04 extract token');
    process.exit(1);
  }
  pass('POU-04 extract token', token.slice(0, 12) + '…');

  const page = await fetch(`${BASE}/uppfoljning/${encodeURIComponent(token)}`, {
    headers: { Accept: 'text/html' },
  });
  const html = await page.text();
  if (page.status !== 200) {
    fail('POU-05 patient page status', `status=${page.status}`);
  } else {
    pass('POU-05 patient page status', '200');
  }

  const required = ['submit-form', 'photo-input', 'consent-publish', 'submit-btn'];
  for (const id of required) {
    if (html.includes(`id="${id}"`) || html.includes(`id='${id}'`)) {
      pass(`POU-06 DOM #${id}`);
    } else {
      fail(`POU-06 DOM #${id}`, 'saknas i HTML');
    }
  }

  const lookup = await fetchJson(`${BASE}/api/v1/post-op-review/${encodeURIComponent(token)}/lookup`);
  if (lookup.status === 200 && lookup.body?.ok !== false) {
    pass('POU-07 lookup API', lookup.body?.submission ? 'submission exists' : 'awaiting submit');
  } else {
    fail('POU-07 lookup API', `status=${lookup.status}`);
  }

  console.log('');
  if (hardFail) {
    console.log('❌ Post-op uppföljning verify misslyckades');
    process.exit(1);
  }
  console.log('✅ Post-op uppföljning patient-UI smoke PASS');
  console.log('   Full submit-flow: npm run test:playwright:post-op (lokal Playwright)');
}

main().catch((err) => {
  console.error('verify-post-op-uppfoljning-prod:', err.message || err);
  process.exit(1);
});
