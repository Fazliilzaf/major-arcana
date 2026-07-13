'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  executeCanonicalPatientRepairJob,
  getCanonicalPatientRepairJobState,
  resetCanonicalPatientRepairJobStateForTests,
} = require('../../src/ops/ccoCanonicalAssetPatientRepairAsyncJob');

function asset(id, path) {
  return {
    id,
    patientId: 'shared',
    status: 'VISIBLE_ON_PATIENT_CARD',
    mimeType: 'image/jpeg',
    relativePath: path,
  };
}

test('async repair commits exactly one bounded batch per job', async () => {
  resetCanonicalPatientRepairJobStateForTests();
  const writes = [];
  let begins = 0;
  let flushes = 0;
  const assetStore = {
    beginBatch() {
      begins += 1;
    },
    async flushBatch() {
      flushes += 1;
    },
    async linkAssetToPatient(id, patientId) {
      writes.push([id, patientId]);
    },
  };

  await executeCanonicalPatientRepairJob({
    patients: [{ id: 'lisa', displayName: 'Lisa Karlsson', personnummer: '020405-7160' }],
    assets: [
      asset('a1', 'Lisa Karlsson - 0204057160/a.jpg'),
      asset('a2', 'Lisa Karlsson - 0204057160/b.jpg'),
      asset('a3', 'Lisa Karlsson - 0204057160/c.jpg'),
    ],
    assetStore,
    batchSize: 2,
  });

  const state = getCanonicalPatientRepairJobState();
  assert.deepEqual(writes, [
    ['a1', 'lisa'],
    ['a2', 'lisa'],
  ]);
  assert.equal(begins, 1);
  assert.equal(flushes, 1);
  assert.equal(state.stats.linked, 2);
  assert.equal(state.stats.remainingEligible, 1);
  assert.equal(state.lastError, null);
});

test('async repair loads the expensive population inside the job', async () => {
  resetCanonicalPatientRepairJobStateForTests();
  let loads = 0;
  const writes = [];
  await executeCanonicalPatientRepairJob({
    loadInputs: async () => {
      loads += 1;
      return {
        patients: [{ id: 'lisa', displayName: 'Lisa Karlsson', personnummer: '020405-7160' }],
        assets: [asset('a1', 'Lisa Karlsson - 0204057160/a.jpg')],
        assetStore: {
          beginBatch() {},
          async flushBatch() {},
          async linkAssetToPatient(id, patientId) {
            writes.push([id, patientId]);
          },
        },
      };
    },
  });
  assert.equal(loads, 1);
  assert.deepEqual(writes, [['a1', 'lisa']]);
});
