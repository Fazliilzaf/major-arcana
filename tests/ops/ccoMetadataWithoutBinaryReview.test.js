'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMetadataWithoutBinaryPlan,
  quarantineMetadataWithoutBinary,
} = require('../../src/ops/ccoMetadataWithoutBinaryReview');

function makeStores() {
  const assets = [
    { id: 'meta-1', patientId: 'patient-1', importRunId: 'legacy-run', status: 'IMPORTED_TO_CCO', sourceSystem: 'getaccept_import' },
    { id: 'binary-1', patientId: 'patient-2', importRunId: 'legacy-run', status: 'IMPORTED_TO_CCO', storageKey: 'files/a.pdf' },
    { id: 'visible-1', patientId: 'patient-3', importRunId: 'legacy-run', status: 'VISIBLE_ON_PATIENT_CARD' },
  ];
  const queue = [];
  return {
    assetStore: {
      listItemsForEnrichment() { return assets; },
      async transitionStatus(id, status, { reason }) {
        const asset = assets.find((candidate) => candidate.id === id);
        asset.status = status;
        asset.statusChangeReason = reason;
        return asset;
      },
    },
    reviewQueueStore: {
      listPending() { return queue; },
      async enqueue(item) { queue.push(item); return item; },
    },
    assets,
    queue,
  };
}

test('plans only imported metadata without a binary', () => {
  const { assetStore } = makeStores();
  const plan = buildMetadataWithoutBinaryPlan({ assetStore, importRunId: 'legacy-run' });
  assert.equal(plan.stats.candidates, 1);
  assert.deepEqual(plan.stats.bySourceSystem, { getaccept_import: 1 });
});

test('dry run is zero-write and commit quarantines with one review item', async () => {
  const stores = makeStores();
  const dryRun = await quarantineMetadataWithoutBinary({
    ...stores,
    importRunId: 'legacy-run',
    expectedCount: 1,
  });
  assert.equal(dryRun.zeroWrites, true);
  assert.equal(stores.assets[0].status, 'IMPORTED_TO_CCO');

  const committed = await quarantineMetadataWithoutBinary({
    ...stores,
    importRunId: 'legacy-run',
    expectedCount: 1,
    dryRun: false,
  });
  assert.equal(committed.stats.quarantined, 1);
  assert.equal(committed.stats.enqueued, 1);
  assert.equal(stores.assets[0].status, 'NEEDS_REVIEW');
  assert.equal(stores.queue.length, 1);
});

test('rejects a stale expected count before any write', async () => {
  const stores = makeStores();
  await assert.rejects(
    () => quarantineMetadataWithoutBinary({ ...stores, importRunId: 'legacy-run', expectedCount: 88 }),
    /expectedCount mismatch/
  );
  assert.equal(stores.assets[0].status, 'IMPORTED_TO_CCO');
});
