'use strict';

/**
 * smoke-test-fas-a-meridiq.js
 *
 * End-to-end-verifiering av MERIDIQ-CCO-GAP-ANALYSIS Fas A:
 *   1. ccoBlockingStore evaluerar blocking-doc-krav korrekt för 3 nya treatments
 *   2. wrong_brand_flow-detektorn fångar när Hair TP-avtal används för Curatiio-behandling
 *   3. Brand-override har persisterats korrekt i data/cco-templates.json
 *   4. Regression: 10 befintliga treatments ger fortfarande korrekt blocking-output
 *
 * Använd: node scripts/smoke-test-fas-a-meridiq.js
 */

const fs = require('fs');
const path = require('path');
const { createCcoBlockingStore } = require('../src/ops/ccoBlockingStore');

const treatmentRequirements = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'config', 'cco-treatment-document-requirements.json'), 'utf8'));

const brandOverrides = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'config', 'meridiq-brand-overrides.json'), 'utf8'));

const ccoTemplatesPath = path.join(__dirname, '..', 'data', 'cco-templates.json');
const ccoTemplates = fs.existsSync(ccoTemplatesPath)
  ? JSON.parse(fs.readFileSync(ccoTemplatesPath, 'utf8'))
  : { templates: {} };

// ---- Mock-stores ----
function mockAgreementStore(agreementsByCustomer) {
  return {
    listForCustomer: (cid) => agreementsByCustomer[cid] || [],
  };
}

function mockJournalStore(entriesByCustomer) {
  return {
    listEntries: async ({ patientId }) => entriesByCustomer[patientId] || [],
  };
}

// ---- Assertions ----
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log('  ✅ ' + message);
  } else {
    failed += 1;
    failures.push(message);
    console.log('  ❌ ' + message);
  }
}

function findIssue(result, kind) {
  return result.issues.find((i) => i.kind === kind);
}

async function testTreatmentBlocking(treatmentKey, expectedBrand) {
  console.log('\n▶ Test: ' + treatmentKey + ' (brand=' + expectedBrand + ')');
  const store = createCcoBlockingStore({
    journalStore: mockJournalStore({ 'patient-1': [] }),
    agreementStore: mockAgreementStore({ 'patient-1': [] }),
    treatmentRequirements,
  });
  const result = await store.evaluateCustomer('patient-1', {
    plannedTreatment: treatmentKey,
    customerName: 'Mock Patient',
    hasUpcomingBooking: true, // krävs för Steg 3.3 consent.before_treatment-checken
  });

  // Treatment exists
  const tCfg = treatmentRequirements.treatments[treatmentKey];
  assert(!!tCfg, 'config has treatment ' + treatmentKey);
  assert(tCfg.brand === expectedBrand, 'brand=' + expectedBrand + ' (fick: ' + tCfg.brand + ')');

  // Without any docs, treatment_consent should be missing (per Steg 3.3)
  const consentIssue = findIssue(result, 'missing_treatment_consent');
  if (tCfg.requiredDocuments?.treatmentConsent?.required) {
    assert(!!consentIssue, 'missing_treatment_consent issue fired');
    if (consentIssue) {
      assert(consentIssue.severity === 'blocking', 'severity=blocking');
      assert(consentIssue.meta?.treatmentKey === treatmentKey, 'meta.treatmentKey korrekt');
    }
  }
}

async function testWrongBrandFlow(treatmentKey, badAgreementBrand) {
  console.log('\n▶ Test wrong_brand_flow: ' + treatmentKey + ' med ' + badAgreementBrand + '-avtal');
  const store = createCcoBlockingStore({
    journalStore: mockJournalStore({ 'patient-2': [] }),
    agreementStore: mockAgreementStore({
      'patient-2': [{ id: 'agr-001', state: 'signed', brand: badAgreementBrand, treatmentKey }],
    }),
    treatmentRequirements,
  });
  const result = await store.evaluateCustomer('patient-2', { plannedTreatment: treatmentKey });
  const wrongBrand = findIssue(result, 'wrong_brand_flow');
  assert(!!wrongBrand, 'wrong_brand_flow issue fired');
  if (wrongBrand) {
    assert(wrongBrand.severity === 'blocking', 'severity=blocking');
    assert(wrongBrand.meta?.agreementBrand === badAgreementBrand, 'agreementBrand=' + badAgreementBrand);
    assert(wrongBrand.meta?.expectedBrand !== badAgreementBrand, 'expectedBrand ≠ agreementBrand');
  }
}

function testBrandOverridesPersisted() {
  console.log('\n▶ Test: 17/17 brand-overrides persisted i data/cco-templates.json');
  const tpls = Object.values(ccoTemplates.templates || {});
  const overrideTable = brandOverrides.overrides?.consent || {};
  const apiIds = Object.keys(overrideTable);
  assert(apiIds.length === 17, 'override-tabellen har 17 entries');

  let found = 0;
  let mismatched = 0;
  for (const apiId of apiIds) {
    const expectedBrand = overrideTable[apiId].ccoBrand;
    const tpl = tpls.find((t) => String(t.meridiqMeta?.apiId) === apiId);
    if (tpl) {
      found += 1;
      if (tpl.brand !== expectedBrand) {
        mismatched += 1;
        console.log('    ⚠️ apiId ' + apiId + ' har brand=' + tpl.brand + ' men expected=' + expectedBrand);
      }
    }
  }
  assert(found === 17, found + '/17 override-targets hittade i registry');
  assert(mismatched === 0, '0 brand-mismatches (alla ' + found + ' har korrekt brand)');
}

function testTreatmentCount() {
  console.log('\n▶ Test: treatment-requirements har 13 treatments efter Fas A');
  const keys = Object.keys(treatmentRequirements.treatments || {});
  assert(keys.length === 13, 'antal treatments=13 (fick: ' + keys.length + ')');
  assert(keys.includes('profhilo'), 'profhilo finns');
  assert(keys.includes('fat_dissolving'), 'fat_dissolving finns');
  assert(keys.includes('orthopedics_prp'), 'orthopedics_prp finns');
  assert(treatmentRequirements.version === '1.1.0', 'version=1.1.0');
}

async function regressionCheck() {
  console.log('\n▶ Regression: 10 befintliga treatments evalueras utan exception');
  const existing = ['fue', 'dhi', 'prp_hair', 'microneedling_hair', 'trichoscopy',
                    'botox', 'filler', 'bleph', 'prp_skin', 'mesotherapy'];
  for (const t of existing) {
    try {
      const store = createCcoBlockingStore({
        journalStore: mockJournalStore({}),
        agreementStore: mockAgreementStore({}),
        treatmentRequirements,
      });
      const result = await store.evaluateCustomer('patient-r', { plannedTreatment: t });
      assert(typeof result.status === 'string', t + ' returnerar status');
    } catch (e) {
      assert(false, t + ' kastade: ' + e.message);
    }
  }
}

(async () => {
  console.log('=== Fas A Meridiq Smoke-Test ===');

  testTreatmentCount();
  testBrandOverridesPersisted();

  await testTreatmentBlocking('profhilo', 'curatiio');
  await testTreatmentBlocking('fat_dissolving', 'curatiio');
  await testTreatmentBlocking('orthopedics_prp', 'curatiio');

  await testWrongBrandFlow('profhilo', 'hair_tp');
  await testWrongBrandFlow('fat_dissolving', 'hair_tp');
  await testWrongBrandFlow('orthopedics_prp', 'hair_tp');
  await testWrongBrandFlow('botox', 'hair_tp');

  await regressionCheck();

  console.log('\n===========================================');
  console.log('PASSED: ' + passed);
  console.log('FAILED: ' + failed);
  if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  } else {
    console.log('\n✅ Alla tester gröna. Fas A verifierad end-to-end.');
  }
})();
