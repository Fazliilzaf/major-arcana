'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  inspectStuckImport,
  reconcileStuckImport,
} = require('../../src/ops/ccoStuckImportReconciliation');

function makeAsset(overrides = {}) {
  return {
    id: 'asset-1',
    tenantId: 'tenant-1',
    patientId: 'patient-1',
    importRunId: 'run-1',
    status: 'IMPORTING',
    storageKey: 'cco/asset-1.pdf',
    ...overrides,
  };
}

function assetStoreFor(asset, extra = {}) {
  return {
    listItemsForEnrichment: () => [asset],
    ...extra,
  };
}

test('inspects an importing asset with a persisted blob without writes', async () => {
  const asset = makeAsset();
  const result = await inspectStuckImport({
    tenantId: 'tenant-1',
    assetId: asset.id,
    assetStore: assetStoreFor(asset),
    storage: { exists: async () => true },
  });
  assert.equal(result.plan.repairable, true);
  assert.deepEqual(result.plan.blockers, []);
  assert.equal(result.plan.willMakeVisible, false);
});

test('refuses status reconciliation when the binary is absent', async () => {
  const asset = makeAsset();
  const result = await reconcileStuckImport({
    tenantId: 'tenant-1',
    assetId: asset.id,
    dryRun: false,
    assetStore: assetStoreFor(asset, { transitionStatus: async () => assert.fail('must not write') }),
    storage: { exists: async () => false },
  });
  assert.equal(result.reconciled, false);
  assert.deepEqual(result.plan.blockers, ['missing_storage_blob']);
});

test('reconciles exactly IMPORTING to VERIFIED_IN_CCO through the state machine', async () => {
  const asset = makeAsset();
  const transitions = [];
  const result = await reconcileStuckImport({
    tenantId: 'tenant-1',
    assetId: asset.id,
    dryRun: false,
    assetStore: assetStoreFor(asset, {
      transitionStatus: async (_id, status) => {
        transitions.push(status);
        asset.status = status;
        return { ...asset };
      },
    }),
    storage: { exists: async () => true },
  });
  assert.deepEqual(transitions, ['IMPORTED_TO_CCO', 'VERIFIED_IN_CCO']);
  assert.equal(result.reconciled, true);
  assert.equal(result.finalStatus, 'VERIFIED_IN_CCO');
});
