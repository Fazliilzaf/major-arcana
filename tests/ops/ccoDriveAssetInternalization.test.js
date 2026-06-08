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
const {
  internalizeDriveAssets,
  inventoryDriveAssets,
  normalizeDriveAssetRow,
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
    const report = inventoryDriveAssets({
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
        return { name: 'Journal Åsa Ärlig Örebro.pdf' };
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
