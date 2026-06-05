'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateDocumentReadiness,
  buildDocumentBlockerSignals,
  mapBlockersToActionIds,
} = require('../../src/ops/ccoDocumentReadiness');
const {
  classifyIncomingDocument,
  triageAndCreateInstance,
} = require('../../src/ops/ccoDocumentTriageEngine');
const { buildSmartNextStepReadout } = require('../../src/ops/ccoSmartNextStepStore');
const { buildSignal } = require('../../src/ops/ccoAutomationRunner');

test('evaluateDocumentReadiness blocks konsultation when health declaration missing', () => {
  const readiness = evaluateDocumentReadiness({
    card: {
      treatmentTypes: ['tp'],
      missingHealthDeclaration: true,
    },
    instances: [],
    journalEntries: [],
  });

  assert.equal(readiness.hasBlockers, true);
  assert.ok(readiness.blockedSteps.includes('konsultation'));
  assert.ok(
    readiness.blockers.some(
      (row) => row.documentTypeId === 'haelso_tp_sve' && row.step === 'konsultation'
    )
  );
});

test('evaluateDocumentReadiness clears konsultation when signed health instance exists', () => {
  const readiness = evaluateDocumentReadiness({
    card: {
      treatmentTypes: ['tp'],
      missingHealthDeclaration: true,
    },
    instances: [
      {
        documentTypeId: 'haelso_tp_sve',
        status: 'signed',
      },
    ],
    journalEntries: [],
  });

  assert.equal(readiness.hasBlockers, true);
  assert.ok(!readiness.blockedSteps.includes('konsultation'));
  assert.ok(readiness.satisfied.some((row) => row.documentTypeId === 'haelso_tp_sve'));
});

test('buildDocumentBlockerSignals emits active automation signals', () => {
  const readiness = evaluateDocumentReadiness({
    card: { treatmentTypes: ['tp'], missingHealthDeclaration: true },
    instances: [],
  });
  const signals = buildDocumentBlockerSignals(readiness, { buildSignal });
  assert.ok(signals.length >= 1);
  assert.equal(signals[0].ruleId, 'document.requiredFor.konsultation');
  assert.equal(signals[0].status, 'active');
  assert.equal(signals[0].risk, 'blocker');
});

test('buildSmartNextStepReadout maps blocked steps to action ids', () => {
  const readout = buildSmartNextStepReadout({
    card: {
      treatmentTypes: ['tp'],
      missingHealthDeclaration: true,
      agreementSigned: false,
      treatmentPlanStatus: null,
    },
    instances: [],
  });

  assert.equal(readout.hasDocumentBlockers, true);
  assert.ok(readout.blockedActionIds.includes('form'));
  assert.ok(mapBlockersToActionIds(['avtal']).includes('book'));
});

test('classifyIncomingDocument matches hälsodeklaration subject', () => {
  const result = classifyIncomingDocument({
    subject: 'Hälsodeklaration Hair TP — ifyll',
    bodyPreview: 'Länk till Meridiq',
  });
  assert.equal(result.documentTypeId, 'haelso_tp_sve');
  assert.equal(result.confidence, 'high');
});

test('triageAndCreateInstance creates manual triage when classification is uncertain', async () => {
  const instances = [];
  const store = {
    listForPatient: async () => instances,
    findBySourceMessageId: async () => null,
    findOpenForPatientType: async () => null,
    createInstance: async (row) => {
      const created = { instanceId: 'inst-1', ...row };
      instances.push(created);
      return created;
    },
  };

  const result = await triageAndCreateInstance(store, {
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    subject: 'Formulär att fylla i',
    bodyPreview: 'Meridiq länk',
    sourceMessageId: 'mail-123',
  });

  assert.equal(result.created, true);
  assert.equal(result.instance.needsManualTriage, true);
  assert.equal(result.instance.sourceMessageId, 'mail-123');
});

test('triageAndCreateInstance dedupes by source message id', async () => {
  const existing = {
    instanceId: 'inst-existing',
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    sourceMessageId: 'mail-dup',
  };
  const store = {
    findBySourceMessageId: async (id) => (id === 'mail-dup' ? existing : null),
    createInstance: async () => {
      throw new Error('should not create duplicate');
    },
  };

  const result = await triageAndCreateInstance(store, {
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    subject: 'Hälsodeklaration',
    sourceMessageId: 'mail-dup',
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'already_triaged');
});
