#!/usr/bin/env node
/**
 * Fas 0 audit — Hair TP document content bundle coverage.
 * Run: npm run audit:hairtp-document-bundle
 * Read-only report; does not rebuild unless --rebuild is passed.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const bundlePath = path.join(
  ROOT,
  'public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);
const rebuild = process.argv.includes('--rebuild');

if (rebuild) {
  execSync('npm run build:hairtp-document-content', { cwd: ROOT, stdio: 'inherit' });
}

if (!fs.existsSync(bundlePath)) {
  console.error('Missing bundle:', bundlePath);
  console.error('Run: npm run build:hairtp-document-content');
  process.exit(1);
}

const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));

function tally(docs) {
  const counts = { FULL: 0, PARTIAL: 0, MISSING: 0, OTHER: 0 };
  for (const doc of docs) {
    const status = String(doc.contentStatus || '').toUpperCase();
    if (counts[status] !== undefined) counts[status] += 1;
    else counts.OTHER += 1;
  }
  return counts;
}

function sectionRows(label, docs) {
  const counts = tally(docs);
  const total = docs.length;
  console.log(`\n${label} (${total})`);
  console.log(`  FULL: ${counts.FULL}  PARTIAL: ${counts.PARTIAL}  MISSING: ${counts.MISSING}`);
  const partial = docs.filter((d) => String(d.contentStatus).toUpperCase() === 'PARTIAL');
  if (partial.length) {
    console.log('  PARTIAL docs:');
    for (const doc of partial) {
      const blocker = (doc.blockers && doc.blockers[0]) || '—';
      console.log(`    - ${doc.registryId}: ${blocker}`);
    }
  }
  const missing = docs.filter((d) => String(d.contentStatus).toUpperCase() === 'MISSING');
  if (missing.length) {
    console.log('  MISSING docs:');
    for (const doc of missing) {
      console.log(`    - ${doc.registryId}`);
    }
  }
}

const customer = bundle.customerFilled || [];
const staff = bundle.staffFilled || [];
const info = bundle.information || [];
const all = [...customer, ...staff, ...info];
const grand = tally(all);

console.log('Hair TP document bundle audit');
console.log('cacheVersion:', bundle.cacheVersion || '(none)');
console.log(
  `\nTOTAL: ${all.length} docs — FULL ${grand.FULL} · PARTIAL ${grand.PARTIAL} · MISSING ${grand.MISSING}`
);

sectionRows('Kund fyller', customer);
sectionRows('Personal fyller', staff);
sectionRows('Auto / info', info);

const foto = all.find((d) => d.registryId === 'foto_samtycke');
const frisk = all.find((d) => d.registryId === 'friskfoers_tp');
console.log('\nP0 spot checks');
console.log(
  `  friskfoers_tp: ${frisk?.contentStatus || 'missing'} (${frisk?.meridiq?.questions?.length || 0} questions)`
);
console.log(`  foto_samtycke: ${foto?.contentStatus || 'missing'} (ORD-24 text gate)`);

process.exit(grand.MISSING > 0 ? 2 : 0);
