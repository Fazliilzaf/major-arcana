'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCanonicalAssetPatientRepairPlan,
  repairCanonicalAssetPatientLinks,
} = require('../../src/ops/ccoCanonicalAssetPatientRepair');

function asset(id, patientId, path) {
  return {
    id,
    patientId,
    status: 'VISIBLE_ON_PATIENT_CARD',
    mimeType: 'image/jpeg',
    relativePath: path,
  };
}

test('plan includes only strong per-asset identities', () => {
  const plan = buildCanonicalAssetPatientRepairPlan({
    patients: [
      { id: 'lisa', displayName: 'Lisa Karlsson', personnummer: '020405-7160' },
      { id: 'david', displayName: 'David' },
      { id: 'david-baker', displayName: 'David Baker' },
    ],
    assets: [
      asset('a1', 'shared', 'Lisa Karlsson - 0204057160/IMG_1.jpg'),
      asset('a2', 'shared', 'David Baker/IMG_2.jpg'),
      asset('a3', 'shared', 'Okänd/IMG_3.jpg'),
    ],
  });

  assert.deepEqual(
    plan.eligible.map((row) => [row.assetId, row.canonicalPatientId, row.reason]),
    [
      ['a1', 'lisa', 'personnummer_path'],
      ['a2', 'david-baker', 'exact_name_path'],
    ]
  );
});

test('dry-run is zero-write and commit links the bounded batch', async () => {
  const writes = [];
  const assetStore = {
    beginBatch() {},
    async flushBatch() {},
    async linkAssetToPatient(id, patientId) {
      writes.push([id, patientId]);
      return { id, patientId };
    },
  };
  const input = {
    patients: [{ id: 'lisa', displayName: 'Lisa Karlsson', personnummer: '020405-7160' }],
    assets: [asset('a1', 'shared', 'Lisa Karlsson - 0204057160/IMG_1.jpg')],
    assetStore,
  };

  const preview = await repairCanonicalAssetPatientLinks({ ...input, dryRun: true });
  assert.equal(preview.zeroWrites, true);
  assert.equal(preview.stats.eligible, 1);
  assert.deepEqual(writes, []);

  const committed = await repairCanonicalAssetPatientLinks({ ...input, dryRun: false });
  assert.equal(committed.zeroWrites, false);
  assert.equal(committed.stats.linked, 1);
  assert.deepEqual(writes, [['a1', 'lisa']]);
});
