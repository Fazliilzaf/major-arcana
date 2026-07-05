'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createCcoPatientMasterRouter } = require('../../src/routes/ccoPatientMaster');

const BLOCKED_STATUSES = ['NEEDS_REVIEW', 'REJECTED', 'DUPLICATE'];
const PREVIEW_ROOT = path.join(__dirname, '../../public/major-arcana-preview');
const VISIT_SEGMENTS_UI_PATH = path.join(PREVIEW_ROOT, 'app/cco-kundkort-visit-segments.js');

function baseAsset(overrides = {}) {
  return {
    patientId: 'patient-gate',
    sourceSystem: 'drive_import',
    sourceRecordId: 'drive-gate',
    originalDriveFileId: 'drive-gate-file',
    originalDrivePath: 'Hair TP Clinic 2024/PRP 1/Front.jpg',
    originalFileName: 'Front.jpg',
    storageProvider: 'local',
    storageKey: '2024/prp/front.jpg',
    checksum: 'sha256:gate123',
    fileSize: 1200,
    mimeType: 'image/jpeg',
    category: 'photo_before',
    captureDateTime: '2024-04-22T09:14:00',
    documentDate: '2024-04-22',
    importedBy: 'system',
    importRunId: 'run-gate',
    ...overrides,
  };
}

function mixedStatusAssets() {
  return [
    baseAsset({
      id: 'asset-visible',
      status: 'VISIBLE_ON_PATIENT_CARD',
      originalFileName: 'Visible.jpg',
    }),
    baseAsset({
      id: 'asset-verified',
      status: 'VERIFIED_IN_CCO',
      originalFileName: 'Verified.jpg',
      captureDateTime: '2024-04-22T10:00:00',
      documentDate: '2024-04-22',
    }),
    baseAsset({
      id: 'asset-needs-review',
      status: 'NEEDS_REVIEW',
      originalFileName: 'NeedsReview.jpg',
    }),
    baseAsset({
      id: 'asset-rejected',
      status: 'REJECTED',
      originalFileName: 'Rejected.jpg',
    }),
    baseAsset({
      id: 'asset-duplicate',
      status: 'DUPLICATE',
      originalFileName: 'Duplicate.jpg',
    }),
  ];
}

function createRouterHarness({ assets = mixedStatusAssets() } = {}) {
  const patientMasterStore = {
    getPatient: async () => ({
      id: 'patient-gate',
      tenantId: 'hair-tp-clinic',
      displayName: 'Gate Patient',
      personnummer: '19900101-1234',
    }),
    buildPatientCardReadout: (patient) => ({ patientId: patient.id }),
  };

  const migrationIndexStore = {
    getFilesForPersonnummer: async () => [],
  };

  const assetStore = {
    listAssetsForPatient: () => assets,
    listItemsForEnrichment: () => [],
  };

  const authStore = {
    addAuditEvent: async () => {},
    resolveActor: async () => ({
      tenantId: 'hair-tp-clinic',
      userId: 'u-gate',
      role: 'OWNER',
    }),
  };

  const app = express();
  app.use((req, _res, next) => {
    req.auth = { tenantId: 'hair-tp-clinic', userId: 'u-gate', role: 'OWNER' };
    req.currentUser = { id: 'u-gate', displayName: 'Owner' };
    req.currentMembership = { tenantId: 'hair-tp-clinic', role: 'OWNER' };
    next();
  });
  app.use(
    '/api/v1',
    createCcoPatientMasterRouter({
      patientMasterStore,
      migrationIndexStore,
      resolvePatientAssetStore: async () => assetStore,
      authStore,
      config: { defaultTenant: 'hair-tp-clinic' },
      requireAuth: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
    })
  );

  return app;
}

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(server);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function collectAssetIdsFromDriveFiles(files = []) {
  return files.flatMap((file) => [file.id, file.assetId].filter(Boolean));
}

function collectAssetIdsFromVisitSegments(segments = []) {
  const ids = [];
  for (const segment of segments) {
    for (const image of segment.images || []) {
      if (image.assetId) ids.push(image.assetId);
    }
    for (const doc of segment.documents || []) {
      if (doc.assetId) ids.push(doc.assetId);
    }
  }
  return ids;
}

function loadVisitSegmentsUi() {
  const sandbox = {
    window: {},
    document: { querySelector: () => null },
    fetch: () => Promise.resolve({ ok: true, json: async () => ({ visitSegments: [] }) }),
  };
  vm.runInNewContext(fs.readFileSync(VISIT_SEGMENTS_UI_PATH, 'utf8'), sandbox, {
    filename: VISIT_SEGMENTS_UI_PATH,
  });
  return sandbox.window.CcoKundkortVisitSegments;
}

const BLOCKED_ASSET_IDS = {
  NEEDS_REVIEW: 'asset-needs-review',
  REJECTED: 'asset-rejected',
  DUPLICATE: 'asset-duplicate',
};

test('patient summary driveFiles excludes NEEDS_REVIEW / REJECTED / DUPLICATE native assets', async () => {
  const app = createRouterHarness();
  await withServer(app, async (server) => {
    const { port } = server.address();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/cco-patient-master/patient/summary?patientId=patient-gate&includeDriveFiles=1`
    );
    const body = await res.json();
    assert.equal(res.status, 200);

    const ids = collectAssetIdsFromDriveFiles(body.driveFiles);
    assert.ok(ids.includes('asset-visible'));
    assert.ok(ids.includes('asset-verified'));
    for (const blockedStatus of BLOCKED_STATUSES) {
      assert.ok(
        !ids.includes(BLOCKED_ASSET_IDS[blockedStatus]),
        `${blockedStatus} får inte nå driveFiles`
      );
    }
    for (const file of body.driveFiles) {
      assert.ok(
        !BLOCKED_STATUSES.includes(file.status),
        `status ${file.status} läckte till driveFiles`
      );
    }
  });
});

test('visit-segments API excludes NEEDS_REVIEW / REJECTED / DUPLICATE native assets', async () => {
  const app = createRouterHarness();
  await withServer(app, async (server) => {
    const { port } = server.address();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/cco-patient-master/patient/visit-segments?patientId=patient-gate&includeDriveFiles=1`
    );
    const body = await res.json();
    assert.equal(res.status, 200);

    const ids = collectAssetIdsFromVisitSegments(body.visitSegments);
    assert.deepEqual(
      ids.sort(),
      ['asset-verified', 'asset-visible'].sort(),
      'bara renderbara native assets får nå visit-segments'
    );

    for (const blockedId of ['asset-needs-review', 'asset-rejected', 'asset-duplicate']) {
      assert.ok(!ids.includes(blockedId), `${blockedId} får inte nå visit-segments`);
    }
  });
});

test('kundkort Besök/tillfällen render visar inte blockerade asset-IDs från API-säker payload', async () => {
  const app = createRouterHarness();
  await withServer(app, async (server) => {
    const { port } = server.address();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/cco-patient-master/patient/visit-segments?patientId=patient-gate&includeDriveFiles=1`
    );
    const body = await res.json();
    assert.equal(res.status, 200);

    const ui = loadVisitSegmentsUi();
    const html = ui.renderBesokInnerFromVisitSegments(body.visitSegments, {
      esc: (s) => String(s ?? ''),
      buildDocViewRow: (label, meta, url, key) =>
        `<row data-key="${key}" data-url="${url}">${label}|${meta}</row>`,
      gkSharedPhotoGrid: (items) =>
        `<grid>${items.map((item) => item.id || item.sourceAssetId || '').join(',')}</grid>`,
      empty: (t) => `<empty>${t}</empty>`,
    });

    assert.match(html, /asset-visible|asset-verified/);
    for (const blockedId of ['asset-needs-review', 'asset-rejected', 'asset-duplicate']) {
      assert.ok(!html.includes(blockedId), `${blockedId} får inte synas i Besök/tillfällen-HTML`);
    }
    assert.match(html, /kk-besok/);
  });
});

test('visit-segments bygger inga segment enbart från blockerade native assets', async () => {
  const blockedOnly = BLOCKED_STATUSES.map((status, index) =>
    baseAsset({
      id: `blocked-only-${index}`,
      status,
      originalFileName: `${status}.jpg`,
      captureDateTime: `2024-04-2${index}T09:14:00`,
      documentDate: `2024-04-2${index}`,
    })
  );
  const app = createRouterHarness({ assets: blockedOnly });
  await withServer(app, async (server) => {
    const { port } = server.address();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/cco-patient-master/patient/visit-segments?patientId=patient-gate&includeDriveFiles=1`
    );
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(collectAssetIdsFromVisitSegments(body.visitSegments).length, 0);
  });
});
