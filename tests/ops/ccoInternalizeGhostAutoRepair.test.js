'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createLocalProvider } = require('../../src/ops/ccoSecureStorageProvider');
const { blobExistsOnStorage } = require('../../src/ops/ccoGhostVisibleAssetDiagnosis');
const {
  autoRepairGhostVisibleAfterInternalize,
  finalizeInternalizeReportWithAutoRepair,
  parseAutoRepairGhostVisible,
} = require('../../src/ops/ccoInternalizeGhostAutoRepair');

async function makeRig() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'internalize-auto-repair-'));
  const assetStore = await createCcoPatientAssetStore({ filePath: path.join(tmp, 'assets.json') });
  const storage = createLocalProvider({ rootPath: path.join(tmp, 'storage') });
  return { tmp, assetStore, storage };
}

test('parseAutoRepairGhostVisible default true, explicit false', () => {
  assert.equal(parseAutoRepairGhostVisible(undefined, true), true);
  assert.equal(parseAutoRepairGhostVisible(false, true), false);
  assert.equal(parseAutoRepairGhostVisible('false', true), false);
  assert.equal(parseAutoRepairGhostVisible('true', false), true);
});

test('autoRepairGhostVisibleAfterInternalize skippar utan duplicates', async () => {
  const rig = await makeRig();
  try {
    const result = await autoRepairGhostVisibleAfterInternalize({
      internalizeReport: { runId: 'run-1', stats: { duplicate: 0, imported: 1 } },
      assetStore: rig.assetStore,
      storage: rig.storage,
    });
    assert.equal(result.triggered, false);
    assert.equal(result.skippedReason, 'no_duplicates');
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('autoRepairGhostVisibleAfterInternalize reparerar ghost efter duplicate-run', async () => {
  const rig = await makeRig();
  try {
    const body = Buffer.from('%PDF-auto-repair');
    const put = await rig.storage.putObject({
      key: '2026/07/auto-repair.pdf',
      body,
      contentType: 'application/pdf',
    });

    const canonical = await rig.assetStore.addAsset({
      patientId: 'pat-auto',
      sourceSystem: 'drive_import',
      originalDriveFileId: 'drive-canonical',
      storageKey: 'missing/auto-repair.pdf',
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'VISIBLE_ON_PATIENT_CARD',
    });

    await rig.assetStore.addAsset({
      patientId: 'pat-auto',
      sourceSystem: 'drive_import',
      importRunId: 'run-auto-repair',
      originalDriveFileId: 'drive-dup',
      storageKey: put.storageKey,
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'DUPLICATE',
    });

    const result = await autoRepairGhostVisibleAfterInternalize({
      internalizeReport: { runId: 'run-auto-repair', stats: { duplicate: 1 } },
      assetStore: rig.assetStore,
      storage: rig.storage,
      actor: { userId: 'test' },
    });

    assert.equal(result.triggered, true);
    assert.equal(result.repair.stats.repaired, 1);

    const fixed = rig.assetStore.getAsset(canonical.id);
    assert.equal(fixed.storageKey, put.storageKey);
    assert.equal(await blobExistsOnStorage(fixed, rig.storage), true);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('finalizeInternalizeReportWithAutoRepair bifogar ghostAutoRepair på report', async () => {
  const rig = await makeRig();
  try {
    const body = Buffer.from('%PDF-finalize');
    const put = await rig.storage.putObject({
      key: '2026/07/finalize.pdf',
      body,
      contentType: 'application/pdf',
    });

    await rig.assetStore.addAsset({
      patientId: 'pat-finalize',
      sourceSystem: 'drive_import',
      originalDriveFileId: 'drive-canonical',
      storageKey: 'missing/finalize.pdf',
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'VISIBLE_ON_PATIENT_CARD',
    });

    await rig.assetStore.addAsset({
      patientId: 'pat-finalize',
      sourceSystem: 'drive_import',
      importRunId: 'run-finalize',
      originalDriveFileId: 'drive-dup',
      storageKey: put.storageKey,
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'DUPLICATE',
    });

    const report = await finalizeInternalizeReportWithAutoRepair({
      report: { runId: 'run-finalize', stats: { duplicate: 1 } },
      assetStore: rig.assetStore,
      storage: rig.storage,
    });

    assert.equal(report.runId, 'run-finalize');
    assert.equal(report.ghostAutoRepair.triggered, true);
    assert.equal(report.ghostAutoRepair.repair.stats.repaired, 1);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});
