#!/usr/bin/env node
/**
 * ORD-6 — prod stickprov (legal-review gate wiring + staff pilot URLs).
 * Run: npm run verify:ord6-prod-sticks
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const ROOT = path.join(__dirname, '..');
const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');

const PILOTS = [
  {
    id: 'axel-legal',
    label: 'Axel · legal review path (no demoSkipSteg7)',
    patientId: '54a658c8-7412-4f10-877e-9e607e03b74f',
    params: 'view=customers&v9=on&demo=on&demoOpDay=1',
  },
  {
    id: 'jonas-variation',
    label: 'Jonas · variation',
    patientId: 'a6a55cae-8c12-4d7d-83da-adbcdd368b00',
    params: 'view=customers&v9=on&demo=on&demoOpDay=1',
  },
  {
    id: 'dino-opdag',
    label: 'Dino · op-dag',
    patientId: '4db24289-7f9e-431e-b7f3-bd9014d8c9f3',
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

function readLocal(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
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
  console.log(`ORD-6 prod stickprov @ ${BASE}\n`);

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

    const referensSrc = readLocal('public/major-arcana-preview/app/cco-kundkort-referens.js');
    const referensNeedles = [
      'Kontrollera gate',
      'template-version-approval',
      'Godkänn mall-version',
      'Aktivera signering',
      'send-for-sign/preview',
    ];
    for (const needle of referensNeedles) {
      if (referensSrc.includes(needle)) {
        pass('static referens', needle);
      } else {
        fail('static referens', `missing ${needle}`);
      }
    }

    const bundleSrc = readLocal('public/major-arcana-preview/app/cco-avtal-samtycke-bundle.js');
    if (/legal_review/.test(bundleSrc) && /juridisk granskning/i.test(bundleSrc)) {
      pass('static bundle-ui', 'legal_review gate copy');
    } else {
      fail('static bundle-ui', 'legal_review gate text missing');
    }

    const routesSrc = readLocal('src/routes/ccoTreatmentAgreement.js');
    if (routesSrc.includes('template-version-approval')) {
      pass('static routes', 'template-version-approval route');
    } else {
      fail('static routes', 'template-version-approval missing');
    }
    if (routesSrc.includes('record-legal-review')) {
      fail('static routes', 'record-legal-review must not exist (väg A)');
    } else {
      pass('static routes', 'no record-legal-review (väg A)');
    }

    for (const pilot of PILOTS) {
      const staffPath = `/staff?${pilot.params}&patientId=${encodeURIComponent(pilot.patientId)}`;
      const res = await get(staffPath);
      if (res.status >= 200 && res.status < 400) {
        pass(`pilot ${pilot.id}`, `${pilot.label} HTTP ${res.status}`);
      } else {
        fail(`pilot ${pilot.id}`, `${pilot.label} HTTP ${res.status}`);
      }
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
      `\nverify-ord6-prod-sticks: ${checks.length - failed}/${checks.length} (${failed} failed)`
    );
    process.exit(1);
  }
  console.log(`\nverify-ord6-prod-sticks: ${checks.length}/${checks.length} PASS`);
})();
