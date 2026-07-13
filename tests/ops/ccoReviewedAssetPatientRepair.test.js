'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildReviewedAssetPatientRepairPlan,
  repairReviewedAssetPatientLinks,
} = require('../../src/ops/ccoReviewedAssetPatientRepair');

function store(items) {
  const rows = new Map(items.map((item) => [item.id, { ...item }]));
  return {
    getAsset: (id) => rows.get(id),
    linkAssetToPatient: async (id, patientId) => {
      rows.set(id, { ...rows.get(id), patientId });
      return rows.get(id);
    },
  };
}

const asset = {
  id: 'asset-1',
  patientId: 'cliento-old',
  status: 'VISIBLE_ON_PATIENT_CARD',
  mimeType: 'image/jpeg',
  category: 'photo_during',
  encounterId: null,
};

test('reviewed repair requires canonical patient, evidence and unique open media assets', () => {
  const assetStore = store([asset]);
  assert.throws(
    () => buildReviewedAssetPatientRepairPlan({ assignments: [{ patientId: 'p1', assetIds: ['asset-1'] }], assetStore, patients: [{ id: 'p1' }] }),
    /evidence/
  );
  assert.throws(
    () => buildReviewedAssetPatientRepairPlan({ assignments: [{ patientId: 'missing', evidence: 'exact path', assetIds: ['asset-1'] }], assetStore, patients: [{ id: 'p1' }] }),
    /canonical patientId/
  );
});

test('reviewed repair dry-run writes nothing and commit links exact reviewed assets', async () => {
  const assetStore = store([asset]);
  const input = {
    assignments: [{ patientId: 'p1', evidence: 'exact name and personnummer in path', assetIds: ['asset-1'] }],
    assetStore,
    patients: [{ id: 'p1' }],
  };
  const preview = await repairReviewedAssetPatientLinks(input);
  assert.equal(preview.zeroWrites, true);
  assert.equal(preview.stats.reviewed, 1);
  assert.equal(assetStore.getAsset('asset-1').patientId, 'cliento-old');

  const committed = await repairReviewedAssetPatientLinks({ ...input, dryRun: false });
  assert.equal(committed.stats.linked, 1);
  assert.equal(assetStore.getAsset('asset-1').patientId, 'p1');
});
