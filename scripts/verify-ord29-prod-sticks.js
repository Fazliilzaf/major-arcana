#!/usr/bin/env node
/**
 * ORD-29 — prod stickprov (HD enrichment wiring + staff URLs + stickprov API).
 * Run: npm run verify:ord29-prod-sticks
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const ROOT = path.join(__dirname, '..');
const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');

const STICKPROV = [
  { id: '3cdf4d6c-8f3d-4b2a-9c1e-2a4f8b0e9d12', label: 'Omar Khalid (HD PDF ref)' },
  { id: 'ab645651-d4a4-40ef-b8e3-c8112c7d6baa', label: 'Michael Ohgami (HD mail)' },
  { id: '8ae3f11e-9b41-4257-ab30-922d1d1aa216', label: 'Fahed Abbas' },
  { id: '134562c1-ce60-49a3-82dd-f5489defaf09', label: 'Johan Magnusson (HD PDF)' },
  { id: '2cd06d37-44f7-4ff8-ab1a-35eda42671a7', label: 'Henrik Martinsson' },
];

const PILOTS = [
  {
    id: 'omar-hd',
    label: 'Omar · HD positive',
    patientId: '3cdf4d6c-8f3d-4b2a-9c1e-2a4f8b0e9d12',
    params: 'view=customers&v9=on&demo=on&demoOpDay=1',
  },
  {
    id: 'johan-hd',
    label: 'Johan · HD PDF',
    patientId: '134562c1-ce60-49a3-82dd-f5489defaf09',
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

function warn(name, detail = '') {
  checks.push({ name, ok: true, warn: true, detail });
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
  console.log(`ORD-29 prod stickprov @ ${BASE}\n`);

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

    const enrichmentSrc = readLocal('src/ops/ccoKunderEnrichment.js');
    if (/function isHealthDeclarationAsset\s*\(/.test(enrichmentSrc)) {
      pass('static enrichment', 'isHealthDeclarationAsset');
    } else {
      fail('static enrichment', 'isHealthDeclarationAsset missing');
    }
    if (
      /case 'missing_health_declaration':/.test(enrichmentSrc) &&
      /case 'halso':/.test(enrichmentSrc)
    ) {
      pass('static enrichment', 'matchSegment missing_health_declaration + halso');
    } else {
      fail('static enrichment', 'matchSegment cases missing');
    }

    const referensSrc = readLocal('public/major-arcana-preview/app/cco-kundkort-referens.js');
    if (/function referensHasSignedHd\s*\(/.test(referensSrc)) {
      pass('static referens', 'referensHasSignedHd');
    } else {
      fail('static referens', 'referensHasSignedHd missing');
    }
    if (
      /function resolveOrd48ReadyState/.test(referensSrc) &&
      /missingHealthDeclaration/.test(
        referensSrc.slice(
          referensSrc.indexOf('function resolveOrd48ReadyState'),
          referensSrc.indexOf('function resolveOrd48ReadyState') + 800
        )
      )
    ) {
      pass('static referens', 'missingHealthDeclaration in resolveOrd48ReadyState');
    } else {
      fail('static referens', 'resolveOrd48ReadyState HD gate missing');
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

    let token = null;
    try {
      const { getProdToken, fetchPatient } = require('./lib/halsoHdProdClient');
      token = getProdToken();
      for (const row of STICKPROV) {
        try {
          const patient = await fetchPatient(token, row.id);
          const missing = patient.missingHealthDeclaration;
          if (missing === false) {
            pass(
              `api stickprov ${row.id.slice(0, 8)}`,
              `${row.label} missingHealthDeclaration=false`
            );
          } else {
            fail(
              `api stickprov ${row.id.slice(0, 8)}`,
              `${row.label} missingHealthDeclaration=${String(missing)}`
            );
          }
        } catch (error) {
          fail(`api stickprov ${row.id.slice(0, 8)}`, `${row.label}: ${error.message}`);
        }
      }
    } catch (error) {
      warn('api stickprov', `skipped — no prod token (${error.message})`);
    }
  } catch (error) {
    fail('fetch', error.message);
  }

  for (const row of checks) {
    const tag = row.warn ? 'WARN' : row.ok ? 'PASS' : 'FAIL';
    console.log(`${tag} — ${row.name}${row.detail ? ` (${row.detail})` : ''}`);
  }

  const failed = checks.filter((row) => !row.ok).length;
  if (failed) {
    console.error(
      `\nverify-ord29-prod-sticks: ${checks.length - failed}/${checks.length} (${failed} failed)`
    );
    process.exit(1);
  }
  console.log(`\nverify-ord29-prod-sticks: ${checks.length}/${checks.length} PASS`);
})();
