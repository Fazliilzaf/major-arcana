'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeDriveIngestRunAssets } = require('../../src/ops/ccoDriveIngestRunObservability');

test('summarizeDriveIngestRunAssets isolates one Drive run and exposes its review reason', () => {
  const report = summarizeDriveIngestRunAssets(
    [
      { id: 'ignore', sourceSystem: 'drive_import', importRunId: 'other', status: 'VISIBLE_ON_PATIENT_CARD' },
      {
        id: 'review',
        sourceSystem: 'drive_import',
        importRunId: 'run-1',
        status: 'NEEDS_REVIEW',
        reviewReason: 'drive_source_missing_during_import',
        originalDriveFileId: 'drive-1',
        originalFileName: 'journal.pdf',
      },
      { id: 'ok', sourceSystem: 'drive_import', importRunId: 'run-1', status: 'VERIFIED_IN_CCO' },
    ],
    'run-1'
  );

  assert.equal(report.total, 2);
  assert.deepEqual(report.byStatus, { NEEDS_REVIEW: 1, VERIFIED_IN_CCO: 1 });
  assert.equal(report.items.find((item) => item.assetId === 'review').reviewReason, 'drive_source_missing_during_import');
});

test('summarizeDriveIngestRunAssets requires a run id', () => {
  assert.throws(() => summarizeDriveIngestRunAssets([], ''), /runId krävs/);
});
