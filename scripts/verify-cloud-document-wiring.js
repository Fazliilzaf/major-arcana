#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const bundlePath = path.join(
  ROOT,
  'public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);

const checks = [];

function pass(name, detail = '') {
  checks.push({ name, ok: true, detail });
}

function fail(name, detail = '') {
  checks.push({ name, ok: false, detail });
}

try {
  execSync('npm run build:hairtp-document-content', { cwd: ROOT, stdio: 'pipe' });
  pass('C6.1 build:hairtp-document-content');
} catch (error) {
  fail('C6.1 build:hairtp-document-content', error.stderr?.toString() || error.message);
}

if (fs.existsSync(bundlePath)) {
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  pass('C6.1 bundle exists', bundle.cacheVersion || 'no cacheVersion');
  if (bundle.customerFilled?.some((doc) => doc.registryId === 'friskfoers_tp')) {
    pass('C6.1 friskfoers_tp in bundle');
  } else {
    fail('C6.1 friskfoers_tp in bundle');
  }
  if (bundle.customerFilled?.some((doc) => doc.registryId === 'foto_samtycke')) {
    pass('C6.1 foto_samtycke in bundle');
  } else {
    fail('C6.1 foto_samtycke in bundle');
  }
} else {
  fail('C6.1 bundle exists', bundlePath);
}

const forbiddenPatterns = [
  {
    id: 'C6.3',
    label: 'steg7 reads bundle via loadForSteg7',
    files: ['public/major-arcana-preview/app/cco-avtal-samtycke-bundle.js'],
    pattern: /loadForSteg7/,
    allowed: true,
  },
  {
    id: 'C6.3',
    label: 'hardcoded COOLING_BODY in overlays',
    files: [
      'public/major-arcana-preview/app/cco-friskforsakran-demo-overlay.js',
      'public/major-arcana-preview/app/cco-foto-samtycke-demo-overlay.js',
    ],
    pattern: /COOLING_BODY|buildAgreementBody/,
    allowed: false,
  },
];

for (const rule of forbiddenPatterns) {
  let hit = false;
  for (const rel of rule.files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    if (rule.pattern.test(text)) {
      hit = true;
      break;
    }
  }
  if (hit === rule.allowed) pass(rule.label);
  else fail(rule.label, rule.allowed ? 'expected pattern missing' : 'forbidden pattern found');
}

const cloudPath = path.join(ROOT, 'public/major-arcana-preview/app/cco-hairtp-document-cloud.js');
const cloudSrc = fs.readFileSync(cloudPath, 'utf8');
if (/openSteg9FotoSamtycke/.test(cloudSrc) && /isSteg9RegistryId/.test(cloudSrc)) {
  pass('C4 shell openSteg9 wired in cloud module');
} else {
  fail('C4 shell openSteg9 wired in cloud module');
}

const referensPath = path.join(ROOT, 'public/major-arcana-preview/app/cco-kundkort-referens.js');
const referensSrc = fs.readFileSync(referensPath, 'utf8');
if (
  /buildReferensRegistryDocsSection/.test(referensSrc) &&
  /data-kk-registry-filter/.test(referensSrc)
) {
  pass('C5 persistent registry section in kundkort-referens');
} else {
  fail('C5 persistent registry section in kundkort-referens');
}

if (!/curatiio/i.test(cloudSrc) || /resolvePatientBrand|curatiio/.test(referensSrc)) {
  pass('C6.4 brand hooks present (no accidental Curatiio merge in cloud)');
} else {
  fail('C6.4 brand hooks present');
}

try {
  execSync('node --test tests/ops/ccoHairtpDocumentCloudFas3.test.js', {
    cwd: ROOT,
    stdio: 'pipe',
  });
  pass('Fas 3 unit tests');
} catch (error) {
  fail('Fas 3 unit tests', error.stdout?.toString() || error.message);
}

const failed = checks.filter((row) => !row.ok);
for (const row of checks) {
  console.log(`${row.ok ? 'PASS' : 'FAIL'} — ${row.name}${row.detail ? ` (${row.detail})` : ''}`);
}

if (failed.length) {
  console.error(`\nverify-cloud-document-wiring: ${failed.length} failure(s)`);
  process.exit(1);
}

console.log(`\nverify-cloud-document-wiring: ${checks.length}/${checks.length} PASS`);
