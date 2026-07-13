'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  executeGhostVisibleDiagnosisJob,
  getGhostVisibleDiagnosisJobState,
  resetGhostVisibleDiagnosisJobStateForTests,
  startGhostVisibleDiagnosisJob,
} = require('../../src/ops/ccoGhostVisibleDiagnosisAsyncJob');

function assetStoreWith(items) {
  return { listItemsForEnrichment: () => items };
}

test('ghost diagnosis async job returns immediately and completes read-only', async () => {
  resetGhostVisibleDiagnosisJobStateForTests();
  const assetStore = assetStoreWith([
    {
      id: 'ghost',
      patientId: 'patient-1',
      status: 'VISIBLE_ON_PATIENT_CARD',
      storageKey: 'missing.pdf',
      checksum: 'same',
      fileSize: 10,
    },
    {
      id: 'sibling',
      patientId: 'patient-1',
      status: 'DUPLICATE',
      storageKey: 'present.pdf',
      checksum: 'same',
      fileSize: 10,
    },
  ]);
  const storage = { exists: async (key) => key === 'present.pdf' };

  const started = startGhostVisibleDiagnosisJob({ assetStore, storage, maskSamples: false });
  assert.equal(started.accepted, true);
  assert.equal(started.state.running, true);

  while (getGhostVisibleDiagnosisJobState().running) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const state = getGhostVisibleDiagnosisJobState();
  assert.equal(state.lastError, null);
  assert.equal(state.report.zeroWrites, true);
  assert.equal(state.report.stats.withBlobSibling, 1);
});

test('ghost diagnosis async job exposes failures without throwing from background task', async () => {
  resetGhostVisibleDiagnosisJobStateForTests();
  await executeGhostVisibleDiagnosisJob({ assetStore: null });
  const state = getGhostVisibleDiagnosisJobState();
  assert.equal(state.running, false);
  assert.match(state.lastError, /assetStore/);
  assert.ok(state.finishedAt);
});
