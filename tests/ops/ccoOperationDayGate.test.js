'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  assertOperationDayJournalAllowed,
  assertOperationDayJournalAllowedForPatient,
  OPS_BLOCKED_JOURNAL_TYPES,
  OPS_JOURNAL_TYPE_DECISIONS,
  VANTAR_PA_BESLUT,
  patientFitnessSigned,
  resolveFitnessSignedFromJournal,
} = require('../../src/ops/ccoOperationDayGate');
const { JOURNAL_TYPES } = require('../../src/ops/ccoJournalStore');
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

  it('blockerar fortsatt HT/TP men aldrig PRP för saknad FF på operationsdag', () => {
    assert.deepEqual(Array.from(OPS_BLOCKED_JOURNAL_TYPES), ['tp_treatment']);

    const hairTransplant = assertOperationDayJournalAllowed({
      journalType: 'tp_treatment',
      todayVisit: true,
      fitnessSigned: false,
    });
    assert.equal(hairTransplant.allowed, false);
    assert.equal(hairTransplant.reason, 'operation_day_fitness_required');

    const prp = assertOperationDayJournalAllowed({
      journalType: 'prp_treatment',
      todayVisit: true,
      fitnessSigned: false,
    });
    assert.equal(prp.allowed, true);
  });

  it('släpper igenom PRP-journal utan FF via patient-context och frågar inte efter FF', async () => {
    let journalQueried = false;
    let bookingQueried = false;
    const gate = await assertOperationDayJournalAllowedForPatient({
      journalType: 'prp_treatment',
      tenantId: 'hair-tp-clinic',
      patientId: 'patient-prp',
      patient: { todayVisit: true },
      journalStore: {
        async listEntries() {
          journalQueried = true;
          return [];
        },
      },
      bookingStore: {
        async listCases() {
          bookingQueried = true;
          return [];
        },
      },
    });
    assert.equal(gate.allowed, true);
    assert.equal(journalQueried, false);
    assert.equal(bookingQueried, false);
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

  it('resolveFitnessSignedFromJournal returnerar true när journal har signerad fitness_certificate', async () => {
    const journalStore = {
      async listEntries({ journalType }) {
        if (journalType !== 'fitness_certificate') return [];
        return [
          {
            entryId: 'fc-1',
            journalType: 'fitness_certificate',
            status: 'signed',
            signedAt: '2026-06-14T09:00:00.000Z',
          },
        ];
      },
    };
    const result = await resolveFitnessSignedFromJournal({
      journalStore,
      tenantId: 'hair-tp-clinic',
      patientId: 'patient-1',
      patient: {},
    });
    assert.equal(result, true);
  });

  it('resolveFitnessSignedFromJournal returnerar false när inga signerade poster finns', async () => {
    const journalStore = {
      async listEntries() {
        return [{ entryId: 'fc-draft', journalType: 'fitness_certificate', status: 'draft' }];
      },
    };
    const result = await resolveFitnessSignedFromJournal({
      journalStore,
      tenantId: 'hair-tp-clinic',
      patientId: 'patient-1',
      patient: {},
    });
    assert.equal(result, false);
  });

  it('resolveFitnessSignedFromJournal kortsluter via patientCard när fitnessSigned=true', async () => {
    let queryCalled = false;
    const journalStore = {
      async listEntries() {
        queryCalled = true;
        return [];
      },
    };
    const result = await resolveFitnessSignedFromJournal({
      journalStore,
      tenantId: 'hair-tp-clinic',
      patientId: 'patient-1',
      patient: { fitnessSigned: true },
    });
    assert.equal(result, true);
    assert.equal(queryCalled, false);
  });

  it('varje journaltyp är beslutad eller står på väntelistan (ORD-163)', () => {
    const saknade = JOURNAL_TYPES.filter(
      (type) => !(type in OPS_JOURNAL_TYPE_DECISIONS) && !(type in VANTAR_PA_BESLUT)
    );
    assert.deepEqual(
      saknade,
      [],
      'En journaltyp saknar ställningstagande — lägg till den i OPS_JOURNAL_TYPE_DECISIONS ' +
        'eller i VANTAR_PA_BESLUT: ' +
        saknade.join(', ')
    );
  });

  it('väntelistan bär datum så den inte kan bli en soptunna (ORD-163)', () => {
    const odaterade = Object.entries(VANTAR_PA_BESLUT)
      .filter(([, v]) => !v || !v.fragad)
      .map(([key]) => key);
    assert.deepEqual(
      odaterade,
      [],
      'Väntelisteposter utan datum (fragad) kan inte spåras — fyll i datum: ' + odaterade.join(', ')
    );
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
