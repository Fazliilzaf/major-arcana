#!/usr/bin/env node
'use strict';

/**
 * ORD-49 Fas 1 — ID ready-pill wiring (visibility only, no hard gate).
 * Run: npm run verify:ord49-id-ready-wiring
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const REFERENS = path.join(REPO, 'public/major-arcana-preview/app/cco-kundkort-referens.js');
const FAS_A = path.join(REPO, 'src/ops/ccoKunderFasAReadiness.js');
const PATIENT_MASTER = path.join(REPO, 'src/routes/ccoPatientMaster.js');
const PKG = path.join(REPO, 'package.json');

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`PASS: ${msg}`);
}

if (!fs.existsSync(REFERENS)) {
  fail('cco-kundkort-referens.js saknas');
} else {
  const referensSrc = fs.readFileSync(REFERENS, 'utf8');
  if (!/identityStatus|identityVerified/.test(referensSrc)) {
    fail('referens saknar identityStatus/identityVerified i resolveOrd48ReadyState');
  } else {
    pass('referens läser identityStatus/identityVerified');
  }
  if (!/readyPill\('ID'/.test(referensSrc)) {
    fail('buildOrd48ReadyBlock saknar ID-pill');
  } else {
    pass('buildOrd48ReadyBlock har ID-pill');
  }
  if (!/resolveOrd48IdState|idState|idHint/.test(referensSrc)) {
    fail('referens saknar idState/idHint mapping');
  } else {
    pass('referens har idState/idHint mapping');
  }
  if (/blockers\.push\([^)]*id/i.test(referensSrc)) {
    fail('ID får inte läggas i blockers (Fas 1)');
  } else {
    pass('ID ingår inte i blockers');
  }
}

if (!fs.existsSync(FAS_A)) {
  fail('ccoKunderFasAReadiness.js saknas');
} else {
  const fasSrc = fs.readFileSync(FAS_A, 'utf8');
  if (!/createPatientIdentityStore/.test(fasSrc)) {
    fail('loadFasAContextForPatients saknar createPatientIdentityStore');
  } else {
    pass('loadFasAContextForPatients laddar identity store');
  }
  if (!/getPatientVerificationStatus/.test(fasSrc)) {
    fail('loadFasAContextForPatients saknar getPatientVerificationStatus');
  } else {
    pass('loadFasAContextForPatients anropar getPatientVerificationStatus');
  }
  for (const field of [
    'identityStatus',
    'identityVerified',
    'identityMethod',
    'identityVerifiedAt',
  ]) {
    if (!new RegExp(`safe\\.${field}`).test(fasSrc)) {
      fail(`applyFasAReadoutFields saknar ${field}`);
    } else {
      pass(`applyFasAReadoutFields sätter ${field}`);
    }
  }
  const computeBlock = fasSrc.match(/function computeReadyForTreatment[\s\S]*?^}/m);
  if (computeBlock && /identity/i.test(computeBlock[0])) {
    fail('computeReadyForTreatment får inte inkludera ID (Fas 2)');
  } else {
    pass('computeReadyForTreatment inkluderar inte ID-gate');
  }
}

if (!fs.existsSync(PATIENT_MASTER)) {
  fail('ccoPatientMaster.js saknas');
} else {
  const masterSrc = fs.readFileSync(PATIENT_MASTER, 'utf8');
  if (!/loadFasAContextForPatients/.test(masterSrc) || !/applyFasAReadoutFields/.test(masterSrc)) {
    fail('buildPatientPayload saknar Fas A identity wiring');
  } else {
    pass('buildPatientPayload wire:ar Fas A readout');
  }
}

if (!fs.existsSync(PKG)) {
  fail('package.json saknas');
} else {
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  if (!pkg.scripts?.['verify:ord49-id-ready-wiring']) {
    fail('package.json saknar verify:ord49-id-ready-wiring script');
  } else {
    pass('npm script verify:ord49-id-ready-wiring finns');
  }
}

if (failed) {
  console.error(`\nverify-ord49-id-ready-wiring: ${failed} failed`);
  process.exit(1);
}
console.log('\nverify-ord49-id-ready-wiring: all checks PASS');
