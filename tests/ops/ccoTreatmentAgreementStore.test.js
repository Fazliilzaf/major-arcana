const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildTreatmentAgreementReadout,
  canAcceptAgreement,
  createCcoTreatmentAgreementStore,
} = require('../../src/ops/ccoTreatmentAgreementStore');

test('treatment agreement store upsertar per patient', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-agreement-store-'));
  const filePath = path.join(tempDir, 'cco-treatment-agreements.json');

  try {
    const store = await createCcoTreatmentAgreementStore({ filePath });
    const first = await store.upsertAgreement({
      tenantId: 'hair-tp-clinic',
      patientId: 'patient-1',
      patientName: 'Anna Test',
      deliveryMode: 'distans',
      agreementStatus: 'draft',
    });
    const second = await store.upsertAgreement({
      ...first,
      agreementStatus: 'patient_info_sent',
      patientInfoSentAt: '2026-05-22T10:00:00.000Z',
      patientInfoChannel: 'e-post',
    });

    assert.equal(second.agreementId, first.agreementId);
    assert.equal(second.agreementStatus, 'patient_info_sent');
    const loaded = await store.getPatientAgreement({
      tenantId: 'hair-tp-clinic',
      patientId: 'patient-1',
    });
    assert.equal(loaded.patientInfoChannel, 'e-post');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('treatment agreement readout visar betänketid vid distans', () => {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const readout = buildTreatmentAgreementReadout({
    agreementStatus: 'cooling_off',
    deliveryMode: 'distans',
    coolingOffEndsAt: future,
  });
  assert.equal(readout.phase, 'cooling_off');
  assert.equal(readout.waitingOn, 'legal');
  assert.match(readout.angerBlanketUrl, /konsumentverket/i);
});

test('canAcceptAgreement blockerar distans under betänketid', () => {
  const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const gate = canAcceptAgreement(
    {
      agreementStatus: 'cooling_off',
      deliveryMode: 'distans',
      coolingOffEndsAt: future,
    },
    { nowMs: Date.now() }
  );
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /Betänketid/i);
});

test('canAcceptAgreement tillåter plats utan betänketid', () => {
  const gate = canAcceptAgreement({
    agreementStatus: 'sent',
    deliveryMode: 'plats',
  });
  assert.equal(gate.allowed, true);
});
