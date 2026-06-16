const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  assertTreatmentBookingAllowed,
  checkTreatmentBookingGate,
  requiresTreatmentAgreement,
  treatmentServiceIds,
} = require('../../src/ops/ccoTreatmentBookingGate');
const { createCcoTreatmentAgreementStore } = require('../../src/ops/ccoTreatmentAgreementStore');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createPatientIdentityStore } = require('../../src/ops/patientIdentityVerification');

test('requiresTreatmentAgreement skiljer konsultation från behandling', () => {
  assert.equal(requiresTreatmentAgreement('consultation-physical'), false);
  assert.equal(requiresTreatmentAgreement('followup-transplant'), false);
  assert.equal(requiresTreatmentAgreement('fue'), true);
  assert.equal(requiresTreatmentAgreement('dhi'), true);
});

test('checkTreatmentBookingGate släpper igenom konsultation utan avtal', async () => {
  const gate = await checkTreatmentBookingGate({
    body: { serviceId: 'consultation-physical' },
  });
  assert.equal(gate.allowed, true);
  assert.equal(gate.gated, false);
});

test('checkTreatmentBookingGate blockerar behandling utan signerat avtal', async () => {
  const prevGate = process.env.CCO_ID_VERIFICATION_HARD_GATE;
  process.env.CCO_ID_VERIFICATION_HARD_GATE = 'false';
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-booking-gate-'));
  try {
    const agreementStore = await createCcoTreatmentAgreementStore({
      filePath: path.join(tempDir, 'agreements.json'),
    });
    const patientStore = await createCcoPatientMasterStore({
      filePath: path.join(tempDir, 'patients.json'),
    });
    await patientStore.upsertPatient({
      tenantId: 'hair-tp-clinic',
      id: 'patient-1',
      displayName: 'Test Kund',
      personnummer: '19900101-1234',
      primaryEmail: 'test@example.com',
      emails: ['test@example.com'],
    });

    const blocked = await checkTreatmentBookingGate({
      treatmentAgreementStore: agreementStore,
      patientMasterStore: patientStore,
      tenantId: 'hair-tp-clinic',
      customerEmail: 'test@example.com',
      body: { serviceId: 'fue' },
    });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'treatment_agreement_not_bookable');

    await agreementStore.upsertAgreement({
      tenantId: 'hair-tp-clinic',
      patientId: 'patient-1',
      agreementStatus: 'bookable',
      bundleStatus: 'signed',
      signedAt: new Date().toISOString(),
      consent: {
        signed: true,
        signedAt: new Date().toISOString(),
        signedBy: 'Test Kund',
      },
    });

    const allowed = await checkTreatmentBookingGate({
      treatmentAgreementStore: agreementStore,
      patientMasterStore: patientStore,
      tenantId: 'hair-tp-clinic',
      customerEmail: 'test@example.com',
      body: { selectedSlots: [{ serviceId: 'fue' }] },
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.patientId, 'patient-1');
    assert.equal(treatmentServiceIds({ selectedSlots: [{ serviceId: 'fue' }] }).join(','), 'fue');
  } finally {
    if (prevGate === undefined) delete process.env.CCO_ID_VERIFICATION_HARD_GATE;
    else process.env.CCO_ID_VERIFICATION_HARD_GATE = prevGate;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('behandlingsbokning på operationsdag ger 409 utan FC även när bundle är signerad', async () => {
  const treatmentAgreementStore = {
    async getPatientAgreement() {
      return {
        agreementStatus: 'bookable',
        bundleStatus: 'signed',
        signedAt: '2026-06-14T10:00:00.000Z',
        consent: {
          signed: true,
          signedAt: '2026-06-14T10:00:00.000Z',
          signedBy: 'Test Kund',
        },
      };
    },
  };
  const patientMasterStore = {
    async findPatientByEmail() {
      return { id: 'patient-op' };
    },
    async getPatient() {
      return {
        id: 'patient-op',
        primaryEmail: 'op@example.com',
        todayVisit: true,
      };
    },
  };

  await assert.rejects(
    () =>
      assertTreatmentBookingAllowed({
        treatmentAgreementStore,
        patientMasterStore,
        tenantId: 'hair-tp-clinic',
        customerEmail: 'op@example.com',
        body: { serviceId: 'fue' },
      }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.metadata?.code, 'operation_day_fitness_required');
      return true;
    }
  );
});

test('behandlingsbokning ger 409 identity_verification_required när bundle OK men ID overifierat', async () => {
  const prevGate = process.env.CCO_ID_VERIFICATION_HARD_GATE;
  process.env.CCO_ID_VERIFICATION_HARD_GATE = 'true';
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-booking-id-gate-'));
  try {
    const agreementStore = await createCcoTreatmentAgreementStore({
      filePath: path.join(tempDir, 'agreements.json'),
    });
    const patientStore = await createCcoPatientMasterStore({
      filePath: path.join(tempDir, 'patients.json'),
    });
    const identityStore = createPatientIdentityStore({
      filePath: path.join(tempDir, 'identity.json'),
    });
    await identityStore.load();

    await patientStore.upsertPatient({
      tenantId: 'hair-tp-clinic',
      id: 'patient-id-gate',
      displayName: 'ID Gate Test',
      personnummer: '19900101-5678',
      primaryEmail: 'idgate@example.com',
      emails: ['idgate@example.com'],
    });

    await agreementStore.upsertAgreement({
      tenantId: 'hair-tp-clinic',
      patientId: 'patient-id-gate',
      agreementStatus: 'bookable',
      bundleStatus: 'signed',
      signedAt: new Date().toISOString(),
      consent: {
        signed: true,
        signedAt: new Date().toISOString(),
        signedBy: 'ID Gate Test',
      },
    });

    const blocked = await checkTreatmentBookingGate({
      treatmentAgreementStore: agreementStore,
      patientMasterStore: patientStore,
      patientIdentityStore: identityStore,
      tenantId: 'hair-tp-clinic',
      customerEmail: 'idgate@example.com',
      body: { serviceId: 'fue' },
    });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'identity_verification_required');

    await identityStore.markInPerson('patient-id-gate', {
      verifiedBy: 'staff@test',
      tenantId: 'hair-tp-clinic',
    });

    const allowed = await checkTreatmentBookingGate({
      treatmentAgreementStore: agreementStore,
      patientMasterStore: patientStore,
      patientIdentityStore: identityStore,
      tenantId: 'hair-tp-clinic',
      customerEmail: 'idgate@example.com',
      body: { serviceId: 'fue' },
    });
    assert.equal(allowed.allowed, true);
  } finally {
    if (prevGate === undefined) delete process.env.CCO_ID_VERIFICATION_HARD_GATE;
    else process.env.CCO_ID_VERIFICATION_HARD_GATE = prevGate;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
