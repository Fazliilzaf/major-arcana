#!/usr/bin/env node
/**
 * Prod-only Cloud Agent wiring verify (no local bundle rebuild).
 * Run: npm run verify:cloud-document-wiring-prod
 */
'use strict';

const https = require('node:https');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const EXPECT_COMMIT = (process.env.ARCANA_CLOUD_EXPECT_COMMIT || 'af3c4b5c').slice(0, 8);

const checks = [];

function pass(name, detail = '') {
  checks.push({ name, ok: true, detail });
}

function fail(name, detail = '') {
  checks.push({ name, ok: false, detail });
}

function get(path) {
  return new Promise((resolve, reject) => {
    https
      .get(`${BASE}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

(async () => {
  try {
    const ready = await get('/readyz');
    if (ready.status === 200 && ready.body.includes('"ready":true'))
      pass('readyz', String(ready.status));
    else fail('readyz', String(ready.status));

    const version = await get('/api/v1/_diag/version');
    let commit = '';
    try {
      commit = JSON.parse(version.body).commit?.slice(0, 8) || '';
    } catch {
      commit = '';
    }
    if (commit === EXPECT_COMMIT) pass('deploy commit', commit);
    else fail('deploy commit', `${commit} (expected ${EXPECT_COMMIT})`);

    const bundleRes = await get('/major-arcana-preview/data/hairtp-document-content-bundle.json');
    const bundle = JSON.parse(bundleRes.body);
    if (bundle.cacheVersion === 'hairtp-document-content-v6') {
      pass('bundle v6', bundle.cacheVersion);
    } else {
      fail('bundle version', bundle.cacheVersion);
    }

    const frisk = (bundle.customerFilled || []).find((d) => d.registryId === 'friskfoers_tp');
    if (frisk?.meridiq?.questions?.length === 13) pass('friskfoers 13 questions');
    else fail('friskfoers 13 questions', String(frisk?.meridiq?.questions?.length));

    const foto = (bundle.customerFilled || []).find((d) => d.registryId === 'foto_samtycke');
    if (foto?.contentStatus === 'PARTIAL') pass('foto_samtycke PARTIAL (expected until ORD-24)');
    else fail('foto_samtycke status', foto?.contentStatus);

    const cloud = await get('/major-arcana-preview/app/cco-hairtp-document-cloud.js');
    if (/openSteg9FotoSamtycke/.test(cloud.body)) pass('openSteg9 live');
    else fail('openSteg9 live');
    if (/buildOpDayStaffActionsHtml/.test(cloud.body)) pass('op-day panel live');
    else fail('op-day panel live');

    const referens = await get('/major-arcana-preview/app/cco-kundkort-referens.js');
    if (/buildOpDayStaffActionsHtml/.test(referens.body)) pass('referens op-day wiring live');
    else fail('referens op-day wiring live');
    if (/buildReferensRegistryDocsSection/.test(referens.body)) pass('registry section live');
    else fail('registry section live');

    const ui = await get('/major-arcana-preview/app/patient-master-ui.js');
    if (/cco:photo-consent-signed/.test(ui.body)) pass('photo consent event live');
    else fail('photo consent event live');
  } catch (error) {
    fail('prod fetch', error.message);
  }

  for (const row of checks) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} — ${row.name}${row.detail ? ` (${row.detail})` : ''}`);
  }

  const failed = checks.filter((row) => !row.ok).length;
  if (failed) {
    console.error(
      `\nverify-cloud-document-wiring-prod: ${checks.length - failed}/${checks.length} (${failed} failed)`
    );
    process.exit(1);
  }
  console.log(`\nverify-cloud-document-wiring-prod: ${checks.length}/${checks.length} PASS`);
})();
