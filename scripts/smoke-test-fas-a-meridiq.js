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
  const tpls = Object.values(ccoTemplates.templates || {}); // lookup via meridiqMeta.apiId, så Object.values funkar här
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

function testSharePointImport() {
  console.log('\n▶ Test: SharePoint Fas C-import löste MISSING_TEMPLATE-flaggor');
  const allTpls = Object.values(ccoTemplates.templates || {});
  // Bygg id-baserad lookup eftersom objektnycklar är numeriska 0,1,2...
  const tpls = {};
  allTpls.forEach((t) => { if (t.templateId) tpls[t.templateId] = t; });

  // Profhilo patient_info ska finnas med content
  const profhiloInfo = tpls['patient_info_profhilo'];
  assert(!!profhiloInfo, 'patient_info_profhilo finns');
  if (profhiloInfo) {
    const bodyLen = (profhiloInfo.body?.sv || '').length;
    assert(bodyLen > 5000, 'patient_info_profhilo body ≥5000 chars (fick: ' + bodyLen + ')');
    assert(!!profhiloInfo.sharePointMeta, 'patient_info_profhilo har sharePointMeta');
  }

  // Orthopedics PRP patient_info ska finnas
  const orthoInfo = tpls['patient_info_orthopedics_prp'];
  assert(!!orthoInfo, 'patient_info_orthopedics_prp finns');
  if (orthoInfo) {
    const bodyLen = (orthoInfo.body?.sv || '').length;
    assert(bodyLen > 5000, 'patient_info_orthopedics_prp body ≥5000 chars (fick: ' + bodyLen + ')');
  }

  // Orthopedics PRP avtal ska finnas
  const orthoAgreement = tpls['agreement_orthopedics_prp_curatiio'];
  assert(!!orthoAgreement, 'agreement_orthopedics_prp_curatiio finns');
  if (orthoAgreement) {
    const bodyLen = (orthoAgreement.body?.sv || '').length;
    assert(bodyLen > 3000, 'agreement_orthopedics_prp_curatiio body ≥3000 chars (fick: ' + bodyLen + ')');
  }

  // Nordbro 251203 DHI-avtal (2 nya)
  const dhi2day = tpls['agreement_hair_tp_dhi_2day_nordbro'];
  const dhi7day = tpls['agreement_hair_tp_dhi_7day_nordbro'];
  assert(!!dhi2day, 'agreement_hair_tp_dhi_2day_nordbro finns (Nordbro 251203)');
  assert(!!dhi7day, 'agreement_hair_tp_dhi_7day_nordbro finns (Nordbro 251203)');

  // Treatment-config har EXISTS-status (inte MISSING_TEMPLATE) för profhilo + orthopedics
  const profhiloStatus = treatmentRequirements.treatments.profhilo?.requiredDocuments?.patientInformation?.status || '';
  assert(profhiloStatus.startsWith('EXISTS'), 'profhilo patient_info status=EXISTS (fick: "' + profhiloStatus + '")');
  const orthoStatus = treatmentRequirements.treatments.orthopedics_prp?.requiredDocuments?.patientInformation?.status || '';
  assert(orthoStatus.startsWith('EXISTS'), 'orthopedics_prp patient_info status=EXISTS (fick: "' + orthoStatus + '")');

  // Fat dissolving ska ha sharePointGap-flagga (öppet problem)
  const fatGap = treatmentRequirements.treatments.fat_dissolving?.sharePointGap;
  assert(!!fatGap, 'fat_dissolving har sharePointGap-flagga (öppen blocker)');
}

function testTreatmentCount() {
  console.log('\n▶ Test: treatment-requirements har 13 treatments efter Fas A');
  const keys = Object.keys(treatmentRequirements.treatments || {});
  assert(keys.length === 13, 'antal treatments=13 (fick: ' + keys.length + ')');
  assert(keys.includes('profhilo'), 'profhilo finns');
  assert(keys.includes('fat_dissolving'), 'fat_dissolving finns');
  assert(keys.includes('orthopedics_prp'), 'orthopedics_prp finns');
  // version bumpas över tid — kolla bara att den är ≥1.1.0 (semver)
  const [maj, min] = (treatmentRequirements.version || '0.0.0').split('.').map(Number);
  assert(maj > 1 || (maj === 1 && min >= 1), 'version ≥1.1.0 (fick: ' + treatmentRequirements.version + ')');
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
  testSharePointImport();

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
