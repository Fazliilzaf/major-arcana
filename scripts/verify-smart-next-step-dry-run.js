#!/usr/bin/env node
'use strict';

/**
 * B-sprint gate: Automation Registry dry-run (read-only).
 *   ENABLE_AUTOMATION_RUNNER=true node scripts/verify-smart-next-step-dry-run.js
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const ROUTES = path.join(REPO, 'src/routes/ccoAutomationRoutes.js');
const STAFF = path.join(REPO, 'src/routes/ccoStaff.js');
const SMART_UI = path.join(REPO, 'public/cco-kunder-smart-next-step.js');
const KUNDER_HTML = path.join(REPO, 'public/kunder.html');
const REAL_JS = path.join(REPO, 'public/cco-kunder-real.js');

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`PASS: ${msg}`);
}

const { RULES, getCatalog } = require('../src/ops/ccoAutomationRegistry');
const { evaluatePatientSignals } = require('../src/ops/ccoAutomationRunner');

if (RULES.length !== 10) {
  fail(`Registry ska ha 10 regler, har ${RULES.length}`);
} else {
  pass('Registry har 10 V2-signaler');
}

for (const rule of RULES) {
  if (!rule.what || !rule.why || !rule.next) {
    fail(`${rule.id} saknar what/why/next`);
  }
}

const catalog = getCatalog();
if (!catalog.dryRun) {
  fail('catalog.dryRun ska vara true');
} else {
  pass('catalog markerad dry-run');
}

const routesSrc = fs.readFileSync(ROUTES, 'utf8');
if (/router\.post\s*\(/.test(routesSrc)) {
  fail('ccoAutomationRoutes får inte ha POST');
} else {
  pass('automation routes är GET-only');
}

for (const pathPart of [
  '/cco/automation/catalog',
  '/cco/automation/evaluate',
  '/cco/automation/worklists',
]) {
  if (!routesSrc.includes(pathPart)) {
    fail(`saknar route ${pathPart}`);
  } else {
    pass(`route ${pathPart}`);
  }
}

const staffSrc = fs.readFileSync(STAFF, 'utf8');
if (!staffSrc.includes('includeAutomation')) {
  fail('ccoStaff saknar includeAutomation');
} else {
  pass('customers-shell stödjer includeAutomation');
}
if (!staffSrc.includes('attachAutomationRoutes')) {
  fail('ccoStaff monterar inte attachAutomationRoutes');
} else {
  pass('ccoStaff monterar automation routes');
}

if (!fs.existsSync(SMART_UI)) {
  fail('cco-kunder-smart-next-step.js saknas');
} else {
  pass('Smart nästa steg UI-modul finns');
}

const kunderHtml = fs.readFileSync(KUNDER_HTML, 'utf8');
const realJs = fs.readFileSync(REAL_JS, 'utf8');
if (!kunderHtml.includes('cco-kunder-smart-next-step.js')) {
  fail('kunder.html laddar inte smart-next-step UI');
} else {
  pass('kunder.html laddar smart-next-step UI');
}
if (!realJs.includes('includeAutomation')) {
  fail('cco-kunder-real.js saknar includeAutomation=1');
} else {
  pass('cco-kunder-real.js begär includeAutomation');
}
if (!realJs.includes('CcoKunderSmartNextStep')) {
  fail('cco-kunder-real.js använder inte CcoKunderSmartNextStep');
} else {
  pass('cco-kunder-real.js integrerar Smart nästa steg');
}

process.env.ENABLE_AUTOMATION_RUNNER = 'true';
const sample = evaluatePatientSignals(
  {
    patientId: 'p-test',
    missingHealthDeclaration: true,
    missingJournal: true,
    missingAgreement: false,
    hasJournal: false,
    needsPhotoReview: false,
  },
  { agreement: null }
);
if (!sample.enabled || !Array.isArray(sample.signals) || sample.signals.length !== 10) {
  fail('evaluatePatientSignals returnerar inte 10 signaler');
} else {
  pass('runner evaluatePatientSignals (10 signaler)');
}
const hd = sample.signals.find((s) => s.ruleId === 'customer.missing_health_declaration');
if (!hd || hd.status !== 'active') {
  fail('missing_health_declaration ska vara active på test-readout');
} else {
  pass('HD-signal active på fixture');
}

if (failed) {
  console.error(`\n${failed} failure(s).`);
  process.exit(1);
}
console.log('\nAll smart-next-step dry-run checks passed.');
