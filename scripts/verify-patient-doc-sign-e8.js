#!/usr/bin/env node
/**
 * Verify BOOKOFF E8 — signering/audit/PDF wiring on live patient-doc routes.
 * Local: ARCANA_PROD_URL=http://127.0.0.1:3100 npm run verify:patient-doc-sign-e8
 */
'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const {
  listE8SignRegistryIds,
  resolveSignConfig,
} = require('../src/ops/patientDocumentSignRegistry');
const { OFFERT_SLUG, buildLiveDocumentPath } = require('../src/ops/patientDocumentLiveRegistry');

const BASE = (process.env.ARCANA_PROD_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '');
const client = BASE.startsWith('https') ? https : http;
const ROOT = path.resolve(__dirname, '..');
const SHELL_JS = path.join(ROOT, 'public/major-arcana-preview/app/patient-document-shell.js');

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

  if (fs.existsSync(SHELL_JS)) pass('patient-document-shell.js finns');
  else fail('patient-document-shell.js finns', SHELL_JS);

  const e8Ids = listE8SignRegistryIds();
  if (e8Ids.length === 12) pass('E8 registry count', '12');
  else fail('E8 registry count', String(e8Ids.length));

  for (const registryId of e8Ids) {
    const phase = OFFERT_SLUG[registryId] ? 7 : undefined;
    const cfg = resolveSignConfig(registryId, { phase });
    if (cfg?.handler) pass(`sign config ${registryId}`, cfg.handler);
    else fail(`sign config ${registryId}`);
  }

  try {
    const manifest = await get('/api/v1/cco/patient-documents/live/manifest');
    if (manifest.status === 200 && manifest.body.includes('"sign"')) {
      pass('manifest inkluderar sign-block');
    } else {
      fail('manifest inkluderar sign-block', String(manifest.status));
    }
  } catch (error) {
    fail('manifest inkluderar sign-block', error.message);
  }

  for (const registryId of e8Ids) {
    const phase = OFFERT_SLUG[registryId] ? 7 : undefined;
    const urlPath = buildLiveDocumentPath(registryId, { phase, patientId: 'verify-e8-patient' });
    try {
      const res = await get(urlPath);
      if (res.status !== 200) {
        fail(`live HTML ${registryId}`, `HTTP ${res.status}`);
        continue;
      }
      if (res.body.includes('__ARCANA_PATIENT_DOC_SIGN__')) {
        pass(`boot sign ${registryId}`);
      } else {
        fail(`boot sign ${registryId}`, 'saknar __ARCANA_PATIENT_DOC_SIGN__');
      }
      if (res.body.includes('patient-document-shell.js')) {
        pass(`shell script ${registryId}`);
      } else {
        fail(`shell script ${registryId}`);
      }
      if (
        res.body.includes('__ARCANA_STAFF_JOURNAL_OPEN__=true') ||
        res.body.includes('__ARCANA_PATIENT_DOC_LIVE__')
      ) {
        pass(`live boot ${registryId}`);
      } else {
        fail(`live boot ${registryId}`);
      }
      const handler = resolveSignConfig(registryId, { phase })?.handler || '';
      const headerHandler = res.headers['x-arcana-patient-doc-sign-handler'] || '';
      if (headerHandler === handler) {
        pass(`sign header ${registryId}`, handler);
      } else {
        fail(`sign header ${registryId}`, `${headerHandler} != ${handler}`);
      }
    } catch (error) {
      fail(`live HTML ${registryId}`, error.message);
    }
  }

  // Offert steg 5 ska INTE injicera sign-handler
  try {
    const res = await get(buildLiveDocumentPath('offert_tp', { phase: 5 }));
    if (res.status === 200 && !res.body.includes('__ARCANA_PATIENT_DOC_SIGN__')) {
      pass('offert_tp phase5 utan sign boot');
    } else if (res.body.includes('"disabled":true')) {
      pass('offert_tp phase5 disabled sign');
    } else {
      fail('offert_tp phase5 utan sign boot');
    }
  } catch (error) {
    fail('offert_tp phase5 utan sign boot', error.message);
  }

  console.log(`=== verify:patient-doc-sign-e8 (${BASE}) ===\n`);
  let ok = 0;
  let bad = 0;
  for (const row of checks) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.name}${row.detail ? ` — ${row.detail}` : ''}`);
    if (row.ok) ok += 1;
    else bad += 1;
  }
  console.log(`\n${ok}/${ok + bad} kontroller passerade.`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
