'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createCcoDriveImportReviewReadRouter,
} = require('../../src/routes/ccoDriveImportReviewRead');
const {
  invalidateDriveImportReviewCache,
} = require('../../src/ops/ccoDriveImportReviewReadService');
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');

const denyAuth = (_req, res) => res.status(401).json({ error: 'Inloggning krävs.' });
const passAuth = (_req, _res, next) => next();
const attachRole = (_req, _res, next) => next();
const allowPerm = () => (_req, _res, next) => next();
const denyPerm = () => (_req, res) => res.status(403).json({ error: 'permission_denied' });

function createAudit() {
  const items = [];
  return {
    items,
    append(event) {
      items.push(event);
    },
  };
}

function writeFixtureProject(dir, { withBinary = true } = {}) {
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const asset = {
    id: 'a1',
    patientId: 'cliento_fixture',
    status: 'NEEDS_REVIEW',
    sourceSystem: 'drive_import',
    sourceRecordId: 'drive-fixture-1',
    originalFileName: 'IMG_1.JPG',
    mimeType: 'image/jpeg',
    category: 'photo_before',
    confidence: 'high',
    originalDrivePath: 'Hair TP Clinic 2025/foo/IMG_1.JPG',
    originalDriveFileId: 'drive-fixture-1',
    storageProvider: 'local',
    storageKey: withBinary ? '2025/foo/IMG_1.JPG' : 'pending-no-binary',
    checksum: withBinary ? 'sha256:abc' : null,
    fileSize: withBinary ? 100 : 0,
    importedBy: 'system',
    importRunId: 'run-fixture',
    statusHistory: [{ reason: 'needs_photo_review' }],
    technicalInfo: { needsPhotoReview: true },
  };
  fs.writeFileSync(
    path.join(dataDir, 'cco-patient-assets.json'),
    `${JSON.stringify({ items: { a1: asset } }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(dataDir, 'cco-customers.json'),
    `${JSON.stringify(
      {
        tenants: {
          hair_tp: {
            customerState: {
              directory: {
                cliento_fixture: { displayName: 'Fixture Patient' },
                cliento_other: { displayName: 'Other Patient' },
              },
            },
          },
        },
      },
      null,
      2
    )}\n`
  );
  invalidateDriveImportReviewCache();
  return asset;
}

async function withFixture(run, opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-write-route-'));
  writeFixtureProject(dir, opts);
  try {
    await run(dir);
  } finally {
    invalidateDriveImportReviewCache();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function mount({
  projectRoot,
  requireCcoAuthenticated,
  requirePermission = allowPerm,
  writeEnabled = false,
  auditLog = null,
  assetStore = null,
}) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1/ops',
    createCcoDriveImportReviewReadRouter({
      projectRoot,
      config: {
        enableDriveImportReviewWrite: writeEnabled,
        driveImportReviewCanaryMax: 50,
      },
      resolveStores: async () => ({ assetStore }),
      auditLog,
      requireCcoAuthenticated,
      attachRole,
      requirePermission,
    })
  );
  return app;
}

async function request(app, method, path, body) {
  const srv = app.listen(0);
  const port = srv.address().port;
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-cco-role': 'operator',
        'x-cco-user': 'route-tester',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally {
    srv.close();
  }
}

test('drive-import-review decide endpoint not mounted when write disabled', async () => {
  await withFixture(async (dir) => {
    const app = mount({ projectRoot: dir, requireCcoAuthenticated: passAuth, writeEnabled: false });
    const res = await request(app, 'POST', '/api/v1/ops/cco/drive-import-review/assets/a1/decide', {
      decision: 'approve',
      reason: 'test reason',
      reviewer: 'route-tester',
    });
    assert.equal(res.status, 404);
  });
});

test('drive-import-review decide returns 403 when permission denied', async () => {
  await withFixture(async (dir) => {
    const app = mount({
      projectRoot: dir,
      requireCcoAuthenticated: passAuth,
      requirePermission: denyPerm,
      writeEnabled: true,
      auditLog: createAudit(),
      assetStore: {},
    });
    const res = await request(app, 'POST', '/api/v1/ops/cco/drive-import-review/assets/a1/decide', {
      decision: 'approve',
      reason: 'test reason',
      reviewer: 'route-tester',
    });
    assert.equal(res.status, 403);
  });
});

test('drive-import-review approve returns 200 and audit when write enabled', async () => {
  await withFixture(async (dir) => {
    const assetPath = path.join(dir, 'data', 'cco-patient-assets.json');
    const auditLog = createAudit();
    const store = await createCcoPatientAssetStore({ filePath: assetPath, auditLog });
    const app = mount({
      projectRoot: dir,
      requireCcoAuthenticated: passAuth,
      writeEnabled: true,
      auditLog,
      assetStore: store,
    });
    const res = await request(app, 'POST', '/api/v1/ops/cco/drive-import-review/assets/a1/decide', {
      decision: 'approve',
      reason: 'confirmed match',
      reviewer: 'route-tester',
      patientId: 'cliento_fixture',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.decision, 'approve');
    assert.equal(body.asset.status, 'VISIBLE_ON_PATIENT_CARD');
    assert.equal(
      auditLog.items.some((e) => e.action === 'drive_import_review.decision'),
      true
    );
  });
});

test('drive-import-review reassign returns 200 with new patient', async () => {
  await withFixture(async (dir) => {
    const assetPath = path.join(dir, 'data', 'cco-patient-assets.json');
    const auditLog = createAudit();
    const store = await createCcoPatientAssetStore({ filePath: assetPath, auditLog });
    const app = mount({
      projectRoot: dir,
      requireCcoAuthenticated: passAuth,
      writeEnabled: true,
      auditLog,
      assetStore: store,
    });
    const res = await request(app, 'POST', '/api/v1/ops/cco/drive-import-review/assets/a1/decide', {
      decision: 'reassign',
      reason: 'wrong folder owner',
      reviewer: 'route-tester',
      patientId: 'cliento_other',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.decision, 'reassign');
    assert.equal(body.asset.patientId, 'cliento_other');
    assert.equal(body.asset.status, 'VISIBLE_ON_PATIENT_CARD');
  });
});

test('drive-import-review reject returns 200 and REJECTED status', async () => {
  await withFixture(async (dir) => {
    const assetPath = path.join(dir, 'data', 'cco-patient-assets.json');
    const auditLog = createAudit();
    const store = await createCcoPatientAssetStore({ filePath: assetPath, auditLog });
    const app = mount({
      projectRoot: dir,
      requireCcoAuthenticated: passAuth,
      writeEnabled: true,
      auditLog,
      assetStore: store,
    });
    const res = await request(app, 'POST', '/api/v1/ops/cco/drive-import-review/assets/a1/decide', {
      decision: 'reject',
      reason: 'ignore this file',
      reviewer: 'route-tester',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.decision, 'reject');
    assert.equal(body.asset.status, 'REJECTED');
  });
});

test('drive-import-review mark_duplicate returns 200 and DUPLICATE status', async () => {
  await withFixture(async (dir) => {
    const assetPath = path.join(dir, 'data', 'cco-patient-assets.json');
    const auditLog = createAudit();
    const store = await createCcoPatientAssetStore({ filePath: assetPath, auditLog });
    const app = mount({
      projectRoot: dir,
      requireCcoAuthenticated: passAuth,
      writeEnabled: true,
      auditLog,
      assetStore: store,
    });
    const res = await request(app, 'POST', '/api/v1/ops/cco/drive-import-review/assets/a1/decide', {
      decision: 'mark_duplicate',
      reason: 'duplicate checksum elsewhere',
      reviewer: 'route-tester',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.decision, 'mark_duplicate');
    assert.equal(body.asset.status, 'DUPLICATE');
    assert.equal(store.getAsset('a1').status, 'DUPLICATE');
  });
});

test('anonymous POST decide is rejected (401)', async () => {
  await withFixture(async (dir) => {
    const app = mount({ projectRoot: dir, requireCcoAuthenticated: denyAuth, writeEnabled: true });
    const res = await request(app, 'POST', '/api/v1/ops/cco/drive-import-review/assets/a1/decide', {
      decision: 'reject',
      reason: 'ignore',
      reviewer: 'x',
    });
    assert.equal(res.status, 401);
  });
});

test('summary reflects writeEnabled flag', async () => {
  await withFixture(async (dir) => {
    const app = mount({ projectRoot: dir, requireCcoAuthenticated: passAuth, writeEnabled: true });
    const res = await request(app, 'GET', '/api/v1/ops/cco/drive-import-review/summary');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.writeEnabled, true);
    assert.equal(body.phase, 'R2_canary');
  });
});

test('batch preview and confirm routes work when write enabled', async () => {
  await withFixture(async (dir) => {
    const dataDir = path.join(dir, 'data');
    const second = {
      id: 'a2',
      patientId: 'cliento_fixture',
      status: 'NEEDS_REVIEW',
      sourceSystem: 'drive_import',
      sourceRecordId: 'drive-fixture-2',
      originalFileName: 'IMG_2.JPG',
      mimeType: 'image/jpeg',
      category: 'photo_before',
      confidence: 'high',
      originalDrivePath: 'Hair TP Clinic 2025/foo/IMG_2.JPG',
      originalDriveFileId: 'drive-fixture-2',
      storageProvider: 'local',
      storageKey: '2025/foo/IMG_2.JPG',
      checksum: 'sha256:def',
      fileSize: 100,
      importedBy: 'system',
      importRunId: 'run-fixture',
      statusHistory: [{ reason: 'needs_photo_review' }],
      technicalInfo: { needsPhotoReview: true },
    };
    const parsed = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'cco-patient-assets.json'), 'utf8')
    );
    parsed.items.a2 = second;
    fs.writeFileSync(
      path.join(dataDir, 'cco-patient-assets.json'),
      `${JSON.stringify(parsed, null, 2)}\n`
    );
    invalidateDriveImportReviewCache();

    const assetPath = path.join(dir, 'data', 'cco-patient-assets.json');
    const auditLog = createAudit();
    const store = await createCcoPatientAssetStore({ filePath: assetPath, auditLog });
    const app = mount({
      projectRoot: dir,
      requireCcoAuthenticated: passAuth,
      writeEnabled: true,
      auditLog,
      assetStore: store,
    });

    const previewRes = await request(
      app,
      'POST',
      '/api/v1/ops/cco/drive-import-review/batches/preview',
      {
        assetIds: ['a1', 'a2'],
        decision: 'approve',
        reason: 'batch approve route',
        reviewer: 'route-tester',
      }
    );
    assert.equal(previewRes.status, 200);
    const preview = await previewRes.json();
    assert.equal(preview.canCommit, true);
    assert.ok(preview.previewToken);

    const confirmRes = await request(
      app,
      'POST',
      '/api/v1/ops/cco/drive-import-review/batches/confirm',
      { previewToken: preview.previewToken }
    );
    assert.equal(confirmRes.status, 200);
    const confirmed = await confirmRes.json();
    assert.equal(confirmed.assetCount, 2);
    assert.equal(store.getAsset('a1').status, 'VISIBLE_ON_PATIENT_CARD');
    assert.equal(store.getAsset('a2').status, 'VISIBLE_ON_PATIENT_CARD');
    assert.equal(
      auditLog.items.filter((e) => e.action === 'drive_import_review.decision').length,
      2
    );
    assert.ok(auditLog.items.some((e) => e.action === 'drive_import_review.batch_committed'));
  });
});

test('batch preview route returns 409 for mixed batch', async () => {
  await withFixture(async (dir) => {
    const dataDir = path.join(dir, 'data');
    const parsed = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'cco-patient-assets.json'), 'utf8')
    );
    parsed.items.a2 = {
      ...parsed.items.a1,
      id: 'a2',
      patientId: 'cliento_other',
      sourceRecordId: 'drive-fixture-2',
      originalDriveFileId: 'drive-fixture-2',
      originalFileName: 'IMG_2.JPG',
      storageKey: '2025/foo/IMG_2.JPG',
      checksum: 'sha256:def',
    };
    fs.writeFileSync(
      path.join(dataDir, 'cco-patient-assets.json'),
      `${JSON.stringify(parsed, null, 2)}\n`
    );
    invalidateDriveImportReviewCache();

    const assetPath = path.join(dir, 'data', 'cco-patient-assets.json');
    const store = await createCcoPatientAssetStore({
      filePath: assetPath,
      auditLog: createAudit(),
    });
    const app = mount({
      projectRoot: dir,
      requireCcoAuthenticated: passAuth,
      writeEnabled: true,
      auditLog: createAudit(),
      assetStore: store,
    });

    const res = await request(app, 'POST', '/api/v1/ops/cco/drive-import-review/batches/preview', {
      assetIds: ['a1', 'a2'],
      decision: 'approve',
      reason: 'mixed batch',
      reviewer: 'route-tester',
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'batch_not_homogeneous');
  });
});

test('batch routes not mounted when write disabled', async () => {
  await withFixture(async (dir) => {
    const app = mount({ projectRoot: dir, requireCcoAuthenticated: passAuth, writeEnabled: false });
    const res = await request(app, 'POST', '/api/v1/ops/cco/drive-import-review/batches/preview', {
      assetIds: ['a1'],
      decision: 'approve',
      reason: 'should fail',
      reviewer: 'route-tester',
    });
    assert.equal(res.status, 404);
  });
});
