#!/usr/bin/env node
'use strict';

/**
 * Prod-stickprov: kkx kundresa + Smart nästa steg mot riktig patient (default: Bensahla).
 * Kör: npm run verify:kkx-journey-prod
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
const TENANT = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const QUERY = process.env.KKX_VERIFY_QUERY || 'Bensahla';

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

async function api(token, route) {
  const res = await fetch(`${BASE}${route}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function loadKkx() {
  const src = fs.readFileSync(
    path.join(__dirname, '../public/major-arcana-preview/app/cco-kundkort-kkx.js'),
    'utf8'
  );
  const sandbox = { window: {}, console };
  vm.runInNewContext(`${src}\n;this.exports = window.CcoKundkortKkx;`, sandbox);
  return sandbox.exports;
}

async function main() {
  let hardFail = false;
  const fail = (name, detail) => {
    record(name, false, detail);
    hardFail = true;
  };

  console.log(`KKX journey verify @ ${BASE} (query: ${QUERY})\n`);

  const ready = await fetch(`${BASE}/readyz`)
    .then((r) => r.json())
    .catch(() => ({}));
  if (!record('Prod readyz', ready.ready === true)) hardFail = true;

  let token;
  try {
    token = getToken();
  } catch (err) {
    fail('Auth token', err.message || String(err));
    process.exit(1);
  }

  const shell = await api(
    token,
    `/api/v1/cco/staff/customers-shell?limit=50&offset=0&query=${encodeURIComponent(QUERY)}&includeAutomation=1`
  );
  if (shell.status !== 200) {
    fail('customers-shell search', `${shell.status}`);
    process.exit(1);
  }

  const rows = shell.body?.patients?.patients || [];
  const match =
    rows.find((r) => /bensahla/i.test(String(r.displayName || ''))) ||
    rows.find((r) => /abdelkader/i.test(String(r.displayName || ''))) ||
    rows[0];
  if (!match?.patientId) {
    fail('Find patient', `0 träffar för "${QUERY}"`);
    process.exit(1);
  }
  record('Find patient', true, `${match.displayName} (${match.patientId})`);

  const detail = await api(
    token,
    `/api/v1/cco-patient-master/patient/summary?patientId=${encodeURIComponent(match.patientId)}&includeDriveFiles=0`
  );
  if (detail.status !== 200) {
    fail('patient summary', `${detail.status}`);
    process.exit(1);
  }

  const card = { ...match, ...detail.body?.card };
  const timeline = detail.body?.occasionTimeline || [];
  const bookingEvents = timeline.filter((ev) =>
    String(ev?.kind || ev?.type || '')
      .toLowerCase()
      .includes('booking')
  );

  record('Shell nextStep', true, String(card.nextStep || '—'));
  record('Shell missingJournal field', true, String(card.missingJournal));
  record('Timeline bookings', true, String(bookingEvents.length));

  const kkx = loadKkx();
  const extras = { occasionTimeline: timeline };
  const readout = kkx.normalizeKkxReadout(card, [], null, extras);
  const journey = kkx.buildCanonicalJourneyLive(card, [], null, extras);
  const signals = kkx.resolvePanelSignals(card, [], null, extras);

  if (
    !record(
      'normalize missingJournal',
      readout.missingJournal === true,
      `got ${readout.missingJournal}`
    )
  ) {
    hardFail = true;
  }
  if (!record('Smart signals >= 1', signals.length >= 1, `count=${signals.length}`)) {
    hardFail = true;
  }

  const step1 = journey.steps.find((s) => s.step === 1);
  const step4 = journey.steps.find((s) => s.step === 4);
  if (!record('Steg 1 done', step1?.status === 'done', `status=${step1?.status}`)) hardFail = true;
  if (!record('Aktivt steg 4', journey.activeStep === 4, `activeStep=${journey.activeStep}`)) {
    hardFail = true;
  }
  if (!record('Steg 4 active/open', step4?.status === 'active', `status=${step4?.status}`)) {
    hardFail = true;
  }

  const futureOk = journey.steps
    .filter((s) => s.step >= 5)
    .every((s) => s.status === 'future' || s.status === 'todo');
  if (!record('Steg 5–9 future', futureOk)) hardFail = true;

  console.log('\nJourney:', journey.steps.map((s) => `${s.step}:${s.status}`).join(' '));

  process.exit(hardFail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
