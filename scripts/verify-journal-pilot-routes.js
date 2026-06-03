#!/usr/bin/env node
'use strict';

/**
 * verify-journal-pilot-routes.js — regression guard for presentation-critical mounts
 *
 * Statically verifies server.js still declares journal-feed, journal-timeline,
 * cco-forms, and cco-journal-quick routes. Intended to run pre-commit and
 * after every deploy (via post-deploy-presentation-gate).
 *
 *   node scripts/verify-journal-pilot-routes.js
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const SERVER = path.join(REPO, 'server.js');

const REQUIRED = [
  {
    label: 'journal-feed route',
    pattern: /['"]\/api\/v1\/cco-customers\/:id\/journal-feed['"]/,
    min: 1,
  },
  {
    label: 'journal-timeline route',
    pattern: /['"]\/api\/v1\/cco-customers\/:id\/journal-timeline['"]/,
    min: 1,
  },
  {
    label: 'forms missing route',
    pattern: /['"]\/api\/v1\/cco-forms\/patient\/:patientId\/missing['"]/,
    min: 1,
  },
  {
    label: 'forms submit route',
    pattern: /['"]\/api\/v1\/cco-forms\/submit['"]/,
    min: 1,
  },
  {
    label: 'journal-quick entry route',
    pattern: /['"]\/api\/v1\/cco-journal-quick\/entry['"]/,
    min: 1,
  },
  {
    label: 'journal-quick sign route',
    pattern: /['"]\/api\/v1\/cco-journal-quick\/entry\/sign['"]/,
    min: 1,
  },
  {
    label: 'journal-quick correction route',
    pattern: /['"]\/api\/v1\/cco-journal-quick\/entry\/correction['"]/,
    min: 1,
  },
  {
    label: 'journal-feed handler comment',
    pattern: /unified journal-view|journal-feed — unified/,
    min: 1,
  },
  {
    label: 'cco-forms mount log',
    pattern: /\[cco-forms\]/,
    min: 1,
  },
  {
    label: 'cco-journal-quick mount log',
    pattern: /\[cco-journal-quick\]/,
    min: 1,
  },
  {
    label: 'ccoAssetNaming dependency (feed/timeline labels)',
    pattern: /ccoAssetNaming\/assetDisplayLabel/,
    min: 1,
  },
  {
    label: 'photo-review router mount',
    pattern: /createCcoPhotoReviewRouter/,
    min: 1,
  },
  {
    label: 'photo-review write gated by config',
    pattern: /writeEnabled:\s*photoWriteEnabled/,
    min: 1,
  },
];

const STATIC_PAGES = [
  'public/cco-personal-start.html',
  'public/kunder.html',
  'public/journal-feed-demo.html',
  'public/cco-ops-workbench.html',
];

function main() {
  if (!fs.existsSync(SERVER)) {
    console.error('FAIL  server.js saknas');
    process.exit(1);
  }

  const src = fs.readFileSync(SERVER, 'utf8');
  let failed = 0;

  console.log('=== verify-journal-pilot-routes ===');
  console.log('File:', SERVER);
  console.log('');

  for (const req of REQUIRED) {
    const found = (src.match(req.pattern) || []).length;
    const ok = found >= req.min;
    if (!ok) failed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${req.label} (${found}/${req.min})`);
  }

  console.log('\n--- presentation static pages ---');
  for (const rel of STATIC_PAGES) {
    const abs = path.join(REPO, rel);
    const ok = fs.existsSync(abs);
    if (!ok) failed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${rel}`);
  }

  console.log(failed === 0 ? '\n✓ ALL PASS' : `\n✗ FAILURES: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
