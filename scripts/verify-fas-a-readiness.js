#!/usr/bin/env node
'use strict';

/**
 * ORD-5 — Fas A.1 Readiness Gate (read-only v1.1 signals on Kunder cards).
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const REGISTRY = path.join(REPO, 'src/ops/ccoAutomationRegistry.js');
const RUNNER = path.join(REPO, 'src/ops/ccoAutomationRunner.js');
const TREATMENT_ROUTES = path.join(REPO, 'src/routes/ccoTreatmentAgreement.js');
const TEMPLATE_STORE = path.join(REPO, 'src/ops/ccoTemplateVersionApprovalStore.js');
const FAS_A = path.join(REPO, 'src/ops/ccoKunderFasAReadiness.js');
const STAFF = path.join(REPO, 'src/routes/ccoStaff.js');
const AUTO_ROUTES = path.join(REPO, 'src/routes/ccoAutomationRoutes.js');
const ENRICH = path.join(REPO, 'src/ops/ccoKunderEnrichment.js');
const BOOKING = path.join(REPO, 'src/ops/ccoKunderBookingEnrichment.js');

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`PASS: ${msg}`);
}

const V11_RULES = [
  'customer.missing_treatment_plan',
  'customer.missing_operation_day_insurance',
  'customer.missing_photo_consent',
];

const { RULES } = require('../src/ops/ccoAutomationRegistry');
const { evaluatePatientSignals } = require('../src/ops/ccoAutomationRunner');
const { computeReadyForTreatment } = require('../src/ops/ccoKunderFasAReadiness');

for (const id of V11_RULES) {
  const rule = RULES.find((r) => r.id === id);
  if (!rule?.v1Enabled) {
    fail(`${id} ska ha v1Enabled=true`);
  } else {
    pass(`${id} v1Enabled`);
  }
}

if (!fs.existsSync(FAS_A)) {
  fail('ccoKunderFasAReadiness.js saknas');
} else {
  pass('Fas A enrichment-modul finns');
}

const routesSrc = fs.readFileSync(TREATMENT_ROUTES, 'utf8');
if (!routesSrc.includes('template-version-approval')) {
  fail('ccoTreatmentAgreement saknar template-version-approval route (ORD-6)');
} else {
  pass('ORD-6 template-version-approval route');
}
if (!routesSrc.includes('send-for-sign/preview')) {
  fail('ccoTreatmentAgreement saknar send-for-sign/preview (ORD-6 staff UAT)');
} else {
  pass('ORD-6 send-for-sign/preview route');
}
if (routesSrc.includes('record-legal-review')) {
  fail('record-legal-review får inte finnas (väg A)');
} else {
  pass('ingen record-legal-review (väg A)');
}
if (!fs.existsSync(TEMPLATE_STORE)) {
  fail('ccoTemplateVersionApprovalStore.js saknas');
} else {
  pass('ccoTemplateVersionApprovalStore finns');
}

for (const [file, needle] of [
  [STAFF, 'loadFasAContextForPatients'],
  [AUTO_ROUTES, 'loadFasAContextForPatients'],
  [ENRICH, 'readyForTreatment'],
  [ENRICH, 'treatmentPlanStatus'],
  [BOOKING, 'readyForTreatment'],
  [RUNNER, 'TREATMENT_PLAN_OK'],
]) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes(needle)) {
    fail(`${path.basename(file)} saknar ${needle}`);
  } else {
    pass(`${path.basename(file)} → ${needle}`);
  }
}

const registrySrc = fs.readFileSync(REGISTRY, 'utf8');
if (/inactiveReason:\s*'Kräver/.test(registrySrc)) {
  fail('Registry ska inte ha v1.1 inactiveReason kvar på ORD-5-regler');
} else {
  pass('Registry utan v1.1 inactiveReason-stubbar');
}

process.env.ENABLE_AUTOMATION_RUNNER = 'true';

const planMissing = evaluatePatientSignals(
  { treatmentPlanStatus: 'draft', todayVisit: false, needsPhotoReview: false },
  { agreement: { bookable: true, coolingOff: { active: false } } }
);
const planSig = planMissing.signals.find((s) => s.ruleId === 'customer.missing_treatment_plan');
if (!planSig || planSig.status !== 'active') {
  fail('missing_treatment_plan ska vara active när status=draft');
} else {
  pass('runner: missing_treatment_plan active');
}

const opsDay = evaluatePatientSignals(
  {
    treatmentPlanStatus: 'accepted',
    todayVisit: true,
    fitnessSigned: false,
    needsPhotoReview: false,
    missingHealthDeclaration: false,
    missingForm: false,
    missingJournal: false,
    missingAgreement: false,
    hasJournalPhoto: false,
    photoConsent: { signed: false },
    readyForTreatment: false,
  },
  { agreement: { bookable: true, coolingOff: { active: false } } }
);
const opsSig = opsDay.signals.find((s) => s.ruleId === 'customer.missing_operation_day_insurance');
if (!opsSig || opsSig.status !== 'active') {
  fail('missing_operation_day_insurance ska vara active på todayVisit utan FF');
} else {
  pass('runner: missing_operation_day_insurance active');
}

const photo = evaluatePatientSignals(
  {
    treatmentPlanStatus: 'accepted',
    todayVisit: false,
    hasJournalPhoto: true,
    needsPhotoReview: true,
    photoConsent: { signed: false },
    missingHealthDeclaration: false,
    missingForm: false,
    missingJournal: false,
    missingAgreement: false,
    readyForTreatment: false,
  },
  { agreement: { bookable: true, coolingOff: { active: false } } }
);
const photoSig = photo.signals.find((s) => s.ruleId === 'customer.missing_photo_consent');
if (!photoSig || photoSig.status !== 'active') {
  fail('missing_photo_consent ska vara active med foto utan samtycke');
} else {
  pass('runner: missing_photo_consent active');
}

const readyReadout = {
  treatmentPlanStatus: 'accepted',
  todayVisit: true,
  fitnessSigned: true,
  hasJournalPhoto: true,
  photoConsent: { signed: true },
  missingHealthDeclaration: false,
  missingForm: false,
  missingJournal: false,
  missingAgreement: false,
  needsPhotoReview: true,
};
readyReadout.readyForTreatment = computeReadyForTreatment(readyReadout, {
  bookable: true,
  coolingOff: { active: false },
});
const readyEval = evaluatePatientSignals(readyReadout, {
  agreement: { bookable: true, coolingOff: { active: false } },
});
const readySig = readyEval.signals.find((s) => s.ruleId === 'customer.ready_for_treatment');
if (!readyReadout.readyForTreatment || !readySig || readySig.status !== 'active') {
  fail('ready_for_treatment ska vara active på komplett fixture');
} else {
  pass('runner: ready_for_treatment active');
}

const unsignedReady = computeReadyForTreatment(
  {
    treatmentPlanStatus: 'accepted',
    todayVisit: false,
    fitnessSigned: true,
    hasJournalPhoto: false,
    photoConsent: { signed: true },
    missingHealthDeclaration: false,
    missingForm: false,
    missingJournal: false,
    missingAgreement: false,
  },
  { bookable: false, coolingOff: { active: false } }
);
if (unsignedReady) {
  fail('ready_for_treatment får inte bli true utan signerad/bookable bundle');
} else {
  pass('runner: ready_for_treatment kräver signerad bundle');
}

if (failed) {
  console.error(`\n${failed} failure(s).`);
  process.exit(1);
}
console.log('\nAll Fas A.1 readiness checks passed.');
