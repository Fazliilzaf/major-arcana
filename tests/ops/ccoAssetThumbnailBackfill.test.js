'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createLocalProvider } = require('../../src/ops/ccoSecureStorageProvider');
const { backfillAssetThumbnails } = require('../../src/ops/ccoAssetThumbnailBackfill');

async function makeJpegBuffer() {
  const sharp = require('sharp');
  return sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 20, g: 120, b: 180 },
    },
  })
    .jpeg()
    .toBuffer();
}

test('ORD-43: thumbnail-backfill är idempotent för befintliga JPEG-assets', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-thumb-backfill-'));
  try {
    const assetStore = await createCcoPatientAssetStore({
      filePath: path.join(tmp, 'assets.json'),
    });
    const storage = createLocalProvider({ rootPath: path.join(tmp, 'storage') });
    const put = await storage.putObject({
      body: await makeJpegBuffer(),
      contentType: 'image/jpeg',
      metadata: {
        patientId: 'patient-1',
        originalFileName: 'foto.jpg',
        documentDate: '2026-06-09',
      },
    });
    const asset = await assetStore.addAsset({
      patientId: 'patient-1',
      sourceSystem: 'drive_import',
      sourceRecordId: 'drive-photo-1',
      originalDriveFileId: 'drive-photo-1',
      originalFileName: 'foto.jpg',
      storageProvider: 'local',
      storageKey: put.storageKey,
      checksum: put.checksum,
      fileSize: put.size,
      mimeType: 'image/jpeg',
      category: 'photo_during',
      status: 'NEEDS_REVIEW',
    });

    const first = await backfillAssetThumbnails({
      assetStore,
      storage,
      dryRun: false,
      limit: 10,
    });
    assert.equal(first.stats.created, 1);
    assert.equal(first.stats.failed, 0);
    const updated = assetStore.getAsset(asset.id);
    assert.ok(updated.thumbnailKey);

    const second = await backfillAssetThumbnails({
      assetStore,
      storage,
      dryRun: false,
      limit: 10,
    });
    assert.equal(second.stats.created, 0);
    assert.equal(second.stats.candidates, 0);
    assert.equal(second.stats.skipped, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
