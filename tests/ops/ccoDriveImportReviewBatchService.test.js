'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const {
  previewDriveImportReviewBatch,
  confirmDriveImportReviewBatch,
  BATCH_MAX_ASSETS,
  resolvePreviewStorePath,
} = require('../../src/ops/ccoDriveImportReviewBatchService');
const {
  invalidateDriveImportReviewCache,
} = require('../../src/ops/ccoDriveImportReviewReadService');

function createAudit() {
  const items = [];
  return {
    items,
    append(event) {
      items.push(event);
    },
  };
}

function writeCustomers(projectRoot, ids) {
  const dataDir = path.join(projectRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const directory = {};
  for (const id of ids) {
    directory[id] = { displayName: `Patient ${id}` };
  }
  fs.writeFileSync(
    path.join(dataDir, 'cco-customers.json'),
    `${JSON.stringify({ tenants: { hair_tp: { customerState: { directory } } } }, null, 2)}\n`
  );
}

function writeAssetsMirror(projectRoot, items) {
  const dataDir = path.join(projectRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'cco-patient-assets.json'),
    `${JSON.stringify({ items }, null, 2)}\n`
  );
  invalidateDriveImportReviewCache();
}

async function addHomogeneousAsset(store, idx, patientId = 'pat-a') {
  const asset = await store.addAsset({
    patientId,
    sourceSystem: 'drive_import',
    sourceRecordId: `drive-${idx}`,
    originalDriveFileId: `drive-file-${idx}`,
    originalDrivePath: `Hair TP Clinic 2025/foo/IMG_${idx}.JPG`,
    originalFileName: `IMG_${idx}.JPG`,
    storageProvider: 'local',
    storageKey: `2025/foo/IMG_${idx}.JPG`,
    checksum: `sha256:abc${idx}`,
    fileSize: 1200 + idx,
    mimeType: 'image/jpeg',
    category: 'photo_before',
    confidence: 'high',
    importedBy: 'system',
    importRunId: 'run-1',
    technicalInfo: { needsPhotoReview: true },
  });
  await store.transitionStatus(asset.id, 'NEEDS_REVIEW', { reason: 'needs_photo_review' });
  return asset;
}

async function makeBatchFixture(count = 2) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-batch-svc-'));
  const assetPath = path.join(projectRoot, 'data', 'cco-patient-assets.json');
  fs.mkdirSync(path.dirname(assetPath), { recursive: true });
  writeCustomers(projectRoot, ['pat-a', 'pat-b']);
  const auditLog = createAudit();
  const store = await createCcoPatientAssetStore({ filePath: assetPath, auditLog });
  const assets = [];
  for (let i = 0; i < count; i += 1) {
    assets.push(await addHomogeneousAsset(store, i + 1));
  }
  writeAssetsMirror(
    projectRoot,
    Object.fromEntries(assets.map((asset) => [asset.id, store.getAsset(asset.id)]))
  );
  const config = {
    enableDriveImportReviewWrite: true,
    driveImportReviewCanaryMax: 50,
  };
  return { projectRoot, store, assets, auditLog, config };
}

function batchBody(assetIds, decision = 'approve', suffix = '') {
  return {
    assetIds,
    decision,
    reviewer: 'reviewer.batch',
    reason: `batch reason ${suffix}`.trim(),
  };
}

test('batch preview returns token without mutating assets', async () => {
  const { projectRoot, store, assets, config } = await makeBatchFixture(2);
  const beforeStatuses = assets.map((asset) => store.getAsset(asset.id).status);

  const preview = await previewDriveImportReviewBatch({
    assetStore: store,
    projectRoot,
    config,
    body: batchBody(assets.map((a) => a.id)),
    actor: { role: 'operator', userId: 'reviewer.batch' },
  });

  assert.equal(preview.canCommit, true);
  assert.equal(preview.okCount, 2);
  assert.equal(preview.readOnly, true);
  assert.ok(preview.previewToken);
  assert.ok(preview.batchId);
  assert.equal(preview.homogeneity.suggestedPatientId, 'pat-a');
  assert.equal(preview.homogeneity.confidence, 'high');
  assert.equal(preview.homogeneity.matchBasis, 'needs_photo_review');

  for (let i = 0; i < assets.length; i += 1) {
    assert.equal(store.getAsset(assets[i].id).status, beforeStatuses[i]);
  }
  assert.ok(fs.existsSync(resolvePreviewStorePath(projectRoot)));
});

test('batch confirm approve commits all assets with batchId audit', async () => {
  const { projectRoot, store, assets, auditLog, config } = await makeBatchFixture(2);
  const preview = await previewDriveImportReviewBatch({
    assetStore: store,
    projectRoot,
    config,
    body: batchBody(assets.map((a) => a.id)),
    actor: { role: 'operator', userId: 'reviewer.batch' },
  });

  const result = await confirmDriveImportReviewBatch({
    assetStore: store,
    projectRoot,
    config,
    auditLog,
    body: { previewToken: preview.previewToken },
    actor: { role: 'operator', userId: 'reviewer.batch' },
  });

  assert.equal(result.batchId, preview.batchId);
  assert.equal(result.assetCount, 2);
  for (const asset of assets) {
    const updated = store.getAsset(asset.id);
    assert.equal(updated.status, 'VISIBLE_ON_PATIENT_CARD');
    assert.equal(updated.patientId, 'pat-a');
  }

  const decisionAudits = auditLog.items.filter((e) => e.action === 'drive_import_review.decision');
  assert.equal(decisionAudits.length, 2);
  for (const entry of decisionAudits) {
    assert.equal(entry.detail.batchId, preview.batchId);
    assert.equal(entry.detail.storageKeyUnchanged, true);
  }
  const batchAudit = auditLog.items.find((e) => e.action === 'drive_import_review.batch_committed');
  assert.ok(batchAudit);
  assert.equal(batchAudit.detail.batchId, preview.batchId);
});

test('batch confirm mark_duplicate sets DUPLICATE status', async () => {
  const { projectRoot, store, assets, auditLog, config } = await makeBatchFixture(2);
  const preview = await previewDriveImportReviewBatch({
    assetStore: store,
    projectRoot,
    config,
    body: batchBody(
      assets.map((a) => a.id),
      'mark_duplicate',
      'dup'
    ),
    actor: { role: 'operator', userId: 'reviewer.batch' },
  });

  await confirmDriveImportReviewBatch({
    assetStore: store,
    projectRoot,
    config,
    auditLog,
    body: { previewToken: preview.previewToken },
    actor: { role: 'operator', userId: 'reviewer.batch' },
  });

  for (const asset of assets) {
    assert.equal(store.getAsset(asset.id).status, 'DUPLICATE');
  }
});

test('mixed batch rejected at preview with batch_not_homogeneous', async () => {
  const { projectRoot, store, assets, config } = await makeBatchFixture(1);
  const mixed = await addHomogeneousAsset(store, 99, 'pat-b');
  writeAssetsMirror(projectRoot, {
    [assets[0].id]: store.getAsset(assets[0].id),
    [mixed.id]: store.getAsset(mixed.id),
  });

  await assert.rejects(
    () =>
      previewDriveImportReviewBatch({
        assetStore: store,
        projectRoot,
        config,
        body: batchBody([assets[0].id, mixed.id]),
        actor: { role: 'operator', userId: 'reviewer.batch' },
      }),
    (err) => {
      assert.equal(err.message, 'batch_not_homogeneous');
      assert.equal(err.statusCode, 409);
      return true;
    }
  );
});

test('batch over max limit rejected', async () => {
  const ids = Array.from({ length: BATCH_MAX_ASSETS + 1 }, (_, i) => `asset-${i}`);
  await assert.rejects(
    () =>
      previewDriveImportReviewBatch({
        assetStore: { getAsset: () => null },
        projectRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'dir-batch-max-')),
        config: { enableDriveImportReviewWrite: true },
        body: batchBody(ids),
        actor: { role: 'operator', userId: 'reviewer.batch' },
      }),
    (err) => {
      assert.equal(err.message, 'batch_too_large');
      assert.equal(err.detail.max, BATCH_MAX_ASSETS);
      return true;
    }
  );
});

test('batch confirm preserves storage invariants', async () => {
  const { projectRoot, store, assets, auditLog, config } = await makeBatchFixture(2);
  const immutableBefore = assets.map((asset) => {
    const row = store.getAsset(asset.id);
    return {
      assetId: asset.id,
      storageKey: row.storageKey,
      checksum: row.checksum,
      originalDriveFileId: row.originalDriveFileId,
      originalDrivePath: row.originalDrivePath,
      originalFileName: row.originalFileName,
    };
  });

  const preview = await previewDriveImportReviewBatch({
    assetStore: store,
    projectRoot,
    config,
    body: batchBody(assets.map((a) => a.id)),
    actor: { role: 'operator', userId: 'reviewer.batch' },
  });

  await confirmDriveImportReviewBatch({
    assetStore: store,
    projectRoot,
    config,
    auditLog,
    body: { previewToken: preview.previewToken },
    actor: { role: 'operator', userId: 'reviewer.batch' },
  });

  for (const before of immutableBefore) {
    const after = store.getAsset(before.assetId);
    assert.equal(after.storageKey, before.storageKey);
    assert.equal(after.checksum, before.checksum);
    assert.equal(after.originalDriveFileId, before.originalDriveFileId);
    assert.equal(after.originalDrivePath, before.originalDrivePath);
    assert.equal(after.originalFileName, before.originalFileName);
  }
});

test('batch write disabled returns 403', async () => {
  const { projectRoot, store, assets } = await makeBatchFixture(1);
  await assert.rejects(
    () =>
      previewDriveImportReviewBatch({
        assetStore: store,
        projectRoot,
        config: { enableDriveImportReviewWrite: false },
        body: batchBody([assets[0].id]),
        actor: { role: 'operator', userId: 'reviewer.batch' },
      }),
    (err) => err.message === 'drive_import_review_write_disabled'
  );
});
