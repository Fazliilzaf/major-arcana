'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildNamingReviewQueue,
  classifyReason,
} = require('../../../src/ops/ccoAssetNaming/buildNamingReviewQueue');

function createPatientStore(patients = []) {
  return {
    async listPatients({ tenantId, limit }) {
      return { patients: patients.slice(0, limit) };
    },
  };
}

function createAssetStore(items = []) {
  const byId = Object.fromEntries(items.map((a) => [a.id, a]));
  return {
    listItemsForEnrichment() {
      return items;
    },
    getAsset(id) {
      return byId[id] || null;
    },
  };
}

test('buildNamingReviewQueue: tom data ger tom rapport', async () => {
  const report = await buildNamingReviewQueue(createPatientStore([]), createAssetStore([]), {
    tenantId: 't1',
  });
  assert.equal(report.totalReviewQueueSize, 0);
  assert.equal(report.patientsAffected, 0);
  assert.equal(report.topPatientsByQueueSize.length, 0);
});

test('buildNamingReviewQueue: räknar fallback_session_number korrekt', async () => {
  const patients = [{ id: 'p1', tenantId: 't1' }];
  const assets = [
    {
      id: 'a1',
      patientId: 'p1',
      category: 'journal',
      originalFileName: 'FUE-avtal.pdf',
      treatmentType: 'FUE',
      importedAt: '2026-01-15T10:00:00.000Z',
      tenantId: 't1',
    },
  ];
  const report = await buildNamingReviewQueue(
    createPatientStore(patients),
    createAssetStore(assets),
    { tenantId: 't1', maskIds: false }
  );
  assert.equal(report.totalReviewQueueSize, 1);
  assert.equal(report.reasonTotals.fallback_session_number, 1);
  assert.equal(report.patientsAffected, 1);
  assert.equal(report.topPatientsByQueueSize[0].likelyBulkFixable, true);
});

test('buildNamingReviewQueue: lågkonfident asset räknas separat', async () => {
  const patients = [{ id: 'p1', tenantId: 't1' }];
  const assets = [
    {
      id: 'a1',
      patientId: 'p1',
      category: 'other',
      originalFileName: 'IMG_9999.jpg',
      importedAt: '2026-01-15T10:00:00.000Z',
      tenantId: 't1',
    },
  ];
  const report = await buildNamingReviewQueue(
    createPatientStore(patients),
    createAssetStore(assets),
    { tenantId: 't1', maskIds: false }
  );
  assert.equal(report.totalReviewQueueSize, 1);
  assert.equal(report.reasonTotals.low_confidence, 1);
  assert.equal(report.topPatientsByQueueSize[0].likelyBulkFixable, false);
});

test('buildNamingReviewQueue: manuellt kurerade namn exkluderas', async () => {
  const patients = [{ id: 'p1', tenantId: 't1' }];
  const assets = [
    {
      id: 'a1',
      patientId: 'p1',
      category: 'journal',
      originalFileName: 'FUE-avtal.pdf',
      treatmentType: 'FUE',
      importedAt: '2026-01-15T10:00:00.000Z',
      namingStatus: 'manual',
      tenantId: 't1',
    },
  ];
  const report = await buildNamingReviewQueue(
    createPatientStore(patients),
    createAssetStore(assets),
    { tenantId: 't1', maskIds: false }
  );
  assert.equal(report.totalReviewQueueSize, 0);
});

test('classifyReason: kombinerar low + fallback', () => {
  assert.equal(
    classifyReason({ namingConfidence: 'low', sessionNumberIsUnreliable: true }),
    'both'
  );
  assert.equal(
    classifyReason({ namingConfidence: 'high', sessionNumberIsUnreliable: true }),
    'fallback_session_number'
  );
  assert.equal(
    classifyReason({ namingConfidence: 'low', sessionNumberIsUnreliable: false }),
    'low_confidence'
  );
  assert.equal(
    classifyReason({ namingConfidence: 'high', sessionNumberIsUnreliable: false }),
    'other'
  );
});

test('buildNamingReviewQueue: maskerar patientId som default', async () => {
  const patients = [{ id: 'p1-long-id', tenantId: 't1' }];
  const assets = [
    {
      id: 'a1',
      patientId: 'p1-long-id',
      category: 'other',
      originalFileName: 'x.pdf',
      importedAt: '2026-01-15T10:00:00.000Z',
      tenantId: 't1',
    },
  ];
  const report = await buildNamingReviewQueue(
    createPatientStore(patients),
    createAssetStore(assets),
    { tenantId: 't1' }
  );
  const masked = report.topPatientsByQueueSize[0].patientId;
  assert.notEqual(masked, 'p1-long-id');
  assert.ok(masked.includes('***'));
});
