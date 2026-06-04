#!/usr/bin/env node
'use strict';

/**
 * Verify 8-item CCO care sweep on prod:
 * J-8.1, J-8.2, J-7/U5B, TL-D (asset), U2.5b, U6D, journal_photos_backup
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

function getOwnerToken() {
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

  console.log(`CCO care sweep verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (ready.ready !== true) markFail('CC-01 readyz');
  else pass('CC-01 readyz');

  const maintenance = await getJson(`${BASE}/api/v1/ops/maintenance-window`);
  if (maintenance.status !== 200) markFail('CC-02 U2.5b maintenance-window', String(maintenance.status));
  else pass('CC-02 U2.5b maintenance-window');

  const patientHub = await fetch(`${BASE}/patient`);
  if (patientHub.status !== 200) markFail('CC-03 U6D patient hub', String(patientHub.status));
  else pass('CC-03 U6D patient hub');

  const preview = await fetch(`${BASE}/major-arcana-preview/`);
  const html = await preview.text();
  if (!/patient-master-ui\.js/.test(html)) markFail('CC-04 preview HTML');
  else pass('CC-04 preview HTML');

  const uiMatch = html.match(/patient-master-ui\.js[^"]*/);
  const uiPath = uiMatch ? uiMatch[0] : 'patient-master-ui.js?v=build-care-sweep-a';
  const ui = await fetch(`${BASE}/major-arcana-preview/app/${uiPath}`);
  const uiText = await ui.text();
  if (!/data-patient-tab="tidslinje"/.test(uiText)) markFail('CC-05 TL-D mobile tidslinje tab');
  else pass('CC-05 TL-D tidslinje tab + filter');
  if (!/review-draft-proposal/.test(uiText)) markFail('CC-06 J-8.2 draft proposal UI');
  else pass('CC-06 J-8.2 draft proposal UI');
  if (!/data-cco-care-open|cco-care-panel\.js/.test(html)) markFail('CC-06b J-8.1 CCO care panel UI');
  else pass('CC-06b J-8.1 CCO care panel UI');

  const careMatch = html.match(/cco-care-panel\.js[^"]*/);
  const carePath = careMatch ? careMatch[0] : 'cco-care-panel.js?v=build-ai-care-sweep-a';
  const careUi = await fetch(`${BASE}/major-arcana-preview/app/${carePath}`);
  const careText = await careUi.text();
  if (!/missing-forms-report/.test(careText)) markFail('CC-06c J-8.1 care panel API wiring');
  else pass('CC-06c J-8.1 care panel API wiring');

  let token = '';
  try {
    token = getOwnerToken();
    pass('CC-07 owner token');
  } catch (error) {
    markFail('CC-07 owner token', error.message?.slice(0, 80));
  }

  if (token) {
    const auth = { Authorization: `Bearer ${token}` };
    const scheduler = await getJson(`${BASE}/api/v1/ops/scheduler/status`, auth);
    const jobs = scheduler.body?.scheduler?.jobs || [];
    const required = [
      'journal_photos_backup',
      'cco_daily_missing_forms_report',
      'cco_journal_draft_proposals',
      'cco_customer_reminders',
    ];
    for (const id of required) {
      const job = jobs.find((row) => row.id === id);
      if (!job?.enabled) markFail(`CC-08 scheduler ${id}`, job ? 'disabled' : 'missing');
      else pass(`CC-08 scheduler ${id}`, job.enabled ? 'enabled' : 'ok');
    }

    const missingForms = await getJson(`${BASE}/api/v1/ops/cco-care/missing-forms-report`, auth);
    if (missingForms.status !== 200) markFail('CC-09 J-8.1 missing-forms API', String(missingForms.status));
    else pass('CC-09 J-8.1 missing-forms API', `${missingForms.body?.report?.patientsWithMissing ?? '?'} patients`);

    const drafts = await getJson(`${BASE}/api/v1/ops/cco-care/draft-proposals?limit=5`, auth);
    if (drafts.status !== 200) markFail('CC-10 J-8.2 draft-proposals API', String(drafts.status));
    else pass('CC-10 J-8.2 draft-proposals API', `${(drafts.body?.proposals || []).length} pending`);

    const reminders = await getJson(`${BASE}/api/v1/ops/cco-care/reminders`, auth);
    if (reminders.status !== 200) markFail('CC-11 J-7/U5B reminders API', String(reminders.status));
    else pass('CC-11 J-7/U5B reminders API', `queue total ${reminders.body?.queue?.total ?? 0}`);
  }

  if (hardFail) {
    console.error('\n❌ CCO care sweep verify FAIL');
    process.exit(1);
  }
  console.log('\n✅ CCO care sweep verify PASS');
}

main().catch((error) => {
  console.error('❌', error.message || error);
  process.exit(1);
});
