'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolvePilotConfig,
  isPilotPatient,
  applyNativeJournalFilesForPilot,
} = require('../../src/ops/ccoDriveJournalNativePilot');

test('resolvePilotConfig loads manifest patientIds when enabled', () => {
  const cfg = resolvePilotConfig({
    enableDriveJournalNativePilot: true,
    driveJournalNativePilotPatientIds: ['p1', 'p2'],
  });
  assert.equal(cfg.enabled, true);
  assert.deepEqual(cfg.patientIds, ['p1', 'p2']);
});

test('applyNativeJournalFilesForPilot replaces journal viewUrl for pilot patient', () => {
  const pilotConfig = { enabled: true, patientIds: ['patient-a'] };
  const assetStore = {
    listAssetsForPatient(patientId) {
      if (patientId !== 'patient-a') return [];
      return [
        {
          id: 'asset-1',
          patientId: 'patient-a',
          category: 'journal',
          sourceSystem: 'drive_import',
          status: 'VISIBLE_ON_PATIENT_CARD',
          storageKey: '2026/05/x.pdf',
          checksum: 'sha256:abc',
          originalDriveFileId: 'drive-123',
          originalFileName: 'journal.pdf',
        },
      ];
    },
  };
  const driveFiles = [
    {
      id: 'idx-1',
      fileType: 'journal_pdf',
      driveFileId: 'drive-123',
      relativePath: '2024/journal.pdf',
      viewUrl: '/api/v1/cco-patient-master/file?fileId=idx-1',
    },
    {
      id: 'idx-2',
      fileType: 'image',
      driveFileId: 'drive-photo',
      relativePath: '2024/photo.jpg',
      viewUrl: '/api/v1/cco-patient-master/file?fileId=idx-2',
    },
  ];

  const result = applyNativeJournalFilesForPilot({
    driveFiles,
    patientId: 'patient-a',
    assetStore,
    pilotConfig,
  });

  assert.equal(result.replacedCount, 1);
  assert.equal(result.nativeCount, 1);
  assert.match(result.files[0].viewUrl, /\/api\/v1\/cco\/assets\/asset-1\/download\?inline=1$/);
  assert.equal(result.files[0].ccoNative, true);
  assert.match(result.files[1].viewUrl, /cco-patient-master\/file\?fileId=idx-2/);
});

test('non-pilot patient keeps migration-index viewUrl', () => {
  const pilotConfig = { enabled: true, patientIds: ['other'] };
  const driveFiles = [
    {
      id: 'idx-1',
      fileType: 'journal_pdf',
      driveFileId: 'x',
      viewUrl: '/api/v1/cco-patient-master/file?fileId=idx-1',
    },
  ];
  const result = applyNativeJournalFilesForPilot({
    driveFiles,
    patientId: 'patient-a',
    assetStore: { listAssetsForPatient: () => [] },
    pilotConfig,
  });
  assert.equal(result.replacedCount, 0);
  assert.match(result.files[0].viewUrl, /cco-patient-master\/file/);
});
