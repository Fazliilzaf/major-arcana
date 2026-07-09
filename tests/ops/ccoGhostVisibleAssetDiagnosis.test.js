'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createLocalProvider } = require('../../src/ops/ccoSecureStorageProvider');
const {
  diagnoseGhostVisibleAssets,
  blobExistsOnStorage,
  summarizeChecksumInventoryCoverage,
} = require('../../src/ops/ccoGhostVisibleAssetDiagnosis');

async function makeRig() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ghost-visible-diagnose-'));
  const assetStore = await createCcoPatientAssetStore({ filePath: path.join(tmp, 'assets.json') });
  const storage = createLocalProvider({ rootPath: path.join(tmp, 'storage') });
  return { tmp, assetStore, storage };
}

test('diagnoseGhostVisibleAssets hittar VISIBLE utan blob + DUPLICATE-sibling med blob', async () => {
  const rig = await makeRig();
  try {
    const body = Buffer.from('%PDF-ghost-test');
    const put = await rig.storage.putObject({
      key: '2026/07/ghost.pdf',
      body,
      contentType: 'application/pdf',
    });

    const canonical = await rig.assetStore.addAsset({
      patientId: 'pat-ghost',
      sourceSystem: 'drive_import',
      originalDriveFileId: 'drive-canonical',
      originalFileName: 'journal.pdf',
      storageProvider: 'local',
      storageKey: 'missing/ghost.pdf',
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      documentDate: '2024-02-05',
      status: 'VISIBLE_ON_PATIENT_CARD',
    });

    const duplicate = await rig.assetStore.addAsset({
      patientId: 'pat-ghost',
      sourceSystem: 'drive_import',
      importRunId: 'run-dedupe-1',
      originalDriveFileId: 'drive-dup',
      originalFileName: 'journal.pdf',
      storageProvider: 'local',
      storageKey: put.storageKey,
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      documentDate: '2024-02-05',
      status: 'DUPLICATE',
    });

    assert.equal(await blobExistsOnStorage(canonical, rig.storage), false);
    assert.equal(await blobExistsOnStorage(duplicate, rig.storage), true);

    const report = await diagnoseGhostVisibleAssets({
      assetStore: rig.assetStore,
      storage: rig.storage,
      importRunId: 'run-dedupe-1',
      maskSamples: false,
    });

    assert.equal(report.zeroWrites, true);
    assert.equal(report.stats.withBlobSibling, 1);
    assert.equal(report.cases.length, 1);
    assert.equal(report.cases[0].canonicalAssetId, canonical.id);
    assert.equal(report.cases[0].duplicateAssetId, duplicate.id);
    assert.equal(report.cases[0].siblingDownloadLikely200, true);
    assert.equal(report.cases[0].bundleDownloadWould404, true);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('diagnoseGhostVisibleAssets filtrerar bort VISIBLE med fungerande blob', async () => {
  const rig = await makeRig();
  try {
    const body = Buffer.from('%PDF-ok');
    const put = await rig.storage.putObject({
      key: '2026/07/ok.pdf',
      body,
      contentType: 'application/pdf',
    });

    await rig.assetStore.addAsset({
      patientId: 'pat-ok',
      sourceSystem: 'drive_import',
      originalDriveFileId: 'drive-ok',
      originalFileName: 'ok.pdf',
      storageProvider: 'local',
      storageKey: put.storageKey,
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'VISIBLE_ON_PATIENT_CARD',
    });

    const report = await diagnoseGhostVisibleAssets({
      assetStore: rig.assetStore,
      storage: rig.storage,
      maskSamples: false,
    });

    assert.equal(report.stats.ghostRenderCandidates, 0);
    assert.equal(report.cases.length, 0);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('summarizeChecksumInventoryCoverage räknar checksum vs driveFileId index', async () => {
  const rig = await makeRig();
  try {
    const body = Buffer.from('%PDF-index');
    const put = await rig.storage.putObject({
      key: '2026/07/index.pdf',
      body,
      contentType: 'application/pdf',
    });

    await rig.assetStore.addAsset({
      patientId: 'pat-index',
      sourceSystem: 'drive_import',
      originalDriveFileId: 'drive-index',
      storageProvider: 'local',
      storageKey: put.storageKey,
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'DUPLICATE',
    });

    const summary = await summarizeChecksumInventoryCoverage({
      assetStore: rig.assetStore,
      storage: rig.storage,
    });

    assert.equal(summary.verifiedBlobAssets, 1);
    assert.equal(summary.uniqueChecksumsWithBlob, 1);
    assert.equal(summary.uniqueDriveFileIdsWithBlob, 1);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});
