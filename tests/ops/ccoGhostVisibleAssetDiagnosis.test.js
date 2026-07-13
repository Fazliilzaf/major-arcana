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
  diagnoseGhostVisibleAssetPage,
  blobExistsOnStorage,
  summarizeChecksumInventoryCoverage,
  buildBlobExistenceCache,
} = require('../../src/ops/ccoGhostVisibleAssetDiagnosis');

test('diagnoseGhostVisibleAssetPage scans only requested render-candidate page', async () => {
  const existsCalls = [];
  const items = Array.from({ length: 6 }, (_, index) => ({
    id: `asset-${index}`,
    patientId: 'patient-page',
    status: 'VISIBLE_ON_PATIENT_CARD',
    storageKey: `blob-${index}`,
    checksum: `checksum-${index}`,
    fileSize: 10,
  }));
  const report = await diagnoseGhostVisibleAssetPage({
    assetStore: { listItemsForEnrichment: () => items },
    storage: {
      async exists(key) {
        existsCalls.push(key);
        return false;
      },
    },
    offset: 2,
    pageSize: 2,
    maskSamples: false,
  });

  assert.deepEqual(existsCalls.sort(), ['blob-2', 'blob-3']);
  assert.equal(report.pagination.scanned, 2);
  assert.equal(report.pagination.totalRenderCandidates, 6);
  assert.equal(report.pagination.nextOffset, 4);
  assert.equal(report.stats.ghostRenderCandidates, 2);
  assert.equal(report.stats.missingDriveFileId, 2);
  assert.equal(report.stats.withChecksum, 2);
  assert.deepEqual(report.stats.byStatus, { VISIBLE_ON_PATIENT_CARD: 2 });
});

test('buildBlobExistenceCache deduplicerar storageKey och begränsar parallellismen', async () => {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const storage = {
    async exists() {
      calls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return true;
    },
  };
  const assets = Array.from({ length: 40 }, (_, index) => ({
    storageKey: `blob-${index % 10}`,
    checksum: `checksum-${index}`,
    fileSize: 10,
  }));

  const cache = await buildBlobExistenceCache(assets, storage, 4);

  assert.equal(cache.size, 10);
  assert.equal(calls, 10);
  assert.ok(maxActive <= 4);
  assert.ok(maxActive > 1);
});

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

test('diagnoseGhostVisibleAssets importRunId-filter inkluderar inte orelaterade no-sibling ghosts', async () => {
  const rig = await makeRig();
  try {
    const body = Buffer.from('%PDF-run-filter');
    const put = await rig.storage.putObject({
      key: '2026/07/run-filter.pdf',
      body,
      contentType: 'application/pdf',
    });

    const canonical = await rig.assetStore.addAsset({
      patientId: 'pat-run',
      sourceSystem: 'drive_import',
      originalDriveFileId: 'drive-run-canonical',
      originalFileName: 'run.pdf',
      storageProvider: 'local',
      storageKey: 'missing/run-filter.pdf',
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      documentDate: '2024-03-05',
      status: 'VISIBLE_ON_PATIENT_CARD',
    });

    const duplicate = await rig.assetStore.addAsset({
      patientId: 'pat-run',
      sourceSystem: 'drive_import',
      importRunId: 'target-run',
      originalDriveFileId: 'drive-run-dup',
      originalFileName: 'run.pdf',
      storageProvider: 'local',
      storageKey: put.storageKey,
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      documentDate: '2024-03-05',
      status: 'DUPLICATE',
    });

    await rig.assetStore.addAsset({
      patientId: 'pat-other',
      sourceSystem: 'drive_import',
      originalDriveFileId: 'drive-other',
      originalFileName: 'other.pdf',
      storageProvider: 'local',
      storageKey: 'missing/other.pdf',
      checksum: 'checksum-without-sibling',
      fileSize: 100,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'VISIBLE_ON_PATIENT_CARD',
    });

    const report = await diagnoseGhostVisibleAssets({
      assetStore: rig.assetStore,
      storage: rig.storage,
      importRunId: 'target-run',
      maskSamples: false,
    });

    assert.equal(report.stats.ghostRenderCandidates, 1);
    assert.equal(report.stats.withBlobSibling, 1);
    assert.equal(report.cases.length, 1);
    assert.equal(report.cases[0].canonicalAssetId, canonical.id);
    assert.equal(report.cases[0].duplicateAssetId, duplicate.id);
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
