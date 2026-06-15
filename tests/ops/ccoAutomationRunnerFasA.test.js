'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.ENABLE_AUTOMATION_RUNNER = 'true';

const { evaluatePatientSignals } = require('../../src/ops/ccoAutomationRunner');
const {
  computeReadyForTreatment,
  TREATMENT_PLAN_OK,
} = require('../../src/ops/ccoKunderFasAReadiness');

describe('ORD-5 Fas A automation signals', () => {
  it('TREATMENT_PLAN_OK innehåller created/sent/accepted', () => {
    assert.equal(TREATMENT_PLAN_OK.has('accepted'), true);
  });

  it('aktiverar missing_treatment_plan när plan-status saknas', () => {
    const result = evaluatePatientSignals({ treatmentPlanStatus: '' }, {});
    const sig = result.signals.find((s) => s.ruleId === 'customer.missing_treatment_plan');
    assert.equal(sig.status, 'active');
  });

  it('aktiverar ops-dag FF när todayVisit utan fitnessSigned', () => {
    const result = evaluatePatientSignals(
      { todayVisit: true, fitnessSigned: false, treatmentPlanStatus: 'accepted' },
      {}
    );
    const sig = result.signals.find((s) => s.ruleId === 'customer.missing_operation_day_insurance');
    assert.equal(sig.status, 'active');
  });

  it('aktiverar foto-samtycke vid journalbild utan signering', () => {
    const result = evaluatePatientSignals(
      {
        hasJournalPhoto: true,
        photoConsent: { signed: false },
        treatmentPlanStatus: 'accepted',
      },
      {}
    );
    const sig = result.signals.find((s) => s.ruleId === 'customer.missing_photo_consent');
    assert.equal(sig.status, 'active');
  });

  it('ready_for_treatment följer readout.readyForTreatment', () => {
    const readout = {
      treatmentPlanStatus: 'accepted',
      todayVisit: false,
      hasJournalPhoto: false,
      photoConsent: { signed: false },
      missingHealthDeclaration: false,
      missingForm: false,
      missingJournal: false,
      missingAgreement: false,
    };
    readout.readyForTreatment = computeReadyForTreatment(readout, {
      bookable: true,
      coolingOff: { active: false },
    });
    const result = evaluatePatientSignals(readout, {
      agreement: { bookable: true, coolingOff: { active: false } },
    });
    const sig = result.signals.find((s) => s.ruleId === 'customer.ready_for_treatment');
    assert.equal(readout.readyForTreatment, true);
    assert.equal(sig.status, 'active');
  });

  it('ready_for_treatment kräver signerad/bookable bundle även om missingAgreement=false', () => {
    const readout = {
      treatmentPlanStatus: 'accepted',
      todayVisit: false,
      hasJournalPhoto: false,
      photoConsent: { signed: true },
      missingHealthDeclaration: false,
      missingForm: false,
      missingJournal: false,
      missingAgreement: false,
    };
    assert.equal(
      computeReadyForTreatment(readout, {
        bookable: false,
        coolingOff: { active: false },
      }),
      false
    );
  });
});
