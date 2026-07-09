'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createLocalProvider } = require('../../src/ops/ccoSecureStorageProvider');
const { blobExistsOnStorage } = require('../../src/ops/ccoGhostVisibleAssetDiagnosis');
const { repairGhostVisibleAssets } = require('../../src/ops/ccoGhostVisibleAssetRepair');

async function makeRig() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ghost-visible-repair-'));
  const assetStore = await createCcoPatientAssetStore({ filePath: path.join(tmp, 'assets.json') });
  const storage = createLocalProvider({ rootPath: path.join(tmp, 'storage') });
  return { tmp, assetStore, storage };
}

async function seedGhostPair(rig, { importRunId = 'run-repair-1' } = {}) {
  const body = Buffer.from('%PDF-ghost-repair');
  const put = await rig.storage.putObject({
    key: '2026/07/repair.pdf',
    body,
    contentType: 'application/pdf',
  });

  const canonical = await rig.assetStore.addAsset({
    patientId: 'pat-repair',
    sourceSystem: 'drive_import',
    originalDriveFileId: 'drive-canonical',
    originalFileName: 'journal.pdf',
    storageProvider: 'local',
    storageKey: 'missing/repair.pdf',
    checksum: put.checksum,
    fileSize: body.length,
    mimeType: 'application/pdf',
    category: 'journal',
    documentDate: '2024-02-05',
    status: 'VISIBLE_ON_PATIENT_CARD',
  });

  const duplicate = await rig.assetStore.addAsset({
    patientId: 'pat-repair',
    sourceSystem: 'drive_import',
    importRunId,
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

  return { canonical, duplicate, put };
}

test('reattachGhostVisibleBlobFromSibling kopierar blob-pekare till canonical', async () => {
  const rig = await makeRig();
  try {
    const { canonical, duplicate, put } = await seedGhostPair(rig);
    assert.equal(await blobExistsOnStorage(canonical, rig.storage), false);

    const updated = await rig.assetStore.reattachGhostVisibleBlobFromSibling(
      canonical.id,
      duplicate.id,
      { storage: rig.storage, actor: { userId: 'test' }, reason: 'unit_test' }
    );

    assert.equal(updated.storageKey, put.storageKey);
    assert.equal(updated.checksum, put.checksum);
    assert.equal(updated.status, 'VISIBLE_ON_PATIENT_CARD');
    assert.equal(await blobExistsOnStorage(updated, rig.storage), true);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('repairGhostVisibleAssets dryRun skriver inte', async () => {
  const rig = await makeRig();
  try {
    const { canonical } = await seedGhostPair(rig);
    const before = rig.assetStore.getAsset(canonical.id);
    const report = await repairGhostVisibleAssets({
      assetStore: rig.assetStore,
      storage: rig.storage,
      importRunId: 'run-repair-1',
      dryRun: true,
    });

    assert.equal(report.zeroWrites, true);
    assert.equal(report.stats.repairable, 1);
    assert.equal(report.stats.wouldRepair, 1);
    assert.equal(report.stats.repaired, 0);

    const after = rig.assetStore.getAsset(canonical.id);
    assert.equal(after.storageKey, before.storageKey);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('repairGhostVisibleAssets commit reparerar ghost + sibling kvar', async () => {
  const rig = await makeRig();
  try {
    const { canonical, duplicate } = await seedGhostPair(rig);
    const report = await repairGhostVisibleAssets({
      assetStore: rig.assetStore,
      storage: rig.storage,
      importRunId: 'run-repair-1',
      dryRun: false,
      actor: { userId: 'test' },
    });

    assert.equal(report.stats.repaired, 1);
    assert.equal(report.stats.failed, 0);

    const fixed = rig.assetStore.getAsset(canonical.id);
    const dup = rig.assetStore.getAsset(duplicate.id);
    assert.equal(await blobExistsOnStorage(fixed, rig.storage), true);
    assert.equal(await blobExistsOnStorage(dup, rig.storage), true);
    assert.equal(dup.status, 'DUPLICATE');
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('reattachGhostVisibleBlobFromSibling blockerar cross-patient', async () => {
  const rig = await makeRig();
  try {
    const body = Buffer.from('%PDF-cross');
    const put = await rig.storage.putObject({
      key: '2026/07/cross.pdf',
      body,
      contentType: 'application/pdf',
    });

    const canonical = await rig.assetStore.addAsset({
      patientId: 'pat-a',
      sourceSystem: 'drive_import',
      storageKey: 'missing/cross.pdf',
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'VISIBLE_ON_PATIENT_CARD',
    });

    const sibling = await rig.assetStore.addAsset({
      patientId: 'pat-b',
      sourceSystem: 'drive_import',
      storageKey: put.storageKey,
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'DUPLICATE',
    });

    await assert.rejects(
      () =>
        rig.assetStore.reattachGhostVisibleBlobFromSibling(canonical.id, sibling.id, {
          storage: rig.storage,
        }),
      (err) => err.statusCode === 409
    );
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});
