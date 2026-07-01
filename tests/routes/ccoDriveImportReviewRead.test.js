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

const denyAuth = (_req, res) => res.status(401).json({ error: 'Inloggning krävs.' });
const passAuth = (_req, _res, next) => next();
const attachRole = (_req, _res, next) => next();
const allowPerm = () => (_req, _res, next) => next();

function writeFixtureAssets(dir) {
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const assetsPath = path.join(dataDir, 'cco-patient-assets.json');
  fs.writeFileSync(
    assetsPath,
    `${JSON.stringify(
      {
        items: {
          a1: {
            id: 'a1',
            status: 'NEEDS_REVIEW',
            sourceSystem: 'drive_import',
            patientId: 'cliento_fixture',
            originalFileName: 'IMG_1.JPG',
            mimeType: 'image/jpeg',
            category: 'photo_before',
            confidence: 'high',
            originalDrivePath: 'Hair TP Clinic 2025/foo/IMG_1.JPG',
            originalDriveFileId: 'drive-fixture-1',
            statusHistory: [{ reason: 'needs_photo_review' }],
            technicalInfo: { needsPhotoReview: true },
          },
        },
      },
      null,
      2
    )}\n`
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
  return assetsPath;
}

async function withFixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-review-route-'));
  writeFixtureAssets(dir);
  try {
    await run(dir);
  } finally {
    invalidateDriveImportReviewCache();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function mount({ projectRoot, requireCcoAuthenticated, requirePermission = allowPerm }) {
  const app = express();
  app.use(
    '/api/v1/ops',
    createCcoDriveImportReviewReadRouter({
      projectRoot,
      requireCcoAuthenticated,
      attachRole,
      requirePermission,
    })
  );
  return app;
}

async function get(app, path) {
  const srv = app.listen(0);
  const port = srv.address().port;
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`);
  } finally {
    srv.close();
  }
}

test('drive-import-review router requires auth middleware', () => {
  assert.throws(
    () =>
      createCcoDriveImportReviewReadRouter({
        projectRoot: os.tmpdir(),
        attachRole,
        requirePermission: allowPerm,
      }),
    /requireCcoAuthenticated/
  );
});

test('anonymous GET summary is rejected (401)', async () => {
  await withFixture(async (dir) => {
    const app = mount({ projectRoot: dir, requireCcoAuthenticated: denyAuth });
    const r = await get(app, '/api/v1/ops/cco/drive-import-review/summary');
    assert.equal(r.status, 401);
  });
});

test('anonymous GET queue is rejected (401)', async () => {
  await withFixture(async (dir) => {
    const app = mount({ projectRoot: dir, requireCcoAuthenticated: denyAuth });
    const r = await get(app, '/api/v1/ops/cco/drive-import-review/queue?limit=1');
    assert.equal(r.status, 401);
  });
});

test('authenticated GET summary returns 200 read-only payload', async () => {
  await withFixture(async (dir) => {
    const app = mount({ projectRoot: dir, requireCcoAuthenticated: passAuth });
    const r = await get(app, '/api/v1/ops/cco/drive-import-review/summary');
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.writeEnabled, false);
    assert.equal(body.phase, 'R1_readonly');
    assert.equal(body.totalNeedsReview, 1);
    assert.ok(Array.isArray(body.rules));
  });
});

test('authenticated GET queue returns 200 with fixture item', async () => {
  await withFixture(async (dir) => {
    const app = mount({ projectRoot: dir, requireCcoAuthenticated: passAuth });
    const r = await get(app, '/api/v1/ops/cco/drive-import-review/queue?limit=10');
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.readOnly, true);
    assert.equal(body.writeEnabled, false);
    assert.equal(body.total, 1);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].assetId, 'a1');
    assert.equal(body.items[0].suggestedPatientLabel, 'Fixture Patient');
  });
});
