'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  gateMigrationIndexFiles,
  resolveMigrationIndexBinding,
  buildNativeAssetsByDriveFileId,
} = require('../../src/ops/ccoPatientMasterMigrationIndexGate');
const { buildVisitSegments } = require('../../src/ops/ccoPatientVisitSegments');
const { createCcoPatientMasterRouter } = require('../../src/routes/ccoPatientMaster');

function indexFile(overrides = {}) {
  return {
    id: 'idx-1',
    source: 'zip',
    driveFileId: 'drive-file-1',
    fileType: 'journal_pdf',
    fileName: 'Journal 2024-04-22.pdf',
    relativePath: 'Hair TP Clinic 2024/PRP 1/Journal 2024-04-22.pdf',
    personnummer: '19900101-1234',
    viewUrl: '/api/v1/cco-patient-master/file?fileId=idx-1',
    ...overrides,
  };
}

function nativeAsset(overrides = {}) {
  return {
    id: 'native-1',
    patientId: 'patient-gate',
    status: 'VISIBLE_ON_PATIENT_CARD',
    originalDriveFileId: 'drive-file-1',
    originalFileName: 'Journal.pdf',
    mimeType: 'application/pdf',
    category: 'journal',
    storageKey: '2024/journal.pdf',
    checksum: 'sha256:abc',
    ...overrides,
  };
}

test('resolveMigrationIndexBinding: unlinked index is never renderAsClear', () => {
  const result = resolveMigrationIndexBinding(indexFile(), new Map());
  assert.equal(result.binding, 'unlinked');
  assert.equal(result.renderAsClear, false);
  assert.equal(result.reviewReason, 'migration_index_unverified');
});

test('resolveMigrationIndexBinding: renderable native suppresses index duplicate', () => {
  const map = buildNativeAssetsByDriveFileId([nativeAsset()]);
  const result = resolveMigrationIndexBinding(indexFile(), map);
  assert.equal(result.binding, 'native_renderable');
  assert.equal(result.includeInPatientCard, false);
});

test('resolveMigrationIndexBinding: blocked native suppresses index row', () => {
  const map = buildNativeAssetsByDriveFileId([nativeAsset({ status: 'NEEDS_REVIEW' })]);
  const result = resolveMigrationIndexBinding(indexFile(), map);
  assert.equal(result.binding, 'native_blocked');
  assert.equal(result.includeInPatientCard, false);
  assert.equal(result.reviewReason, 'migration_index_native_blocked');
});

test('gateMigrationIndexFiles dedupes renderable native and drops blocked links', () => {
  const gated = gateMigrationIndexFiles({
    indexFiles: [
      indexFile({ id: 'idx-renderable', driveFileId: 'drive-a' }),
      indexFile({ id: 'idx-blocked', driveFileId: 'drive-b' }),
      indexFile({ id: 'idx-unlinked', driveFileId: 'drive-c' }),
    ],
    nativeAssets: [
      nativeAsset({ id: 'native-a', originalDriveFileId: 'drive-a' }),
      nativeAsset({ id: 'native-b', originalDriveFileId: 'drive-b', status: 'REJECTED' }),
    ],
  });

  assert.equal(gated.stats.suppressedRenderableDuplicates, 1);
  assert.equal(gated.stats.suppressedBlocked, 1);
  assert.equal(gated.stats.unverifiedIncluded, 1);
  assert.equal(gated.files.length, 1);
  assert.equal(gated.files[0].id, 'idx-unlinked');
  assert.equal(gated.files[0].renderAsClear, false);
  assert.equal(gated.files[0].assetStatus, 'MIGRATION_INDEX_UNVERIFIED');
});

test('buildVisitSegments: unlinked migration-index never yields high confidence', () => {
  const result = buildVisitSegments({
    driveFiles: [
      {
        id: 'idx-only',
        source: 'migration_index',
        fileType: 'journal_pdf',
        fileName: 'Journal 2024-04-22.pdf',
        relativePath: 'Hair TP Clinic 2024/PRP 1/Journal 2024-04-22.pdf',
        migrationIndexBinding: 'unlinked',
        renderAsClear: false,
        assetStatus: 'MIGRATION_INDEX_UNVERIFIED',
        occasionContext: {
          timelineKey: '2024-04-22',
          date: '2024-04-22',
          source: 'migration_index.timeline',
        },
      },
    ],
  });

  const segment = result.visitSegments.find((row) => row.date === '2024-04-22');
  assert.ok(segment, 'segment ska finnas');
  assert.notEqual(segment.confidence, 'high');
  assert.ok(segment.reasons.includes('migration_index_unverified'));
});

function createMigrationGateRouterHarness({ indexFiles = [], nativeAssets = [] } = {}) {
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
    getFilesForPersonnummer: async () => indexFiles,
  };

  const assetStore = {
    listAssetsForPatient: () => nativeAssets,
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

test('patient summary: migration-index without native gate is annotated unverified, not clear', async () => {
  const app = createMigrationGateRouterHarness({
    indexFiles: [indexFile({ id: 'idx-unlinked', driveFileId: 'drive-unlinked' })],
    nativeAssets: [],
  });

  await withServer(app, async (server) => {
    const { port } = server.address();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/v1/cco-patient-master/patient/summary?patientId=patient-gate&includeDriveFiles=1`
    );
    const body = await res.json();
    assert.equal(res.status, 200);
    const indexRow = body.driveFiles.find((file) => file.id === 'idx-unlinked');
    assert.ok(indexRow, 'unlinked index ska finnas kvar som osäker');
    assert.equal(indexRow.renderAsClear, false);
    assert.equal(indexRow.assetStatus, 'MIGRATION_INDEX_UNVERIFIED');
    assert.equal(indexRow.migrationIndexBinding, 'unlinked');
  });
});

test('patient summary + visit-segments: index linked to NEEDS_REVIEW native is suppressed', async () => {
  const app = createMigrationGateRouterHarness({
    indexFiles: [indexFile({ id: 'idx-blocked', driveFileId: 'drive-blocked' })],
    nativeAssets: [
      nativeAsset({
        id: 'native-blocked',
        originalDriveFileId: 'drive-blocked',
        status: 'NEEDS_REVIEW',
      }),
    ],
  });

  await withServer(app, async (server) => {
    const { port } = server.address();
    const summary = await fetch(
      `http://127.0.0.1:${port}/api/v1/cco-patient-master/patient/summary?patientId=patient-gate&includeDriveFiles=1`
    ).then((r) => r.json());
    assert.ok(!summary.driveFiles.some((file) => file.id === 'idx-blocked'));

    const visit = await fetch(
      `http://127.0.0.1:${port}/api/v1/cco-patient-master/patient/visit-segments?patientId=patient-gate&includeDriveFiles=1`
    ).then((r) => r.json());
    const ids = visit.visitSegments.flatMap((seg) => [
      ...seg.images.map((row) => row.assetId),
      ...seg.documents.map((row) => row.assetId),
    ]);
    assert.ok(!ids.includes('idx-blocked'));
  });
});

test('visit-segments: renderable native wins over migration-index duplicate', async () => {
  const app = createMigrationGateRouterHarness({
    indexFiles: [indexFile({ id: 'idx-dup', driveFileId: 'drive-dup' })],
    nativeAssets: [
      nativeAsset({
        id: 'native-dup',
        originalDriveFileId: 'drive-dup',
        status: 'VISIBLE_ON_PATIENT_CARD',
        documentDate: '2024-04-22',
        captureDateTime: '2024-04-22T09:14:00',
        mimeType: 'application/pdf',
        category: 'journal',
      }),
    ],
  });

  await withServer(app, async (server) => {
    const { port } = server.address();
    const visit = await fetch(
      `http://127.0.0.1:${port}/api/v1/cco-patient-master/patient/visit-segments?patientId=patient-gate&includeDriveFiles=1`
    ).then((r) => r.json());

    const docIds = visit.visitSegments.flatMap((seg) => seg.documents.map((row) => row.assetId));
    assert.ok(docIds.includes('native-dup'));
    assert.ok(!docIds.includes('idx-dup'));
  });
});
