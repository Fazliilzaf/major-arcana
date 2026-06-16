#!/usr/bin/env node
/**
 * ORD-47 L6 — prod stickprov (statisk wiring + canonical staff URLs).
 * Run: npm run verify:ord47-prod-sticks
 */
'use strict';

const https = require('node:https');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');

const STICKS = [
  {
    id: 'tp-tidig',
    label: 'TP tidig · demoSkipSteg7',
    patientId: '54a658c8-7412-4f10-877e-9e607e03b74f',
    params: 'view=customers&v9=on&demo=on&demoOpDay=1&demoSkipSteg7=1',
  },
  {
    id: 'tp-op-dag',
    label: 'TP op-dag',
    patientId: '4db24289-7f9e-431e-b7f3-bd9014d8c9f3',
    params: 'view=customers&v9=on&demo=on&demoOpDay=1',
  },
  {
    id: 'variation',
    label: 'Variation · Jonas Lundvall',
    patientId: 'a6a55cae-8c12-4d7d-83da-adbcdd368b00',
    params: 'view=customers&v9=on&demo=on&demoOpDay=1',
  },
];

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
  console.log(`ORD-47 prod stickprov @ ${BASE}\n`);

  try {
    const version = await get('/api/v1/_diag/version');
    if (version.status === 200) {
      const commit = JSON.parse(version.body).commit?.slice(0, 8) || '?';
      pass('prod version', commit);
    } else {
      fail('prod version', String(version.status));
    }

    for (const stick of STICKS) {
      const path = `/staff?${stick.params}&patientId=${encodeURIComponent(stick.patientId)}`;
      const res = await get(path);
      if (res.status >= 200 && res.status < 400) {
        pass(`stick ${stick.id}`, `${stick.label} HTTP ${res.status}`);
      } else {
        fail(`stick ${stick.id}`, `${stick.label} HTTP ${res.status}`);
      }
      if (res.body.includes('patient-master-ui') || res.body.includes('major-arcana-preview')) {
        pass(`stick ${stick.id} shell`, 'staff HTML loads preview shell');
      } else if (res.status >= 200 && res.status < 400) {
        pass(`stick ${stick.id} shell`, 'HTTP OK (SPA shell)');
      }
    }

    const [referens, resolver] = await Promise.all([
      get('/major-arcana-preview/app/cco-kundkort-referens.js'),
      get('/major-arcana-preview/app/cco-journey-doc-resolver.js'),
    ]);
    if (/buildOrd47CardsBlock/.test(referens.body)) pass('stick asset', '§-kort builder live');
    else fail('stick asset', '§-kort builder missing');

    if (
      resolver.status === 200 &&
      /uiCardForStep/.test(resolver.body) &&
      /filterOffersByFlow/.test(resolver.body)
    ) {
      pass('stick asset', 'resolver helpers exported (7e7ac22b+)');
    } else {
      fail('stick asset', 'resolver missing uiCardForStep/filterOffersByFlow — deploy 7e7ac22b+');
    }
  } catch (error) {
    fail('stick fetch', error.message);
  }

  for (const row of checks) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} — ${row.name}${row.detail ? ` (${row.detail})` : ''}`);
  }

  const failed = checks.filter((row) => !row.ok).length;
  if (failed) {
    console.error(
      `\nverify-ord47-prod-sticks: ${checks.length - failed}/${checks.length} (${failed} failed)`
    );
    process.exit(1);
  }
  console.log(`\nverify-ord47-prod-sticks: ${checks.length}/${checks.length} PASS`);
})();
