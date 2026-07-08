'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoAssetImportPipeline } = require('../../src/ops/ccoAssetImportPipeline');
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createCcoAssetImportRunStore } = require('../../src/ops/ccoAssetImportRunStore');
const { createCcoAssetReviewQueueStore } = require('../../src/ops/ccoAssetReviewQueueStore');
const { createLocalProvider } = require('../../src/ops/ccoSecureStorageProvider');
const { stableEncounterId } = require('../../src/ops/ccoAssetNaming/encounterMapper');
const {
  collectDriveRowsForInternalization,
  internalizeDriveAssets,
  inventoryDriveAssets,
  normalizeDriveAssetRow,
  previewInternalizeCandidates,
  findConsecutivePilotWindow,
  buildPilotWindowSearch,
} = require('../../src/ops/ccoDriveAssetInternalization');

async function makeRig() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-drive-internalize-'));
  const assetStore = await createCcoPatientAssetStore({ filePath: path.join(tmp, 'assets.json') });
  const importRunStore = await createCcoAssetImportRunStore({
    filePath: path.join(tmp, 'runs.json'),
  });
  const reviewQueueStore = await createCcoAssetReviewQueueStore({
    filePath: path.join(tmp, 'review.json'),
  });
  const storage = createLocalProvider({ rootPath: path.join(tmp, 'storage') });
  const pipeline = createCcoAssetImportPipeline({
    assetStore,
    importRunStore,
    reviewQueueStore,
    storage,
  });
  return { tmp, assetStore, importRunStore, reviewQueueStore, storage, pipeline };
}

test('normalizeDriveAssetRow accepterar patient-master attachments och migration rows', () => {
  const a = normalizeDriveAssetRow({
    patientId: 'pat-1',
    file: {
      driveFileId: 'drive-1',
      relativePath: 'Hair TP Clinic 2024/Bokade/Maj/Åsa/journal.pdf',
      mimeType: 'application/pdf',
    },
  });
  assert.equal(a.patientId, 'pat-1');
  assert.equal(a.driveFileId, 'drive-1');
  assert.equal(a.originalFileName, 'journal.pdf');

  const b = normalizeDriveAssetRow({
    file: { id: 'idx-1', driveFileId: 'drive-2', fileName: 'bild.jpg' },
    patientId: 'pat-2',
    documentDate: '2024-05-20',
  });
  assert.equal(b.sourceRecordId, 'idx-1');
  assert.equal(b.documentDate, '2024-05-20');
});

test('inventory är dry-run och räknar redan internaliserade + review utan skrivning', async () => {
  const rig = await makeRig();
  try {
    await rig.assetStore.addAsset({
      patientId: 'pat-1',
      sourceSystem: 'drive_import',
      sourceRecordId: 'idx-1',
      originalDriveFileId: 'drive-1',
      originalFileName: 'journal.pdf',
      storageProvider: 'local',
      storageKey: '2024/05/hash/file.pdf',
      checksum: 'abc',
      fileSize: 12,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'IMPORTED_TO_CCO',
    });
    const report = await inventoryDriveAssets({
      assetStore: rig.assetStore,
      rows: [
        {
          patientId: 'pat-1',
          file: { id: 'idx-1', driveFileId: 'drive-1', fileName: 'journal.pdf' },
        },
        {
          patientId: 'pat-2',
          file: {
            id: 'idx-2',
            driveFileId: 'drive-2',
            fileName: 'foto.jpg',
            mimeType: 'image/jpeg',
          },
        },
        { file: { id: 'idx-3', driveFileId: 'drive-3', fileName: 'okand.pdf' } },
        { patientId: 'pat-4', file: { id: 'idx-4', fileName: 'saknar-drive.pdf' } },
      ],
    });
    assert.equal(report.zeroWrites, true);
    assert.equal(report.stats.scanned, 4);
    assert.equal(report.stats.alreadyInternal, 1);
    assert.equal(report.stats.remaining, 1);
    assert.equal(report.stats.reviewQueued, 2);
    assert.equal(report.stats.byFamily.images, 1);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('commit laddar Drive-binär, använder korrekt Drive-namn med åäö och blir idempotent', async () => {
  const rig = await makeRig();
  try {
    const driveClient = {
      async getFileMetadata() {
        return { name: 'Journal Åsa Ärlig Örebro.pdf', modifiedTime: '2024-05-17T12:34:56.000Z' };
      },
      async downloadBuffer() {
        return Buffer.from('pdf body for asa');
      },
    };
    const rows = [
      {
        patientId: 'patient-åäö',
        file: {
          id: 'idx-drive-asa',
          driveFileId: 'drive-asa-1',
          fileName: 'mojibake-name.pdf',
          relativePath: 'Hair TP Clinic 2024/Bokade/Maj/Asa/mojibake-name.pdf',
          mimeType: 'application/pdf',
        },
      },
    ];
    const first = await internalizeDriveAssets({
      rows,
      assetStore: rig.assetStore,
      importRunStore: rig.importRunStore,
      reviewQueueStore: rig.reviewQueueStore,
      pipeline: rig.pipeline,
      driveClient,
      dryRun: false,
      go: true,
    });
    assert.equal(first.stats.attempted, 1);
    assert.equal(first.stats.failed, 0);

    const assets = rig.assetStore.listItemsForEnrichment();
    assert.equal(assets.length, 1);
    assert.equal(assets[0].originalFileName, 'Journal Åsa Ärlig Örebro.pdf');
    assert.equal(assets[0].originalDriveFileId, 'drive-asa-1');
    assert.equal(assets[0].documentDate, '2024-05-17');
    assert.ok(assets[0].storageKey);
    assert.ok(assets[0].checksum);

    const second = await internalizeDriveAssets({
      rows,
      assetStore: rig.assetStore,
      importRunStore: rig.importRunStore,
      reviewQueueStore: rig.reviewQueueStore,
      pipeline: rig.pipeline,
      driveClient,
      dryRun: true,
    });
    assert.equal(second.stats.alreadyInternal, 1);
    assert.equal(second.stats.remaining, 0);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('commit härleder encounterId från Drive-mappens datum och session', async () => {
  const rig = await makeRig();
  try {
    const driveClient = {
      async getFileMetadata() {
        return { name: 'Journal-PRP-Dino.pdf', modifiedTime: '2026-01-01T12:00:00.000Z' };
      },
      async downloadBuffer() {
        return Buffer.from('prp journal body');
      },
    };
    const rows = [
      {
        patientId: 'patient-prp',
        file: {
          id: 'idx-prp-2',
          driveFileId: 'drive-prp-2',
          fileName: 'legacy-name.pdf',
          relativePath: 'Hair TP Clinic 2024/Bokade/2024-05-17 PRP 2/legacy-name.pdf',
          mimeType: 'application/pdf',
        },
      },
    ];
    const report = await internalizeDriveAssets({
      rows,
      assetStore: rig.assetStore,
      importRunStore: rig.importRunStore,
      reviewQueueStore: rig.reviewQueueStore,
      pipeline: rig.pipeline,
      driveClient,
      dryRun: false,
      go: true,
    });

    const expectedEncounterId = stableEncounterId({
      patientId: 'patient-prp',
      date: '2024-05-17',
      encounterType: 'prp_hair',
      sessionNumber: 2,
    });
    const asset = rig.assetStore.listItemsForEnrichment()[0];
    assert.equal(report.stats.imported, 1);
    assert.equal(report.samples[0].documentDate, '2024-05-17');
    assert.equal(report.samples[0].documentDateSource, 'folder_iso');
    assert.equal(report.samples[0].encounterType, 'prp_hair');
    assert.equal(asset.encounterId, expectedEncounterId);
    assert.equal(asset.encounterType, 'prp_hair');
    assert.equal(asset.treatmentType, 'PRP');
    assert.equal(asset.sessionNumber, 2);
    assert.equal(asset.visitLabel, 'PRP 2');
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('commit använder Drive createdTime som documentDate när modifiedTime saknas', async () => {
  const rig = await makeRig();
  try {
    const driveClient = {
      async getFileMetadata() {
        return { name: 'Journal utan datum.pdf', createdTime: '2024-06-03T08:00:00.000Z' };
      },
      async downloadBuffer() {
        return Buffer.from('created time body');
      },
    };
    const rows = [
      {
        patientId: 'patient-created',
        file: {
          id: 'idx-created',
          driveFileId: 'drive-created-1',
          fileName: 'Journal utan datum.pdf',
          relativePath: 'Hair TP Clinic 2024/Bokade/Juni/Journal utan datum.pdf',
          mimeType: 'application/pdf',
        },
      },
    ];
    const report = await internalizeDriveAssets({
      rows,
      assetStore: rig.assetStore,
      importRunStore: rig.importRunStore,
      reviewQueueStore: rig.reviewQueueStore,
      pipeline: rig.pipeline,
      driveClient,
      dryRun: false,
      go: true,
    });
    assert.equal(report.stats.imported, 1);
    assert.equal(report.samples[0].documentDate, '2024-06-03');
    assert.equal(rig.assetStore.listItemsForEnrichment()[0].documentDate, '2024-06-03');
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('commit retryar temporära Drive-fel innan import', async () => {
  const rig = await makeRig();
  try {
    let metadataCalls = 0;
    let downloadCalls = 0;
    const driveClient = {
      async getFileMetadata() {
        metadataCalls += 1;
        if (metadataCalls === 1) {
          const error = new Error('rate limit');
          error.code = 429;
          throw error;
        }
        return { name: 'Retryad journal.pdf' };
      },
      async downloadBuffer() {
        downloadCalls += 1;
        if (downloadCalls === 1) {
          const error = new Error('temporary backend error');
          error.status = 500;
          throw error;
        }
        return Buffer.from('retry body');
      },
    };
    const rows = [
      {
        patientId: 'patient-retry',
        file: {
          id: 'idx-retry',
          driveFileId: 'drive-retry-1',
          fileName: 'gammalt.pdf',
          relativePath: 'Hair TP Clinic 2024/Bokade/Juni/gammalt.pdf',
          mimeType: 'application/pdf',
        },
      },
    ];
    const report = await internalizeDriveAssets({
      rows,
      assetStore: rig.assetStore,
      importRunStore: rig.importRunStore,
      reviewQueueStore: rig.reviewQueueStore,
      pipeline: rig.pipeline,
      driveClient,
      dryRun: false,
      go: true,
      driveRetryAttempts: 3,
      driveRetryBaseDelayMs: 1,
      driveRetryMaxDelayMs: 1,
    });
    assert.equal(report.stats.imported, 1);
    assert.equal(report.stats.failed, 0);
    assert.equal(metadataCalls, 2);
    assert.equal(downloadCalls, 2);
    assert.equal(
      rig.assetStore.listItemsForEnrichment()[0].originalFileName,
      'Retryad journal.pdf'
    );
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('commit kräver explicit GO', async () => {
  const rig = await makeRig();
  try {
    await assert.rejects(
      () =>
        internalizeDriveAssets({
          rows: [],
          assetStore: rig.assetStore,
          importRunStore: rig.importRunStore,
          reviewQueueStore: rig.reviewQueueStore,
          pipeline: rig.pipeline,
          driveClient: {},
          dryRun: false,
        }),
      /go=true/
    );
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('collectDriveRowsForInternalization läser asset store när patient-master saknar attachments', async () => {
  const rig = await makeRig();
  try {
    await rig.assetStore.addAsset({
      patientId: 'pat-drive-1',
      sourceSystem: 'drive',
      sourceRecordId: 'asset-1',
      originalDriveFileId: 'drive-photo-1',
      originalDrivePath: 'Hair TP Clinic 2024/Bokade/Maj/Anna/foto.jpg',
      originalFileName: 'foto.jpg',
      mimeType: 'image/jpeg',
      category: 'photo_before',
      status: 'LINK_ONLY_BLOCKER',
    });
    const journalPut = await rig.storage.putObject({
      body: Buffer.from('journal body'),
      contentType: 'application/pdf',
      key: '2024/05/hash/journal.pdf',
    });
    await rig.assetStore.addAsset({
      patientId: 'pat-drive-2',
      sourceSystem: 'drive_import',
      sourceRecordId: 'asset-2',
      originalDriveFileId: 'drive-journal-1',
      originalFileName: 'journal.pdf',
      storageProvider: 'local',
      storageKey: journalPut.storageKey,
      checksum: journalPut.checksum,
      fileSize: journalPut.size,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'IMPORTED_TO_CCO',
    });
    const { rows, rowSources } = await collectDriveRowsForInternalization({
      patientMasterState: { tenants: { 'hair-tp-clinic': { patients: [] } } },
      assetStore: rig.assetStore,
      storage: rig.storage,
      tenantId: 'hair-tp-clinic',
    });
    assert.equal(rowSources.patientMasterAttachments, 0);
    assert.equal(rowSources.assetStoreDriveIds, 1);
    assert.equal(rows.length, 1);
    assert.equal(normalizeDriveAssetRow(rows[0]).driveFileId, 'drive-photo-1');
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('inventory räknar om saknad blob på disk som remaining trots checksum i index', async () => {
  const rig = await makeRig();
  try {
    await rig.assetStore.addAsset({
      patientId: 'pat-ghost',
      sourceSystem: 'drive_import',
      sourceRecordId: 'ghost-1',
      originalDriveFileId: 'drive-ghost-1',
      originalFileName: 'ghost.jpg',
      storageProvider: 'local',
      storageKey: 'missing/on/disk/ghost.jpg',
      checksum: 'deadbeef',
      fileSize: 42,
      mimeType: 'image/jpeg',
      category: 'photo_before',
      status: 'IMPORTED_TO_CCO',
    });
    const report = await inventoryDriveAssets({
      assetStore: rig.assetStore,
      storage: rig.storage,
      rows: [
        {
          patientId: 'pat-ghost',
          file: { driveFileId: 'drive-ghost-1', fileName: 'ghost.jpg', mimeType: 'image/jpeg' },
        },
      ],
    });
    assert.equal(report.stats.alreadyInternal, 0);
    assert.equal(report.stats.remaining, 1);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('previewInternalizeCandidates maskerar och hittar pilotWindow utan unknown_month', async () => {
  const rig = await makeRig();
  try {
    const rows = [
      {
        patientId: 'pat-1',
        file: {
          driveFileId: 'drive-unknown-1',
          fileName: 'a.pdf',
          relativePath: 'Hair TP Clinic 2024/Bokade/Åsa/a.pdf',
          mimeType: 'application/pdf',
        },
      },
      {
        patientId: 'pat-2',
        file: {
          driveFileId: 'drive-clear-1',
          fileName: 'b.pdf',
          relativePath: 'Hair TP Clinic 2024/Bokade/Januari 2025/2025-01-02 PRP 1/b.pdf',
          mimeType: 'application/pdf',
        },
      },
      {
        patientId: 'pat-3',
        file: {
          driveFileId: 'drive-clear-2',
          fileName: 'c.pdf',
          relativePath: 'Hair TP Clinic 2024/Bokade/Januari 2025/2025-01-03 PRP 2/c.pdf',
          mimeType: 'application/pdf',
        },
      },
    ];
    const preview = await previewInternalizeCandidates({
      rows,
      assetStore: rig.assetStore,
      storage: rig.storage,
      limit: 10,
      excludeUnknownMonth: true,
      pilotWindowSize: 2,
    });
    assert.equal(preview.zeroWrites, true);
    assert.equal(preview.stats.remaining, 3);
    assert.equal(preview.stats.unknownMonthRemaining, 1);
    assert.equal(preview.stats.calendarClearRemaining, 2);
    assert.equal(preview.candidates.length, 2);
    assert.equal(preview.candidates[0].monthFolder, 'Januari 2025');
    assert.equal(preview.candidates[0].documentDateSource, 'folder_iso');
    assert.match(preview.candidates[0].fileName, /\*/);
    assert.match(preview.candidates[0].driveRef, /\*/);
    assert.equal('patientId' in preview.candidates[0], false);
    assert.equal(preview.pilotWindow.offset, 1);
    assert.equal(preview.pilotWindow.size, 2);
    assert.equal(preview.pilotWindow.candidates.length, 2);
    assert.equal(preview.pilotWindowSearch.matchedAtOffset, 1);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('buildPilotWindowSearch hoppar weak_document_date_source tills folder_iso-fönster', async () => {
  const rig = await makeRig();
  try {
    const rows = [
      {
        patientId: 'pat-1',
        file: {
          driveFileId: 'drive-weak-1',
          fileName: 'Frisk.pdf',
          relativePath: 'Hair TP Clinic 2024/Bokade/November 2023 Sukru/Frisk.pdf',
          mimeType: 'application/pdf',
        },
      },
      {
        patientId: 'pat-2',
        file: {
          driveFileId: 'drive-weak-2',
          fileName: 'Hals.pdf',
          relativePath: 'Hair TP Clinic 2024/Bokade/November 2023 Sukru/Hals.pdf',
          mimeType: 'application/pdf',
        },
      },
      {
        patientId: 'pat-3',
        file: {
          driveFileId: 'drive-iso-1',
          fileName: 'Journal.pdf',
          relativePath: 'Hair TP Clinic 2024/Bokade/Januari 2025/2025-01-02 PRP 1/Journal.pdf',
          mimeType: 'application/pdf',
        },
      },
      {
        patientId: 'pat-4',
        file: {
          driveFileId: 'drive-iso-2',
          fileName: 'Plan.pdf',
          relativePath: 'Hair TP Clinic 2024/Bokade/Januari 2025/2025-01-03 PRP 2/Plan.pdf',
          mimeType: 'application/pdf',
        },
      },
    ];
    const preview = await previewInternalizeCandidates({
      rows,
      assetStore: rig.assetStore,
      storage: rig.storage,
      pilotWindowSize: 2,
      allowedDocumentDateSources: ['folder_iso'],
      requireDocumentDateSource: true,
    });
    assert.equal(preview.pilotWindow.offset, 2);
    assert.deepEqual(preview.pilotWindow.documentDateSources, ['folder_iso', 'folder_iso']);
    assert.equal(preview.pilotWindowSearch.skipReasonCounts.weak_document_date_source, 2);
    assert.equal(preview.pilotWindowSearch.skippedSamples[0].reason, 'weak_document_date_source');
    assert.equal(preview.pilotWindowSearch.skippedSamples[0].offset, 0);
    assert.equal(preview.stats.strongDateSourceRemaining, 2);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('findConsecutivePilotWindow returnerar null när inget fönster finns', () => {
  const rows = [
    {
      file: {
        driveFileId: 'd1',
        relativePath: 'Hair TP Clinic 2024/Bokade/Åsa/a.pdf',
        fileName: 'a.pdf',
      },
    },
    {
      file: {
        driveFileId: 'd2',
        relativePath: 'Hair TP Clinic 2024/Bokade/Januari 2025/b.pdf',
        fileName: 'b.pdf',
      },
    },
  ];
  assert.equal(findConsecutivePilotWindow(rows, 2), null);
});
