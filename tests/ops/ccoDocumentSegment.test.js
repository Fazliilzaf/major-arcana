'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAllDocumentTypes,
  getDocumentTypeById,
  filterDocumentTypes,
} = require('../../src/ops/ccoDocumentTypeRegistry');
const {
  buildPatientDocumentBundle,
  groupForType,
} = require('../../src/ops/ccoPatientDocumentAggregator');

test('document registry exposes 36 Hair TP types', () => {
  const types = getAllDocumentTypes();
  assert.equal(types.length, 36);
  assert.ok(getDocumentTypeById('offert_profilo'));
  assert.equal(getDocumentTypeById('offert_profilo').clinic, 'curatiio');
});

test('filterDocumentTypes respects filler and flow', () => {
  const patientIntake = filterDocumentTypes({ filler: 'patient', category: 'intake' });
  assert.ok(patientIntake.length >= 4);
  assert.ok(patientIntake.every((row) => row.filler === 'patient'));
  const tpFlow = filterDocumentTypes({ flow: 'tp' });
  assert.ok(tpFlow.some((row) => row.id === 'offert_tp'));
});

test('buildPatientDocumentBundle groups documents for TP card', async () => {
  const bundle = await buildPatientDocumentBundle({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-test-1',
    card: {
      treatmentTypes: ['tp'],
      missingHealthDeclaration: true,
      hasUpcomingBooking: true,
    },
    journalEntries: [],
    documentInstanceStore: {
      listForPatient: async () => [],
    },
  });

  assert.equal(bundle.ready, true);
  assert.ok(bundle.counts.total > 0);
  assert.ok(Array.isArray(bundle.documents.offers));
  assert.ok(Array.isArray(bundle.documents.healthForms));
  assert.ok(Array.isArray(bundle.documents.journaler));
  assert.ok(Array.isArray(bundle.documents.autoDokument));
  const health = bundle.documents.healthForms.find((row) =>
    String(row.title).includes('Hälsodeklaration')
  );
  assert.equal(health?.status, 'pending');
});

test('groupForType maps offers and auto docs', () => {
  assert.equal(groupForType(getDocumentTypeById('offert_tp')), 'offers');
  assert.equal(groupForType(getDocumentTypeById('auto_bokningsbekraftelse')), 'autoDocs');
  assert.equal(groupForType(getDocumentTypeById('journal_tp')), 'journals');
});
