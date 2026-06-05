#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });
const { execSync } = require('node:child_process');

const BASE = (process.env.VERIFY_BASE || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');

function getToken() {
  return execSync('node scripts/get-prod-auth-token.js --owner', {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function getJson(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const results = [];
  const pass = (name, detail) => results.push({ name, pass: true, detail });
  const fail = (name, detail) => results.push({ name, pass: false, detail });

  let token = '';
  try {
    token = getToken();
  } catch (error) {
    console.error('AUTH_FAIL:', error.message);
    process.exit(1);
  }

  const shell = await getJson(
    '/api/v1/cco/staff/customers-shell?limit=1&offset=0&includeAutomation=1',
    token
  );
  const patientId = shell.body?.patients?.patients?.[0]?.patientId || '';
  if (!patientId) {
    fail('patientId', `shell HTTP ${shell.status}, ingen patient`);
  } else {
    pass('patientId', patientId);
  }

  if (patientId) {
    const doc = await getJson(
      `/api/v1/cco-patient-master/patient/document-bundle?patientId=${encodeURIComponent(patientId)}`,
      token
    );
    const d = doc.body?.documents || {};
    const shapeOk =
      doc.status === 200 &&
      doc.body.ready === true &&
      Array.isArray(d.offers) &&
      Array.isArray(d.healthForms) &&
      Array.isArray(d.journaler) &&
      Array.isArray(d.autoDokument);
    if (shapeOk) {
      pass(
        'document-bundle 4-grupper',
        `offers=${d.offers.length} health=${d.healthForms.length} journaler=${d.journaler.length} auto=${d.autoDokument.length} total=${doc.body.counts?.total ?? '?'}`
      );
    } else {
      fail('document-bundle 4-grupper', `HTTP ${doc.status} ready=${doc.body?.ready}`);
    }

    const dossier = await getJson(
      `/api/v1/cco-patient-master/patient/dossier-bundle?patientId=${encodeURIComponent(patientId)}&includeJournal=0`,
      token
    );
    const hasDocs = dossier.status === 200 && dossier.body?.documents?.offers;
    if (hasDocs) {
      pass('dossier-bundle documents', `offers=${dossier.body.documents.offers?.length ?? 0}`);
    } else {
      fail('dossier-bundle documents', `HTTP ${dossier.status}`);
    }

    const readout = shell.body?.patients?.patients?.[0] || {};
    const docSignals = (readout.automationSignals || []).filter(
      (s) => s.status === 'active' && String(s.ruleId || '').startsWith('document.')
    );
    pass(
      'requiredFor readout fields',
      `blockedSteps=${(readout.blockedSteps || []).length} blockedActionIds=${(readout.blockedActionIds || []).length} docSignals=${docSignals.length}`
    );
  }

  console.log(`# ORD-24 prod verify — ${BASE}\n`);
  for (const row of results) {
    console.log(`[${row.pass ? 'PASS' : 'FAIL'}] ${row.name} — ${row.detail}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nResult: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
