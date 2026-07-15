'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { auditNonverifiedAssetStoragePage } = require('../../src/ops/ccoDriveAssetStorageAudit');

test('audits nonverified asset blobs without writes', async () => {
  const report = await auditNonverifiedAssetStoragePage({
    tenantId: 'tenant-1',
    assetStore: {
      listItemsForEnrichment() {
        return [
          { id: 'asset-good', patientId: 'patient-1', status: 'IMPORTED_TO_CCO', storageKey: 'good' },
          { id: 'asset-missing', patientId: 'patient-2', status: 'IMPORTING', storageKey: 'missing' },
          { id: 'asset-no-key', patientId: 'patient-3', status: 'IMPORTED_TO_CCO' },
          { id: 'asset-visible', patientId: 'patient-4', status: 'VISIBLE_ON_PATIENT_CARD', storageKey: 'good' },
        ];
      },
    },
    storage: { exists: async (key) => key === 'good' },
    maskSamples: false,
  });

  assert.equal(report.zeroWrites, true);
  assert.equal(report.pagination.totalCandidates, 3);
  assert.equal(report.stats.checked, 3);
  assert.equal(report.stats.passed, 1);
  assert.equal(report.stats.missingBlob, 1);
  assert.equal(report.stats.missingStorageKey, 1);
  assert.equal(report.findings.length, 2);
});

test('paginates only target statuses', async () => {
  const report = await auditNonverifiedAssetStoragePage({
    assetStore: {
      listItemsForEnrichment() {
        return [
          { id: 'a', status: 'IMPORTED_TO_CCO', storageKey: 'a' },
          { id: 'b', status: 'IMPORTING', storageKey: 'b' },
          { id: 'c', status: 'VISIBLE_ON_PATIENT_CARD', storageKey: 'c' },
        ];
      },
    },
    storage: { exists: async () => true },
    pageSize: 1,
    maskSamples: false,
  });

  assert.equal(report.pagination.scanned, 1);
  assert.equal(report.pagination.totalCandidates, 2);
  assert.equal(report.pagination.nextOffset, 1);
  assert.equal(report.stats.passed, 1);
});
