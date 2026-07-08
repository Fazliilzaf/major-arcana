'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientMasterRouter } = require('../../src/routes/ccoPatientMaster');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createCcoAssetImportRunStore } = require('../../src/ops/ccoAssetImportRunStore');
const { createCcoAssetReviewQueueStore } = require('../../src/ops/ccoAssetReviewQueueStore');
const { createLocalProvider } = require('../../src/ops/ccoSecureStorageProvider');

const TENANT = 'hair-tp-clinic';

function patientMasterState() {
  return {
    version: 1,
    tenants: {
      [TENANT]: {
        patients: [
          {
            id: 'patient-dino',
            displayName: 'Dino Placo',
            matchStatus: 'matched',
            drive: {
              attachments: [
                {
                  id: 'idx-drive-1',
                  driveFileId: 'drive-file-1',
                  fileName: 'legacy-name.pdf',
                  relativePath: 'Hair TP Clinic 2024/Bokade/2024-05-17 PRP 2/legacy-name.pdf',
                  mimeType: 'application/pdf',
                },
              ],
            },
          },
        ],
      },
    },
  };
}

function fakeAuthStore(role = 'OWNER') {
  const events = [];
  return {
    events,
    requireAuth(req, _res, next) {
      req.auth = {
        tenantId: TENANT,
        userId: role === 'OWNER' ? 'owner-user' : 'staff-user',
        role,
      };
      req.currentUser = {
        id: req.auth.userId,
        email: `${role.toLowerCase()}@example.test`,
        displayName: role,
      };
      req.currentMembership = { tenantId: TENANT, role };
      next();
    },
    async addAuditEvent(event) {
      events.push(event);
      return event;
    },
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.auth?.role)) return next();
    return res.status(403).json({ error: 'permission_denied' });
  };
}

async function makeFixture({ role = 'OWNER', createDriveInternalizationClient = null } = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-pm-internalize-route-'));
  const authStore = fakeAuthStore(role);
  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: path.join(tmp, 'patient-master.json'),
  });
  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(tmp, 'assets.json'),
  });
  const importRunStore = await createCcoAssetImportRunStore({
    filePath: path.join(tmp, 'runs.json'),
  });
  const reviewQueueStore = await createCcoAssetReviewQueueStore({
    filePath: path.join(tmp, 'review.json'),
  });
  const storage = createLocalProvider({ rootPath: path.join(tmp, 'storage') });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoPatientMasterRouter({
      patientMasterStore,
      authStore,
      config: { defaultTenantId: TENANT },
      requireAuth: authStore.requireAuth.bind(authStore),
      requireRole,
      resolveAssetStores: async () => ({
        assetStore,
        importRunStore,
        reviewQueueStore,
        secureStorage: storage,
      }),
      loadPatientMasterState: async () => patientMasterState(),
      createDriveInternalizationClient,
    })
  );
  return { tmp, app, authStore, assetStore, importRunStore, reviewQueueStore };
}

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function postJson(base, body) {
  const res = await fetch(`${base}/api/v1/cco-patient-master/assets/internalize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

async function postPreviewJson(base, body) {
  const res = await fetch(
    `${base}/api/v1/cco-patient-master/assets/internalize/preview-candidates`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    }
  );
  const json = await res.json();
  return { status: res.status, body: json };
}

test('assets/internalize finns och dryRun default skriver inte assets/import-runs', async () => {
  let driveFactoryCalled = 0;
  const fixture = await makeFixture({
    createDriveInternalizationClient: () => {
      driveFactoryCalled += 1;
      throw new Error('Drive ska inte användas i dry-run.');
    },
  });
  try {
    await withServer(fixture.app, async (base) => {
      const res = await postJson(base, {});
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.dryRun, true);
      assert.equal(res.body.rowsCollected, 1);
      assert.equal(res.body.report.zeroWrites, true);
      assert.equal(res.body.report.remaining.count, 1);
      assert.equal(res.body.report.remainingRows, undefined);
      assert.equal(driveFactoryCalled, 0);
      assert.equal(fixture.assetStore.listItemsForEnrichment().length, 0);
      assert.equal(fixture.importRunStore.stats().total, 0);
      assert.equal(fixture.authStore.events.length, 1);
      assert.equal(fixture.authStore.events[0].action, 'cco.patient_master.assets_internalize');
      assert.equal(fixture.authStore.events[0].metadata.dryRun, true);
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});

test('assets/internalize kräver OWNER-roll', async () => {
  const fixture = await makeFixture({ role: 'STAFF' });
  try {
    await withServer(fixture.app, async (base) => {
      const res = await postJson(base, {});
      assert.equal(res.status, 403);
      assert.equal(fixture.authStore.events.length, 0);
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});

test('assets/internalize commit kräver exakt confirmText före Drive-anrop', async () => {
  let driveFactoryCalled = 0;
  const fixture = await makeFixture({
    createDriveInternalizationClient: () => {
      driveFactoryCalled += 1;
      throw new Error('Drive ska inte anropas utan confirmText.');
    },
  });
  try {
    await withServer(fixture.app, async (base) => {
      const res = await postJson(base, { dryRun: false, limit: 1 });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /INTERNALIZE ASSETS/);
      assert.equal(driveFactoryCalled, 0);
      assert.equal(fixture.importRunStore.stats().total, 0);
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});

test('assets/internalize commit använder mockad Drive-client och bevarar encounterId', async () => {
  const fixture = await makeFixture({
    createDriveInternalizationClient: async () => ({
      serviceAccountEmail: 'svc-drive@example.test',
      async getFileMetadata() {
        return { name: 'Journal-PRP-Dino.pdf', modifiedTime: '2026-01-01T12:00:00.000Z' };
      },
      async downloadBuffer() {
        return Buffer.from('journal pdf body');
      },
    }),
  });
  try {
    await withServer(fixture.app, async (base) => {
      const res = await postJson(base, {
        dryRun: false,
        limit: 1,
        confirmText: 'INTERNALIZE ASSETS',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.dryRun, false);
      assert.equal(res.body.drive.serviceAccountEmail, 'svc-drive@example.test');
      assert.equal(res.body.report.stats.imported, 1);
      assert.equal(res.body.report.remainingRows, undefined);

      const assets = fixture.assetStore.listItemsForEnrichment();
      assert.equal(assets.length, 1);
      assert.equal(assets[0].originalDriveFileId, 'drive-file-1');
      assert.equal(assets[0].encounterType, 'prp_hair');
      assert.equal(assets[0].treatmentType, 'PRP');
      assert.equal(assets[0].sessionNumber, 2);
      assert.equal(Boolean(assets[0].encounterId), true);
      assert.equal(fixture.importRunStore.stats().finished, 1);
      assert.equal(fixture.authStore.events.at(-1).metadata.dryRun, false);
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});

test('assets/internalize/preview-candidates är read-only och maskerar kandidater', async () => {
  const fixture = await makeFixture();
  try {
    await withServer(fixture.app, async (base) => {
      const res = await postPreviewJson(base, { limit: 5, excludeUnknownMonth: false });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.zeroWrites, true);
      assert.equal(res.body.preview.zeroWrites, true);
      assert.equal(res.body.preview.candidates.length, 1);
      assert.equal(res.body.preview.candidates[0].documentDateSource, 'folder_iso');
      assert.match(res.body.preview.candidates[0].fileName, /\*/);
      assert.match(res.body.preview.candidates[0].driveRef, /\*/);
      assert.equal('patientId' in res.body.preview.candidates[0], false);
      assert.equal(fixture.authStore.events.length, 0);
      assert.equal(fixture.importRunStore.stats().total, 0);
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});

test('assets/internalize/preview-candidates kräver OWNER-roll', async () => {
  const fixture = await makeFixture({ role: 'STAFF' });
  try {
    await withServer(fixture.app, async (base) => {
      const res = await postPreviewJson(base, {});
      assert.equal(res.status, 403);
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});
