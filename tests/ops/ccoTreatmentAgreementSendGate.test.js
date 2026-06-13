'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { evaluateSendForSignGate } = require('../../src/ops/ccoTreatmentAgreementSendGate');
const { createCcoTreatmentAgreementStore } = require('../../src/ops/ccoTreatmentAgreementStore');
const {
  createCcoTemplateVersionApprovalStore,
} = require('../../src/ops/ccoTemplateVersionApprovalStore');
const { applyConsentTemplateToAgreement } = require('../../src/ops/ccoTreatmentAgreementBundle');

describe('ccoTreatmentAgreementSendGate', () => {
  it('blockerar utan avtal (needsFromOffer)', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ord6-gate-'));
    const agreementStore = await createCcoTreatmentAgreementStore({
      filePath: path.join(tempDir, 'agreements.json'),
    });
    try {
      const gate = await evaluateSendForSignGate({
        treatmentAgreementStore: agreementStore,
        templateVersionApprovalStore: null,
        tenantId: 'hair-tp-clinic',
        patientId: 'patient-test-1',
      });

      assert.equal(gate.allowed, false);
      assert.equal(gate.httpStatus, 404);
      assert.equal(gate.needsFromOffer, true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('blockerar utan legal review (needsLegalReview)', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ord6-gate-'));
    const agreementStore = await createCcoTreatmentAgreementStore({
      filePath: path.join(tempDir, 'agreements.json'),
    });
    const approvalStore = await createCcoTemplateVersionApprovalStore({
      filePath: path.join(tempDir, 'approvals.json'),
    });
    try {
      await agreementStore.upsertAgreement({
        tenantId: 'hair-tp-clinic',
        patientId: 'patient-test-2',
        agreementDocumentId: 'doc-1',
        templateId: 'hair-tp-fue',
        templateVersion: '251203',
        agreementStatus: 'draft',
        treatmentType: 'fue',
      });

      const gate = await evaluateSendForSignGate({
        treatmentAgreementStore: agreementStore,
        templateVersionApprovalStore: approvalStore,
        tenantId: 'hair-tp-clinic',
        patientId: 'patient-test-2',
      });

      assert.equal(gate.allowed, false);
      assert.equal(gate.httpStatus, 409);
      assert.equal(gate.needsLegalReview, true);
      assert.equal(gate.templateId, 'hair-tp-fue');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('tillåter när mall-version är godkänd', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ord6-gate-'));
    const agreementStore = await createCcoTreatmentAgreementStore({
      filePath: path.join(tempDir, 'agreements.json'),
    });
    const approvalStore = await createCcoTemplateVersionApprovalStore({
      filePath: path.join(tempDir, 'approvals.json'),
    });
    try {
      await approvalStore.recordApproval({
        templateId: 'hair-tp-fue',
        version: '251203',
        status: 'approved',
        approvedBy: 'fazli',
      });

      const draft = applyConsentTemplateToAgreement({
        tenantId: 'hair-tp-clinic',
        patientId: 'patient-test-3',
        agreementDocumentId: 'doc-1',
        templateId: 'hair-tp-fue',
        templateVersion: '251203',
        agreementStatus: 'draft',
        treatmentType: 'fue',
      });
      await agreementStore.upsertAgreement(draft);

      const gate = await evaluateSendForSignGate({
        treatmentAgreementStore: agreementStore,
        templateVersionApprovalStore: approvalStore,
        tenantId: 'hair-tp-clinic',
        patientId: 'patient-test-3',
      });

      assert.equal(gate.allowed, true);
      assert.equal(gate.httpStatus, 200);
      assert.equal(gate.templateVersionApproved, true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
