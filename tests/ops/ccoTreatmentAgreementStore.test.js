'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildTreatmentAgreementReadout,
  canAcceptAgreement,
  createCcoTreatmentAgreementStore,
  defaultTemplateBindingForOffer,
} = require('../../src/ops/ccoTreatmentAgreementStore');

describe('ccoTreatmentAgreementStore', () => {
  it('upsertar per patient', async () => {
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
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('readout visar betänketid vid distans', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const readout = buildTreatmentAgreementReadout({
      agreementStatus: 'cooling_off',
      deliveryMode: 'distans',
      coolingOffEndsAt: future,
    });
    assert.equal(readout.phase, 'cooling_off');
    assert.equal(readout.waitingOn, 'legal');
  });

  it('canAcceptAgreement blockerar distans under betänketid', () => {
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
  });

  it('canAcceptAgreement tillåter plats utan betänketid', () => {
    const gate = canAcceptAgreement({
      agreementStatus: 'sent',
      deliveryMode: 'plats',
    });
    assert.equal(gate.allowed, true);
  });

  it('defaultTemplateBindingForOffer sätter templateId från offert', () => {
    const binding = defaultTemplateBindingForOffer('fue', '251203');
    assert.equal(binding.templateId, 'hair-tp-fue');
    assert.equal(binding.templateVersion, '251203');
  });

  it('legacy signerat avtal utan template är bookable', () => {
    const readout = buildTreatmentAgreementReadout({
      agreementStatus: 'bookable',
      signedAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(readout.bookable, true);
    assert.equal(readout.templateVersionApproved, true);
  });

  it('signerat avtal med template men utan approval är inte bookable', () => {
    const readout = buildTreatmentAgreementReadout(
      {
        agreementStatus: 'bookable',
        templateId: 'hair-tp-fue',
        templateVersion: '1.3',
      },
      { templateApproval: { status: 'pending' } }
    );
    assert.equal(readout.bookable, false);
    assert.equal(readout.templateVersionApproved, false);
    assert.match(readout.nextStep, /legal review/i);
  });

  it('signerat avtal med godkänd mall-version är bookable', () => {
    const readout = buildTreatmentAgreementReadout(
      {
        agreementStatus: 'bookable',
        templateId: 'hair-tp-fue',
        templateVersion: '1.3',
      },
      { templateApproval: { status: 'approved', approvedBy: 'nordbro' } }
    );
    assert.equal(readout.bookable, true);
    assert.equal(readout.templateVersionApproved, true);
  });

  it('readout exponerar bundleStatus och consentSigned', () => {
    const resolution = require('../../src/ops/meridiqConsentCatalogRuntime').resolveTemplate('fue');
    const readout = buildTreatmentAgreementReadout({
      agreementStatus: 'bookable',
      signedAt: '2026-01-01T00:00:00.000Z',
      treatmentType: 'fue',
      consent: {
        templateApiId: resolution.template.apiId,
        signed: true,
        signedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    assert.equal(readout.bundleStatus, 'signed');
    assert.equal(readout.consentSigned, true);
    assert.equal(readout.consentTemplateResolved, true);
  });

  it('bookable kräver consent när templateApiId är satt', () => {
    const readout = buildTreatmentAgreementReadout({
      agreementStatus: 'bookable',
      signedAt: '2026-01-01T00:00:00.000Z',
      consent: { templateApiId: 170917, signed: false },
    });
    assert.equal(readout.bookable, false);
  });

  it('persist templateId och templateVersion', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-agreement-tpl-'));
    const filePath = path.join(tempDir, 'cco-treatment-agreements.json');
    try {
      const store = await createCcoTreatmentAgreementStore({ filePath });
      const saved = await store.upsertAgreement({
        tenantId: 'hair-tp-clinic',
        patientId: 'patient-tpl',
        templateId: 'hair-tp-dhi',
        templateVersion: '2.0',
        agreementStatus: 'draft',
      });
      assert.equal(saved.templateId, 'hair-tp-dhi');
      assert.equal(saved.templateVersion, '2.0');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
