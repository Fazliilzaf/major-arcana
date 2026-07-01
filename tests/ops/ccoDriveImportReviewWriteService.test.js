'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const {
  applyDriveImportReviewDecision,
  applyDriveImportReviewApprove,
  applyDriveImportReviewReassign,
  applyDriveImportReviewReject,
} = require('../../src/ops/ccoDriveImportReviewWriteService');
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

async function makeFixture() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-write-svc-'));
  const assetPath = path.join(projectRoot, 'data', 'cco-patient-assets.json');
  fs.mkdirSync(path.dirname(assetPath), { recursive: true });
  writeCustomers(projectRoot, ['pat-a', 'pat-b']);
  const auditLog = createAudit();
  const store = await createCcoPatientAssetStore({ filePath: assetPath, auditLog });
  const asset = await store.addAsset({
    patientId: 'pat-a',
    sourceSystem: 'drive_import',
    sourceRecordId: 'drive-1',
    originalDriveFileId: 'drive-file-1',
    originalDrivePath: 'Hair TP Clinic 2025/foo/IMG_1.JPG',
    originalFileName: 'IMG_1.JPG',
    storageProvider: 'local',
    storageKey: '2025/foo/IMG_1.JPG',
    checksum: 'sha256:abc123',
    fileSize: 1200,
    mimeType: 'image/jpeg',
    category: 'photo_before',
    confidence: 'high',
    importedBy: 'system',
    importRunId: 'run-1',
  });
  await store.transitionStatus(asset.id, 'NEEDS_REVIEW', { reason: 'needs_photo_review' });
  writeAssetsMirror(projectRoot, { [asset.id]: store.getAsset(asset.id) });
  const config = {
    enableDriveImportReviewWrite: true,
    driveImportReviewCanaryMax: 25,
  };
  return { projectRoot, store, assetId: asset.id, auditLog, config };
}

test('drive import approve moves NEEDS_REVIEW to VISIBLE_ON_PATIENT_CARD with audit', async () => {
  const { projectRoot, store, assetId, auditLog, config } = await makeFixture();
  const before = store.getAsset(assetId);
  const immutable = {
    storageKey: before.storageKey,
    checksum: before.checksum,
    originalFileName: before.originalFileName,
    originalDriveFileId: before.originalDriveFileId,
    originalDrivePath: before.originalDrivePath,
  };

  const result = await applyDriveImportReviewApprove(
    store,
    assetId,
    {
      decision: 'approve',
      reason: 'confirmed suggested patient',
      reviewer: 'tester',
      patientId: 'pat-a',
    },
    {
      projectRoot,
      config,
      auditLog,
      actor: { role: 'operator', userId: 'tester' },
    }
  );

  const after = store.getAsset(assetId);
  assert.equal(result.decision, 'approve');
  assert.equal(after.status, 'VISIBLE_ON_PATIENT_CARD');
  assert.equal(after.patientId, 'pat-a');
  assert.equal(after.storageKey, immutable.storageKey);
  assert.equal(after.checksum, immutable.checksum);
  assert.equal(after.originalDriveFileId, immutable.originalDriveFileId);
  assert.equal(
    auditLog.items.some((e) => e.action === 'drive_import_review.decision'),
    true
  );
  assert.equal(auditLog.items.at(-1).detail.decision, 'approve');

  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test('drive import reassign changes patient and becomes visible', async () => {
  const { projectRoot, store, assetId, auditLog, config } = await makeFixture();

  const result = await applyDriveImportReviewReassign(
    store,
    assetId,
    {
      decision: 'reassign',
      reason: 'wrong folder owner',
      reviewer: 'tester',
      patientId: 'pat-b',
    },
    {
      projectRoot,
      config,
      auditLog,
      actor: { role: 'operator', userId: 'tester' },
    }
  );

  const after = store.getAsset(assetId);
  assert.equal(result.decision, 'reassign');
  assert.equal(after.status, 'VISIBLE_ON_PATIENT_CARD');
  assert.equal(after.patientId, 'pat-b');
  assert.equal(auditLog.items.at(-1).detail.decision, 'reassign');

  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test('drive import reject ends in REJECTED; mark_duplicate ends in DUPLICATE without mutating storage', async () => {
  const { projectRoot, store, assetId, auditLog, config } = await makeFixture();
  const before = store.getAsset(assetId);

  const reject = await applyDriveImportReviewReject(
    store,
    assetId,
    { decision: 'reject', reason: 'not a patient file', reviewer: 'tester' },
    { projectRoot, config, auditLog, actor: { role: 'operator', userId: 'tester' } },
    { duplicate: false }
  );
  assert.equal(reject.decision, 'reject');
  assert.equal(store.getAsset(assetId).status, 'REJECTED');
  assert.equal(store.getAsset(assetId).storageKey, before.storageKey);

  const projectRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-write-svc2-'));
  writeCustomers(projectRoot2, ['pat-a']);
  const assetPath2 = path.join(projectRoot2, 'data', 'cco-patient-assets.json');
  fs.mkdirSync(path.dirname(assetPath2), { recursive: true });
  const audit2 = createAudit();
  const store2 = await createCcoPatientAssetStore({ filePath: assetPath2, auditLog: audit2 });
  const asset2 = await store2.addAsset({
    patientId: 'pat-a',
    sourceSystem: 'drive_import',
    sourceRecordId: 'drive-2',
    originalDriveFileId: 'drive-file-2',
    originalDrivePath: 'Hair TP Clinic 2025/foo/IMG_2.JPG',
    originalFileName: 'IMG_2.JPG',
    storageProvider: 'local',
    storageKey: '2025/foo/IMG_2.JPG',
    checksum: 'sha256:def456',
    fileSize: 900,
    mimeType: 'image/jpeg',
    category: 'photo_before',
    confidence: 'medium',
    importedBy: 'system',
    importRunId: 'run-1',
  });
  await store2.transitionStatus(asset2.id, 'NEEDS_REVIEW');

  const dup = await applyDriveImportReviewReject(
    store2,
    asset2.id,
    { decision: 'mark_duplicate', reason: 'duplicate checksum elsewhere', reviewer: 'tester' },
    {
      projectRoot: projectRoot2,
      config,
      auditLog: audit2,
      actor: { role: 'operator', userId: 'tester' },
    },
    { duplicate: true }
  );
  assert.equal(dup.decision, 'mark_duplicate');
  assert.equal(store2.getAsset(asset2.id).status, 'DUPLICATE');
  assert.equal(audit2.items.at(-1).detail.markedDuplicate, true);

  fs.rmSync(projectRoot, { recursive: true, force: true });
  fs.rmSync(projectRoot2, { recursive: true, force: true });
});

test('drive import write blocked when feature flag off', async () => {
  const { projectRoot, store, assetId, auditLog } = await makeFixture();
  await assert.rejects(
    () =>
      applyDriveImportReviewDecision({
        assetStore: store,
        projectRoot,
        config: { enableDriveImportReviewWrite: false },
        auditLog,
        assetId,
        body: { decision: 'approve', reason: 'x', reviewer: 'tester' },
        actor: { role: 'operator', userId: 'tester' },
      }),
    /drive_import_review_write_disabled/
  );
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test('drive import approve accepts patient id from master store when not in customer directory', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-write-master-'));
  const assetPath = path.join(projectRoot, 'data', 'cco-patient-assets.json');
  fs.mkdirSync(path.dirname(assetPath), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, 'data', 'cco-customers.json'),
    `${JSON.stringify({ tenants: { hair_tp: { customerState: { directory: {} } } } }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(projectRoot, 'data', 'cco-patient-master.json'),
    `${JSON.stringify(
      {
        tenants: {
          hair_tp: {
            patients: [{ id: 'cliento_abc123', displayName: 'Master Patient' }],
            _indexes: { patientById: { cliento_abc123: 0 } },
          },
        },
      },
      null,
      2
    )}\n`
  );
  const auditLog = createAudit();
  const store = await createCcoPatientAssetStore({ filePath: assetPath, auditLog });
  const asset = await store.addAsset({
    patientId: 'cliento_abc123',
    sourceSystem: 'drive_import',
    sourceRecordId: 'drive-m',
    originalDriveFileId: 'd1',
    originalDrivePath: 'Hair TP Clinic 2025/x.pdf',
    originalFileName: 'x.pdf',
    storageProvider: 'local',
    storageKey: '2025/x.pdf',
    checksum: 'sha256:zzz',
    fileSize: 50,
    mimeType: 'application/pdf',
    category: 'other',
    importedBy: 'system',
    importRunId: 'run-1',
  });
  await store.transitionStatus(asset.id, 'NEEDS_REVIEW');
  const config = { enableDriveImportReviewWrite: true, driveImportReviewCanaryMax: 25 };

  const result = await applyDriveImportReviewApprove(
    store,
    asset.id,
    { decision: 'approve', reason: 'master registry ok', reviewer: 'tester' },
    { projectRoot, config, auditLog, actor: { role: 'operator', userId: 'tester' } }
  );
  assert.equal(result.decision, 'approve');
  assert.equal(store.getAsset(asset.id).status, 'VISIBLE_ON_PATIENT_CARD');
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

test('drive import approve rejects unknown patient in directory', async () => {
  const { projectRoot, store, assetId, auditLog, config } = await makeFixture();
  await assert.rejects(
    () =>
      applyDriveImportReviewReassign(
        store,
        assetId,
        {
          decision: 'reassign',
          reason: 'test move',
          reviewer: 'tester',
          patientId: 'missing-patient',
        },
        { projectRoot, config, auditLog, actor: { role: 'operator', userId: 'tester' } }
      ),
    /patient_not_in_directory/
  );
  fs.rmSync(projectRoot, { recursive: true, force: true });
});
