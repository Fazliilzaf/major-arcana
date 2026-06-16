#!/usr/bin/env node
/**
 * Prod-only Cloud Agent wiring verify (ORD-46 + ORD-47).
 * Run: npm run verify:cloud-document-wiring-prod
 */
'use strict';

const https = require('node:https');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const EXPECT_COMMIT = (process.env.ARCANA_CLOUD_EXPECT_COMMIT || '7e7ac22b').slice(0, 8);
const STRICT_COMMIT = Boolean(process.env.ARCANA_CLOUD_EXPECT_COMMIT);

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

function checkBundle(bundleRes) {
  if (bundleRes.status !== 200) {
    fail('bundle fetch', String(bundleRes.status));
    return;
  }
  let bundle;
  try {
    bundle = JSON.parse(bundleRes.body);
  } catch (error) {
    fail('bundle parse', error.message);
    return;
  }
  if (bundle.cacheVersion === 'hairtp-document-content-v7') {
    pass('bundle v7', bundle.cacheVersion);
  } else {
    fail('bundle version', bundle.cacheVersion);
  }
  const summary = bundle.summary || {};
  const totalMissing =
    (summary.customerFilled?.MISSING || 0) +
    (summary.staffFilled?.MISSING || 0) +
    (summary.information?.MISSING || 0);
  if (totalMissing === 0) pass('bundle 0 MISSING');
  else fail('bundle MISSING count', String(totalMissing));

  const frisk = (bundle.customerFilled || []).find((d) => d.registryId === 'friskfoers_tp');
  if (frisk?.meridiq?.questions?.length === 13) pass('friskfoers 13 questions');
  else fail('friskfoers 13 questions', String(frisk?.meridiq?.questions?.length));

  const foto = (bundle.customerFilled || []).find((d) => d.registryId === 'foto_samtycke');
  if (foto?.contentStatus === 'FULL')
    pass('foto_samtycke FULL (scope-samtycke wired — ORD-24 stängd)');
  else fail('foto_samtycke status', foto?.contentStatus);
}

function checkOrd46Assets(cloud, referens, ui) {
  if (cloud.status === 200 && /openSteg9FotoSamtycke/.test(cloud.body)) pass('openSteg9 live');
  else fail('openSteg9 live', String(cloud.status));
  if (cloud.status === 200 && /buildOpDayStaffActionsHtml/.test(cloud.body))
    pass('op-day panel live');
  else fail('op-day panel live');

  if (referens.status === 200 && /buildOpDayStaffActionsHtml/.test(referens.body)) {
    pass('referens op-day wiring live');
  } else fail('referens op-day wiring live', String(referens.status));
  if (referens.status === 200 && /buildReferensRegistryDocsSection/.test(referens.body)) {
    pass('registry section live');
  } else fail('registry section live', String(referens.status));

  if (ui.status === 200 && /cco:photo-consent-signed/.test(ui.body))
    pass('photo consent event live');
  else fail('photo consent event live', String(ui.status));
}

function checkOrd47Assets(referens, resolver, index) {
  if (resolver.status === 200 && /listDocsForUiCard/.test(resolver.body)) {
    pass('ord47 journey resolver live');
  } else fail('ord47 journey resolver live', String(resolver.status));

  if (
    index.status === 200 &&
    /cco-journey-doc-resolver\.js/.test(index.body) &&
    /cco-kundkort-referens\.js/.test(index.body)
  ) {
    pass('ord47 script wiring in index');
  } else fail('ord47 script wiring in index', String(index.status));

  if (
    referens.status === 200 &&
    /ORD47_V1/.test(referens.body) &&
    /buildOrd47CardsBlock/.test(referens.body)
  ) {
    pass('ord47 §-cards in referens');
  } else fail('ord47 §-cards in referens', String(referens.status));

  if (referens.status === 200 && /data-kk-mallbibliotek-host hidden/.test(referens.body)) {
    pass('ord47 mallbibliotek hidden default');
  } else fail('ord47 mallbibliotek hidden default', String(referens.status));

  if (
    resolver.status === 200 &&
    /uiCardForStep/.test(resolver.body) &&
    /filterOffersByFlow/.test(resolver.body)
  ) {
    pass('ord47 resolver helpers exported');
  } else fail('ord47 resolver helpers exported', String(resolver.status));

  if (
    referens.status === 200 &&
    /kk-ord47-topbar/.test(referens.body) &&
    /kk-ord47-rail/.test(referens.body)
  ) {
    pass('ord47 topbar + rail markup');
  } else fail('ord47 topbar + rail markup', String(referens.status));
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
    else if (!STRICT_COMMIT && commit)
      pass('deploy commit', `${commit} (live; pin=${EXPECT_COMMIT})`);
    else fail('deploy commit', `${commit || version.status} (expected ${EXPECT_COMMIT})`);

    const [bundleRes, cloud, referens, ui, resolver, index] = await Promise.all([
      get('/major-arcana-preview/data/hairtp-document-content-bundle.json'),
      get('/major-arcana-preview/app/cco-hairtp-document-cloud.js'),
      get('/major-arcana-preview/app/cco-kundkort-referens.js'),
      get('/major-arcana-preview/app/patient-master-ui.js'),
      get('/major-arcana-preview/app/cco-journey-doc-resolver.js'),
      get('/major-arcana-preview/index.html'),
    ]);

    checkBundle(bundleRes);
    checkOrd46Assets(cloud, referens, ui);
    checkOrd47Assets(referens, resolver, index);
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
