#!/usr/bin/env node
/**
 * ORD-48 — prod stickprov (wiring + staff URLs + key assets).
 * Run: npm run verify:ord48-prod-sticks
 */
'use strict';

const https = require('node:https');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');

const PILOTS = [
  {
    id: 'bundle-steg7',
    label: 'Axel · demoSkipSteg7',
    patientId: '54a658c8-7412-4f10-877e-9e607e03b74f',
    params: 'view=customers&v9=on&demo=on&demoOpDay=1&demoSkipSteg7=1',
  },
  {
    id: 'ops-dag',
    label: 'Dino · op-dag',
    patientId: '4db24289-7f9e-431e-b7f3-bd9014d8c9f3',
    params: 'view=customers&v9=on&demo=on&demoOpDay=1',
  },
  {
    id: 'ready-composite',
    label: 'Jonas · variation',
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
  console.log(`ORD-48 prod stickprov @ ${BASE}\n`);

  try {
    const [readyz, version, status] = await Promise.all([
      get('/readyz'),
      get('/api/v1/_diag/version'),
      get('/api/public/status'),
    ]);

    if (readyz.status === 200 && /"ready"\s*:\s*true/.test(readyz.body)) {
      pass('readyz', 'ready');
    } else {
      fail('readyz', String(readyz.status));
    }

    if (version.status === 200) {
      const commit = JSON.parse(version.body).commit?.slice(0, 8) || '?';
      pass('prod version', commit);
    } else {
      fail('prod version', String(version.status));
    }

    if (status.status === 200 && /operational/i.test(status.body)) {
      pass('public status', 'operational');
    } else {
      fail('public status', String(status.status));
    }

    for (const pilot of PILOTS) {
      const path = `/staff?${pilot.params}&patientId=${encodeURIComponent(pilot.patientId)}`;
      const res = await get(path);
      if (res.status >= 200 && res.status < 400) {
        pass(`pilot ${pilot.id}`, `${pilot.label} HTTP ${res.status}`);
      } else {
        fail(`pilot ${pilot.id}`, `${pilot.label} HTTP ${res.status}`);
      }
      if (
        res.body.includes('patient-master-ui') ||
        res.body.includes('ArcanaPatientMasterUi') ||
        res.body.includes('major-arcana-preview')
      ) {
        pass(`pilot ${pilot.id} shell`, 'staff preview shell');
      } else if (res.status >= 200 && res.status < 400) {
        pass(`pilot ${pilot.id} shell`, 'HTTP OK');
      }
      if (/ArcanaPatientMasterUi|openPatient\(id\)/.test(res.body)) {
        pass(`pilot ${pilot.id} deeplink`, 'desktop patientId shim present');
      }
    }

    const [bundleUi, referens] = await Promise.all([
      get('/major-arcana-preview/app/cco-avtal-samtycke-bundle.js'),
      get('/major-arcana-preview/app/cco-kundkort-referens.js'),
    ]);

    if (bundleUi.status === 200 && /\/cco-treatment-agreement\/accept/.test(bundleUi.body)) {
      pass('asset bundle-ui', 'accept API wired in steg 7 UI');
    } else {
      fail('asset bundle-ui', 'missing accept API in cco-avtal-samtycke-bundle.js');
    }

    if (
      referens.status === 200 &&
      /data-kk-ord48-open-calendar|kk-ord48-ready/.test(referens.body)
    ) {
      pass('asset kundkort', 'ORD-48 ready row + kalender CTA in referens');
    } else if (
      referens.status === 200 &&
      /ready_for_treatment|readyForTreatment/.test(referens.body)
    ) {
      pass('asset kundkort', 'ready_for_treatment signal in referens');
    } else {
      fail('asset kundkort', 'ORD-48 ready/CTA missing in referens');
    }

    if (referens.status === 200 && /Object\.isFrozen\(resolver\)/.test(referens.body)) {
      pass('asset kundkort', 'frozen resolver guard (ORD-47/48)');
    } else {
      fail('asset kundkort', 'frozen resolver guard missing');
    }

    const hairtpCloud = await get('/major-arcana-preview/app/cco-hairtp-document-cloud.js');
    if (
      hairtpCloud.status === 200 &&
      /fitnessSigned|operationDay|ready_for_treatment/i.test(hairtpCloud.body)
    ) {
      pass('asset op-day', 'FC/ops-day signals in document cloud');
    } else {
      fail('asset op-day', 'op-day/FC wiring missing in document cloud');
    }
  } catch (error) {
    fail('fetch', error.message);
  }

  for (const row of checks) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} — ${row.name}${row.detail ? ` (${row.detail})` : ''}`);
  }

  const failed = checks.filter((row) => !row.ok).length;
  if (failed) {
    console.error(
      `\nverify-ord48-prod-sticks: ${checks.length - failed}/${checks.length} (${failed} failed)`
    );
    process.exit(1);
  }
  console.log(`\nverify-ord48-prod-sticks: ${checks.length}/${checks.length} PASS`);
})();
