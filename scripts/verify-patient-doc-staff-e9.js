#!/usr/bin/env node
/**
 * Verify BOOKOFF E9 — staff-shell (badge Personal) on live routes B16–B24.
 * Local: ARCANA_PROD_URL=http://127.0.0.1:3100 npm run verify:patient-doc-staff-e9
 */
'use strict';

const http = require('node:http');
const https = require('node:https');
const {
  listStaffLiveRegistryIds,
  buildLiveDocumentPath,
} = require('../src/ops/patientDocumentLiveRegistry');

const BASE = (process.env.ARCANA_PROD_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '');
const client = BASE.startsWith('https') ? https : http;

function get(path) {
  return new Promise((resolve, reject) => {
    client
      .get(`${BASE}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
          })
        );
      })
      .on('error', reject);
  });
}

async function main() {
  const checks = [];
  const pass = (name, detail = '') => checks.push({ name, ok: true, detail });
  const fail = (name, detail = '') => checks.push({ name, ok: false, detail });

  const staffIds = listStaffLiveRegistryIds();
  if (staffIds.length === 9) pass('E9 staff registry count', '9');
  else fail('E9 staff registry count', String(staffIds.length));

  try {
    const manifest = await get('/api/v1/cco/patient-documents/live/manifest');
    if (manifest.status === 200 && manifest.body.includes('"staff"')) {
      pass('manifest staff-block');
    } else {
      fail('manifest staff-block', String(manifest.status));
    }
  } catch (error) {
    fail('manifest staff-block', error.message);
  }

  for (const registryId of staffIds) {
    const urlPath = buildLiveDocumentPath(registryId, { patientId: 'verify-e9-patient' });
    try {
      const res = await get(urlPath);
      if (res.status !== 200) {
        fail(registryId, `HTTP ${res.status}`);
        continue;
      }
      if (String(res.headers['x-arcana-patient-doc-audience'] || '') === 'staff') {
        pass(`${registryId} audience header`);
      } else {
        fail(`${registryId} audience header`, res.headers['x-arcana-patient-doc-audience'] || '—');
      }
      if (String(res.headers['x-arcana-patient-doc-staff-badge'] || '') === 'Personal') {
        pass(`${registryId} staff badge header`);
      } else {
        fail(`${registryId} staff badge header`);
      }
      if (res.body.includes('__ARCANA_PATIENT_DOC_STAFF__=true')) {
        pass(`${registryId} staff boot flag`);
      } else {
        fail(`${registryId} staff boot flag`);
      }
      if (res.body.includes('header-badge--staff') && res.body.includes('>Personal<')) {
        pass(`${registryId} Personal badge HTML`);
      } else {
        fail(`${registryId} Personal badge HTML`);
      }
      if (res.body.includes('staff-document-shell.css') || res.body.includes('cco-staff-shell')) {
        pass(`${registryId} staff shell CSS`);
      } else {
        fail(`${registryId} staff shell CSS`);
      }
    } catch (error) {
      fail(registryId, error.message);
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== verify:patient-doc-staff-e9 (${BASE}) ===\n`);
  for (const check of checks) {
    console.log(
      `${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`
    );
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} kontroller passerade.\n`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
