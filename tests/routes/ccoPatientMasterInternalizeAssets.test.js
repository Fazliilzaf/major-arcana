'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientMasterRouter } = require('../../src/routes/ccoPatientMaster');
const { resetInternalizeJobStateForTests } = require('../../src/ops/ccoDriveInternalizeAsyncJob');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createCcoAssetImportRunStore } = require('../../src/ops/ccoAssetImportRunStore');
const { createCcoAssetReviewQueueStore } = require('../../src/ops/ccoAssetReviewQueueStore');
const { createLocalProvider } = require('../../src/ops/ccoSecureStorageProvider');
const { blobExistsOnStorage } = require('../../src/ops/ccoGhostVisibleAssetDiagnosis');

const TENANT = 'hair-tp-clinic';

function gatedPatientMasterState() {
  return {
    version: 1,
    tenants: {
      [TENANT]: {
        patients: [
          {
            id: 'patient-iso',
            displayName: 'Iso Patient',
            matchStatus: 'matched',
            drive: {
              attachments: [
                {
                  id: 'idx-iso',
                  driveFileId: 'drive-file-iso',
                  fileName: 'journal-iso.pdf',
                  relativePath: 'Hair TP Clinic 2024/Januari 2025/2025-05-17 PRP 2/journal-iso.pdf',
                  mimeType: 'application/pdf',
                },
              ],
            },
          },
          {
            id: 'patient-month',
            displayName: 'Month Patient',
            matchStatus: 'matched',
            drive: {
              attachments: [
                {
                  id: 'idx-month',
                  driveFileId: 'drive-file-month',
                  fileName: 'journal-month.pdf',
                  relativePath: 'Hair TP Clinic/April 2026/April 5/journal-month.pdf',
                  mimeType: 'application/pdf',
                },
              ],
            },
          },
          {
            id: 'patient-unknown',
            displayName: 'Unknown Patient',
            matchStatus: 'matched',
            drive: {
              attachments: [
                {
                  id: 'idx-unknown',
                  driveFileId: 'drive-file-unknown',
                  fileName: 'journal-unknown.pdf',
                  relativePath: 'Hair TP Clinic/misc/journal-unknown.pdf',
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

function dateGateFilter() {
  return {
    allowedDocumentDateSources: ['folder_iso'],
    requireDocumentDateSource: true,
    excludeUnknownMonth: true,
  };
}

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

async function makeFixture({
  role = 'OWNER',
  createDriveInternalizationClient = null,
  masterState = null,
} = {}) {
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
      loadPatientMasterState: async () => masterState || patientMasterState(),
      createDriveInternalizationClient,
    })
  );
  return { tmp, app, authStore, assetStore, importRunStore, reviewQueueStore, storage };
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
        async: false,
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

test('assets/internalize commit async returnerar 202 och avslutar job', async () => {
  resetInternalizeJobStateForTests();
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
        async: true,
      });
      assert.equal(res.status, 202);
      assert.equal(res.body.async, true);
      assert.equal(res.body.accepted, true);
      assert.match(res.body.pollUrl, /internalize\/job$/);

      let jobBody = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const jobRes = await fetch(`${base}/api/v1/cco-patient-master/assets/internalize/job`);
        jobBody = await jobRes.json();
        if (!jobBody.state?.running) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(jobBody.state.running, false);
      assert.equal(jobBody.failed, undefined);
      assert.equal(jobBody.state.stats.imported, 1);
      assert.equal(fixture.assetStore.listItemsForEnrichment().length, 1);
      assert.equal(fixture.importRunStore.stats().finished, 1);
    });
  } finally {
    resetInternalizeJobStateForTests();
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

test('assets/internalize/preview-candidates returnerar pilotWindowSearch med skip-reasons', async () => {
  const fixture = await makeFixture();
  try {
    await withServer(fixture.app, async (base) => {
      const res = await postPreviewJson(base, {
        allowedDocumentDateSources: ['folder_iso'],
        requireDocumentDateSource: true,
        pilotWindowSize: 1,
      });
      assert.equal(res.status, 200);
      assert.ok(res.body.preview.pilotWindowSearch);
      assert.equal(res.body.preview.pilotWindowSearch.skippedSamples[0].reason, 'unknown_month');
      assert.equal(typeof res.body.preview.pilotWindowSearch.windowsScanned, 'number');
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});

test('assets/internalize commit och preview väljer samma folder_iso-kandidater med date-gate', async () => {
  const fixture = await makeFixture({ masterState: gatedPatientMasterState() });
  try {
    await withServer(fixture.app, async (base) => {
      const filter = dateGateFilter();
      const preview = await postPreviewJson(base, { ...filter, offset: 0, limit: 2 });
      assert.equal(preview.status, 200);
      assert.equal(preview.body.preview.candidates.length, 1);
      assert.equal(preview.body.preview.candidates[0].documentDateSource, 'folder_iso');

      const dryRun = await postJson(base, { dryRun: true, ...filter, offset: 0, limit: 2 });
      assert.equal(dryRun.status, 200);
      assert.equal(dryRun.body.report.gatedBatch.batchSize, 1);
      assert.deepEqual(dryRun.body.report.gatedBatch.documentDateSources, ['folder_iso']);
      assert.equal(
        dryRun.body.report.gatedBatch.candidates[0].driveRef,
        preview.body.preview.candidates[0].driveRef
      );

      const ungated = await postJson(base, { dryRun: true, offset: 0, limit: 1 });
      assert.equal(ungated.status, 200);
      assert.equal(ungated.body.report.gatedBatch, undefined);
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});

test('assets/internalize commit med folder_iso-gate importerar endast gateade rader', async () => {
  const fixture = await makeFixture({
    masterState: gatedPatientMasterState(),
    createDriveInternalizationClient: async () => ({
      serviceAccountEmail: 'svc-drive@example.test',
      async getFileMetadata(driveFileId) {
        return {
          name:
            driveFileId === 'drive-file-iso'
              ? 'Journal-Iso.pdf'
              : driveFileId === 'drive-file-month'
                ? 'Journal-Month.pdf'
                : 'Journal-Unknown.pdf',
          modifiedTime: '2026-01-01T12:00:00.000Z',
        };
      },
      async downloadBuffer(driveFileId) {
        return Buffer.from(`body:${driveFileId}`);
      },
    }),
  });
  try {
    await withServer(fixture.app, async (base) => {
      const res = await postJson(base, {
        dryRun: false,
        async: false,
        limit: 1,
        offset: 0,
        confirmText: 'INTERNALIZE ASSETS',
        ...dateGateFilter(),
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.report.stats.imported, 1);
      assert.deepEqual(res.body.report.gatedBatch.documentDateSources, ['folder_iso']);

      const assets = fixture.assetStore.listItemsForEnrichment();
      assert.equal(assets.length, 1);
      assert.equal(assets[0].originalDriveFileId, 'drive-file-iso');
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});

test('assets/diagnose-ghost-visible är read-only och rapporterar ghost + sibling', async () => {
  const fixture = await makeFixture();
  try {
    const body = Buffer.from('%PDF-route-ghost');
    const put = await fixture.storage.putObject({
      key: '2026/07/route-ghost.pdf',
      body,
      contentType: 'application/pdf',
    });

    await fixture.assetStore.addAsset({
      patientId: 'patient-dino',
      sourceSystem: 'drive_import',
      originalDriveFileId: 'drive-ghost-canonical',
      originalFileName: 'ghost.pdf',
      storageProvider: 'local',
      storageKey: 'missing/route-ghost.pdf',
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'VISIBLE_ON_PATIENT_CARD',
    });

    await fixture.assetStore.addAsset({
      patientId: 'patient-dino',
      sourceSystem: 'drive_import',
      importRunId: 'run-route-ghost',
      originalDriveFileId: 'drive-ghost-dup',
      originalFileName: 'ghost.pdf',
      storageProvider: 'local',
      storageKey: put.storageKey,
      checksum: put.checksum,
      fileSize: body.length,
      mimeType: 'application/pdf',
      category: 'journal',
      status: 'DUPLICATE',
    });

    await withServer(fixture.app, async (base) => {
      const res = await fetch(`${base}/api/v1/cco-patient-master/assets/diagnose-ghost-visible`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ importRunId: 'run-route-ghost' }),
      });
      const json = await res.json();
      assert.equal(res.status, 200);
      assert.equal(json.zeroWrites, true);
      assert.equal(json.stats.withBlobSibling, 1);
      assert.equal(fixture.assetStore.listItemsForEnrichment().length, 2);
      assert.equal(
        fixture.authStore.events.some(
          (e) => e.action === 'cco.patient_master.assets_diagnose_ghost_visible'
        ),
        true
      );
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});

async function seedRouteGhostPair(fixture, importRunId = 'run-route-repair') {
  const body = Buffer.from('%PDF-route-repair');
  const put = await fixture.storage.putObject({
    key: '2026/07/route-repair.pdf',
    body,
    contentType: 'application/pdf',
  });

  const canonical = await fixture.assetStore.addAsset({
    patientId: 'patient-dino',
    sourceSystem: 'drive_import',
    originalDriveFileId: 'drive-repair-canonical',
    originalFileName: 'repair.pdf',
    storageProvider: 'local',
    storageKey: 'missing/route-repair.pdf',
    checksum: put.checksum,
    fileSize: body.length,
    mimeType: 'application/pdf',
    category: 'journal',
    status: 'VISIBLE_ON_PATIENT_CARD',
  });

  const duplicate = await fixture.assetStore.addAsset({
    patientId: 'patient-dino',
    sourceSystem: 'drive_import',
    importRunId,
    originalDriveFileId: 'drive-repair-dup',
    originalFileName: 'repair.pdf',
    storageProvider: 'local',
    storageKey: put.storageKey,
    checksum: put.checksum,
    fileSize: body.length,
    mimeType: 'application/pdf',
    category: 'journal',
    status: 'DUPLICATE',
  });

  return { canonical, duplicate, put };
}

test('assets/repair-ghost-visible dryRun default skriver inte', async () => {
  const fixture = await makeFixture();
  try {
    const { canonical } = await seedRouteGhostPair(fixture);
    await withServer(fixture.app, async (base) => {
      const res = await fetch(`${base}/api/v1/cco-patient-master/assets/repair-ghost-visible`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ importRunId: 'run-route-repair' }),
      });
      const json = await res.json();
      assert.equal(res.status, 200);
      assert.equal(json.dryRun, true);
      assert.equal(json.zeroWrites, true);
      assert.equal(json.stats.wouldRepair, 1);
      assert.equal(json.stats.repaired, 0);
      const unchanged = fixture.assetStore.getAsset(canonical.id);
      assert.equal(unchanged.storageKey, 'missing/route-repair.pdf');
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});

test('assets/repair-ghost-visible commit kräver confirmText och reparerar blob', async () => {
  const fixture = await makeFixture();
  try {
    const { canonical, put } = await seedRouteGhostPair(fixture);
    await withServer(fixture.app, async (base) => {
      const blocked = await fetch(`${base}/api/v1/cco-patient-master/assets/repair-ghost-visible`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun: false, importRunId: 'run-route-repair' }),
      });
      assert.equal(blocked.status, 400);

      const unscoped = await fetch(
        `${base}/api/v1/cco-patient-master/assets/repair-ghost-visible`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            dryRun: false,
            confirmText: 'REPAIR GHOST VISIBLE',
          }),
        }
      );
      assert.equal(unscoped.status, 400);

      const res = await fetch(`${base}/api/v1/cco-patient-master/assets/repair-ghost-visible`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: false,
          importRunId: 'run-route-repair',
          confirmText: 'REPAIR GHOST VISIBLE',
        }),
      });
      const json = await res.json();
      assert.equal(res.status, 200);
      assert.equal(json.stats.repaired, 1);

      const fixed = fixture.assetStore.getAsset(canonical.id);
      assert.equal(fixed.storageKey, put.storageKey);
      assert.equal(await blobExistsOnStorage(fixed, fixture.storage), true);
      assert.equal(
        fixture.authStore.events.some(
          (e) => e.action === 'cco.patient_master.assets_repair_ghost_visible'
        ),
        true
      );
    });
  } finally {
    await fs.rm(fixture.tmp, { recursive: true, force: true });
  }
});
