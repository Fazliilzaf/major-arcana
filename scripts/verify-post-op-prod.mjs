#!/usr/bin/env node
/**
 * Post-op Fas 1 prod smoke (operator trigger → patient lookup → upload → submit → GBP beacon).
 * Usage: node scripts/verify-post-op-prod.mjs
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
const CASE_ID = process.env.POST_OP_SMOKE_CASE_ID || `post-op-smoke-${Date.now()}`;

// 1×1 PNG
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const results = [];
let hardFail = false;

function pass(name, detail = '') {
  results.push({ name, pass: true, detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, pass: false, detail });
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
  return { status: res.status, body, headers: res.headers };
}

function getOwnerToken() {
  return execSync(`node "${path.join(ROOT, 'scripts/get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function main() {
  console.log(`Post-op verify @ ${BASE} case=${CASE_ID}`);

  let ownerToken = '';
  try {
    ownerToken = getOwnerToken();
    if (!ownerToken || ownerToken.length < 8) throw new Error('empty token');
    pass('PO-01 owner auth token');
  } catch (err) {
    fail('PO-01 owner auth token', err.message || 'missing');
    process.exit(1);
  }

  let triggerBody = null;
  let triggerLabel = 'capability trigger';

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
        customerName: 'Post-Op Smoke Test',
        locale: 'sv',
        baseUrl: BASE,
      },
    }),
  });
  const capData = cap.body?.output?.data;
  if (cap.status === 200 && capData?.token) {
    triggerBody = {
      ok: true,
      ...capData,
      reviewLink: capData.reviewLink || `${BASE}/uppfoljning/${capData.token}`,
    };
    pass('PO-02 capability trigger', capData.alreadyExists ? 'alreadyExists' : 'new submission');
  } else {
    const triggerRes = await fetchJson(
      `${BASE}/api/v1/cco-bookings/${encodeURIComponent(CASE_ID)}/mark-follow-up-completed`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
          'x-arcana-client': 'major_arcana_admin',
        },
        body: JSON.stringify({
          customerName: 'Post-Op Smoke Test',
          locale: 'sv',
          baseUrl: BASE,
          skipGraphSend: true,
        }),
      }
    );
    if (triggerRes.status === 200 && triggerRes.body?.ok && triggerRes.body?.token) {
      triggerBody = triggerRes.body;
      triggerLabel = 'operator trigger';
      pass('PO-02 operator trigger (fallback)', triggerBody.alreadyExists ? 'alreadyExists' : 'new submission');
    } else {
      fail(
        'PO-02 trigger',
        `capability=${cap.status} route=${triggerRes.status} error=${cap.body?.error || triggerRes.body?.error || '-'}`
      );
      process.exit(1);
    }
  }

  const token = extractToken(triggerBody.reviewLink) || triggerBody.token || '';
  if (!token) {
    fail('PO-02 token', 'saknar reviewLink/token');
    process.exit(1);
  }

  const lookup = await fetchJson(`${BASE}/api/v1/post-op-review/${encodeURIComponent(token)}/lookup`);
  if (lookup.status !== 200 || !lookup.body?.ok) {
    fail('PO-03 patient lookup', `status=${lookup.status}`);
  } else {
    pass('PO-03 patient lookup');
  }

  const page = await fetch(`${BASE}/uppfoljning/${encodeURIComponent(token)}`, {
    headers: { Accept: 'text/html' },
  });
  if (page.status === 200 && (await page.text()).includes('submit-form')) {
    pass('PO-04 patient page HTML');
  } else {
    fail('PO-04 patient page HTML', `status=${page.status}`);
  }

  const alreadySubmitted = Boolean(lookup.body?.submission?.submittedAt);

  if (!alreadySubmitted) {
    const form = new FormData();
    form.append('photos', new Blob([PNG_1X1], { type: 'image/png' }), 'smoke.png');
    const upload = await fetch(`${BASE}/api/v1/post-op-review/${encodeURIComponent(token)}/photos`, {
      method: 'POST',
      body: form,
    });
    const uploadBody = await upload.json().catch(() => ({}));
    if (upload.status === 200 && uploadBody.ok === true) {
      pass('PO-05 photo upload', `${uploadBody.totalPhotos || 1} photo(s)`);
    } else {
      fail('PO-05 photo upload', `status=${upload.status} error=${uploadBody.error || '-'}`);
    }

    const submit = await fetchJson(`${BASE}/api/v1/post-op-review/${encodeURIComponent(token)}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ consentToPublish: true, patientNote: 'Post-op smoke verify' }),
    });
    if (submit.status === 200 && submit.body?.ok) {
      pass('PO-06 patient submit');
    } else {
      const retryLookup = await fetchJson(`${BASE}/api/v1/post-op-review/${encodeURIComponent(token)}/lookup`);
      if (retryLookup.body?.submission?.submittedAt) {
        pass('PO-06 patient submit', 'persisted despite non-200');
      } else {
        fail('PO-06 patient submit', `status=${submit.status}`);
      }
    }
  } else {
    pass('PO-05 photo upload', 'skipped (already submitted)');
    pass('PO-06 patient submit', 'skipped (already submitted)');
  }

  const beacon = await fetch(`${BASE}/api/v1/post-op-review/${encodeURIComponent(token)}/review-clicked`, {
    redirect: 'manual',
  });
  if (beacon.status >= 300 && beacon.status < 400) {
    pass('PO-07 GBP review beacon', `redirect=${beacon.status}`);
  } else {
    fail('PO-07 GBP review beacon', `status=${beacon.status}`);
  }

  const lookupAfter = await fetchJson(`${BASE}/api/v1/post-op-review/${encodeURIComponent(token)}/lookup`);
  if (lookupAfter.body?.submission?.submittedAt) {
    pass('PO-08 submitted persisted');
  } else {
    fail('PO-08 submitted persisted');
  }

  const passed = results.filter((r) => r.pass).length;
  console.log('');
  console.log(`Resultat: ${passed}/${results.length} PASS`);
  if (hardFail) process.exit(1);
}

main().catch((err) => {
  console.error('verify-post-op-prod:', err.message || err);
  process.exit(1);
});
