'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  assertOperationDayJournalAllowed,
  patientFitnessSigned,
} = require('../../src/ops/ccoOperationDayGate');
const { buildSignedBundleAgreementUpdate } = require('../../src/ops/ccoTreatmentAgreementBundle');

describe('ccoOperationDayGate', () => {
  it('släpper igenom när ej operationsdag', () => {
    const gate = assertOperationDayJournalAllowed({
      journalType: 'tp_treatment',
      todayVisit: false,
      fitnessSigned: false,
    });
    assert.equal(gate.allowed, true);
  });

  it('blockerar tp-journal på operationsdag utan FC', () => {
    const gate = assertOperationDayJournalAllowed({
      journalType: 'tp_treatment',
      todayVisit: true,
      fitnessSigned: false,
    });
    assert.equal(gate.allowed, false);
    assert.equal(gate.reason, 'operation_day_fitness_required');
  });

  it('släpper igenom fitness_certificate på operationsdag', () => {
    const gate = assertOperationDayJournalAllowed({
      journalType: 'fitness_certificate',
      todayVisit: true,
      fitnessSigned: false,
    });
    assert.equal(gate.allowed, true);
  });

  it('patientFitnessSigned läser patient.fitnessCertificate', () => {
    assert.equal(patientFitnessSigned({ fitnessCertificate: { signedAt: '2026-05-20' } }), true);
    assert.equal(patientFitnessSigned({ missingFitnessCertificate: true }), false);
  });
});

describe('buildSignedBundleAgreementUpdate', () => {
  it('sätter bookable, bundleStatus signed och consent atomiskt', () => {
    const updated = buildSignedBundleAgreementUpdate(
      {
        agreementStatus: 'sent',
        treatmentType: 'fue',
        consent: {},
      },
      { signer: 'Anna', signedAt: '2026-05-20T10:00:00.000Z', actorUserId: 'staff-1' }
    );
    assert.equal(updated.agreementStatus, 'bookable');
    assert.equal(updated.bundleStatus, 'signed');
    assert.equal(updated.consent.signed, true);
    assert.equal(updated.consent.signedBy, 'Anna');
    assert.ok(Array.isArray(updated.events) && updated.events.length === 1);
  });
});
