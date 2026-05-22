const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  checkTreatmentBookingGate,
  requiresTreatmentAgreement,
  treatmentServiceIds,
} = require('../../src/ops/ccoTreatmentBookingGate');
const { createCcoTreatmentAgreementStore } = require('../../src/ops/ccoTreatmentAgreementStore');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');

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
      signedAt: new Date().toISOString(),
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
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
