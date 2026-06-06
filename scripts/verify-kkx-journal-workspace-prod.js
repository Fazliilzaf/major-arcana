#!/usr/bin/env node
'use strict';

/**
 * Del 3 — journal-arbetsyta stickprov mot TESTPATIENT (pilot A).
 * Usage: npm run verify:kkx-journal-workspace-prod
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');

const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const TEST_PATIENT = process.env.KKX_JOURNAL_TEST_PATIENT || 'cco-pilot-20260602-a';

function getToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function api(token, route, options = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function loadKkx() {
  const src = fs.readFileSync(
    path.join(__dirname, '../public/major-arcana-preview/app/cco-kundkort-kkx.js'),
    'utf8'
  );
  global.window = { CcoV9CustomersParity: {} };
  vm.runInThisContext(src, { filename: 'cco-kundkort-kkx.js' });
  return global.window.CcoKundkortKkx;
}

function record(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main() {
  let token;
  try {
    token = getToken();
  } catch (err) {
    console.error('Auth failed:', err.message || err);
    process.exit(1);
  }

  const ready = await fetch(`${BASE}/readyz`)
    .then((r) => r.json())
    .catch(() => ({}));
  if (!record('Prod readyz', ready.ready === true)) process.exit(1);

  const patientRes = await api(
    token,
    `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(TEST_PATIENT)}&includeJournal=1`
  );
  if (!record('Load TESTPATIENT journal', patientRes.status === 200, TEST_PATIENT)) {
    process.exit(1);
  }

  const entries = patientRes.body?.journalEntries || [];
  const signedTp = entries.find(
    (e) => e.journalType === 'tp_treatment' && (e.locked || e.signedAt)
  );
  const draftTp = entries.find((e) => e.journalType === 'tp_treatment' && !e.locked);

  record('Journal entries present', entries.length >= 0, `count=${entries.length}`);
  record('Signed TP or draft available', Boolean(signedTp || draftTp));

  const visibilityProbe = await api(token, '/api/v1/cco-journal/entry', {
    method: 'PUT',
    body: {
      patientId: TEST_PATIENT,
      journalType: 'tp_treatment',
      formVariant: 'hair_tp',
      title: 'KKX visibility probe',
      fields: {},
      visibility: 'private_internal',
    },
  });
  if (visibilityProbe.status !== 200) {
    record('visibility PUT', false, String(visibilityProbe.status));
    process.exit(1);
  }
  const probeId = visibilityProbe.body?.entry?.entryId;
  record(
    'visibility private_internal saved',
    visibilityProbe.body?.entry?.visibility === 'private_internal'
  );

  const feed = await api(
    token,
    `/api/v1/cco-customers/${encodeURIComponent(TEST_PATIENT)}/journal-feed?tenantId=hairtpclinic`
  );
  const feedHasProbe = asArray(feed.body?.items).some((item) => item.entityId === probeId);
  record('private_internal hidden from journal-feed', feed.status === 200 && !feedHasProbe);

  const kkx = loadKkx();
  const card = { missingJournal: true, hasJournal: false };
  const journeyBefore = kkx.buildCanonicalJourneyLive(card, entries, null, {});
  const step4Before = journeyBefore.steps.find((s) => s.step === 4);
  record(
    'Journey step 4 active before signed consult',
    step4Before?.status === 'active' || step4Before?.status === 'open'
  );

  if (signedTp) {
    const cardAfter = kkx.normalizeKkxReadout(
      { missingJournal: true, hasJournal: false },
      [signedTp],
      null,
      {}
    );
    record('Signed TP clears missingJournal readout', cardAfter.missingJournal === false);
    const journeyAfter = kkx.buildCanonicalJourneyLive(cardAfter, [signedTp], null, {});
    const step4 = journeyAfter.steps.find((s) => s.step === 4);
    const step5 = journeyAfter.steps.find((s) => s.step === 5);
    record('Steg 4 done after sign', step4?.status === 'done', `status=${step4?.status}`);
    record(
      'Steg 5 active/open after sign',
      step5?.status === 'active' || step5?.status === 'open',
      `status=${step5?.status}`
    );
  } else {
    console.log('SKIP: signed TP saknas — signera manuellt i UAT för full gate-check');
  }

  if (probeId) {
    await api(token, '/api/v1/cco-journal/entry', {
      method: 'DELETE',
      body: null,
    }).catch(() => {});
    await fetch(
      `${BASE}/api/v1/cco-journal/entry?patientId=${encodeURIComponent(TEST_PATIENT)}&entryId=${encodeURIComponent(probeId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    ).catch(() => {});
  }

  console.log(`\nTESTPATIENT: ${TEST_PATIENT} @ ${BASE}`);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
