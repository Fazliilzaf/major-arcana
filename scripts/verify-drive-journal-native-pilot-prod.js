#!/usr/bin/env node
'use strict';

/**
 * Prod verify: drive journal native pilot summary + sample patient file URLs.
 */

require('dotenv').config({ quiet: true });

const BASE = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');

async function getToken() {
  const { execFileSync } = require('node:child_process');
  const out = execFileSync('node', ['scripts/get-prod-auth-token.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!out) throw new Error('empty token');
  return out;
}

async function fetchJson(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const token = await getToken();
  const summary = await fetchJson('/api/v1/cco/drive-journal-native-pilot/summary', token);
  if (summary.status !== 200) {
    console.error('FAIL summary', summary.status, summary.body);
    process.exit(1);
  }
  console.log('PASS summary', JSON.stringify(summary.body));

  const patientIds = summary.body?.patientCount ? [] : summary.body?.patientIds;
  const ids = Array.isArray(summary.body?.patientIds) ? summary.body.patientIds : patientIds;
  const sampleId = ids?.[0];
  if (!summary.body?.active) {
    console.log(
      'SKIP patient sample — pilot not active on prod (set ENABLE_DRIVE_JOURNAL_NATIVE_PILOT=true)'
    );
    process.exit(0);
  }
  if (!sampleId) {
    console.log('WARN active pilot but no patientIds in summary payload');
    process.exit(0);
  }

  const patient = await fetchJson(
    `/api/v1/cco-patient-master/patient/summary?patientId=${encodeURIComponent(sampleId)}`,
    token
  );
  if (patient.status !== 200) {
    console.error('FAIL patient summary', patient.status);
    process.exit(1);
  }
  const nativeFiles = (patient.body?.driveFiles || []).filter((f) => f.ccoNative);
  console.log(
    `PASS sample patient files native=${nativeFiles.length} total=${(patient.body?.driveFiles || []).length}`
  );
  if (nativeFiles.length === 0) {
    console.error('FAIL expected at least one ccoNative journal file for pilot patient');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
