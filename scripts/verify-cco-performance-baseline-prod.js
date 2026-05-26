#!/usr/bin/env node
'use strict';

/**
 * Prod verify: CCO performance baseline (Fas 1 + consolidated endpoints).
 */
require('dotenv').config({ quiet: true });

const path = require('node:path');
const { execSync } = require('node:child_process');

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);

function pass(name, detail = '') {
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  return true;
}

function getToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  let hardFail = false;
  const markFail = (name, detail) => {
    if (fail(name, detail)) hardFail = true;
  };

  console.log(`CCO performance baseline @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (ready.ready !== true) markFail('PB-01 readyz');
  else pass('PB-01 readyz');

  const preview = await fetch(`${BASE}/major-arcana-preview/index.html`);
  const html = await preview.text();
  if (!html.includes('cco-fetch-instrumentation') && !html.includes('app.bundle')) {
    markFail('PB-02 preview assets', 'instrumentation/bundle not referenced');
  } else {
    pass('PB-02 preview assets');
  }

  let token = '';
  try {
    token = getToken();
  } catch (error) {
    markFail('PB-03 auth token', error.message);
  }

  if (token) {
    const auth = { Authorization: `Bearer ${token}` };
    const shell = await getJson(`${BASE}/api/v1/cco/staff/customers-shell?limit=5`, auth);
    if (shell.status !== 200 || !shell.body?.stats || !shell.body?.patients) {
      markFail('PB-04 customers-shell', String(shell.status));
    } else {
      pass('PB-04 customers-shell', `patients=${shell.body.patients.patients?.length ?? 0}`);
    }

    const today = new Date().toISOString().slice(0, 10);
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const bundle = await getJson(
      `${BASE}/api/v1/cco-bookings/calendar-bundle?fromDate=${today}&toDate=${nextMonth}`,
      auth
    );
    if (bundle.status !== 200 || !Array.isArray(bundle.body?.cases)) {
      markFail('PB-05 calendar-bundle', String(bundle.status));
    } else {
      pass('PB-05 calendar-bundle', `cases=${bundle.body.cases.length}`);
    }

    const summary = await getJson(`${BASE}/api/v1/cco-patient-master/patient/summary?patientId=__missing__`, auth);
    if (summary.status !== 404 && summary.status !== 400) {
      markFail('PB-06 patient/summary route', String(summary.status));
    } else {
      pass('PB-06 patient/summary route');
    }

    const snapshot = await getJson(`${BASE}/api/v1/cco/staff/dashboard-snapshot`, auth);
    if (snapshot.status === 404) {
      pass('PB-07 dashboard-snapshot', 'not warmed yet (404 ok)');
    } else if (snapshot.status === 200 && snapshot.body?.snapshot) {
      pass('PB-07 dashboard-snapshot', 'warm');
    } else {
      markFail('PB-07 dashboard-snapshot', String(snapshot.status));
    }
  }

  console.log('');
  if (hardFail) {
    console.error('CCO performance baseline: FAIL');
    process.exit(1);
  }
  console.log('CCO performance baseline: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
