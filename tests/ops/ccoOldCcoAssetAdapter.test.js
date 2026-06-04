'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const {
  createCcoOldCcoAssetAdapter,
  _internal,
} = require('../../src/ops/ccoOldCcoAssetAdapter');
const {
  createCcoAssetImportPipeline,
} = require('../../src/ops/ccoAssetImportPipeline');
const {
  createCcoPatientAssetStore,
} = require('../../src/ops/ccoPatientAssetStore');
const {
  createCcoAssetImportRunStore,
} = require('../../src/ops/ccoAssetImportRunStore');
const {
  createCcoAssetReviewQueueStore,
} = require('../../src/ops/ccoAssetReviewQueueStore');
const {
  createLocalProvider,
} = require('../../src/ops/ccoSecureStorageProvider');

function makeMemoryAudit() {
  const events = [];
  return {
    events,
    append(e) {
      events.push(e);
    },
  };
}

async function writeCoupling(dir, payload) {
  const p = path.join(dir, 'cco-master-card-drive-coupling.json');
  await fs.writeFile(p, JSON.stringify(payload), 'utf8');
  return p;
}

// ----------------------------------------------------------------------------
// 1) discover utan driveClient + utan masterCardCouplingPath → tom lista
// ----------------------------------------------------------------------------

test('P0.I: discover utan driveClient OCH utan coupling-path returnerar tom lista', async () => {
  const adapter = createCcoOldCcoAssetAdapter({});
  const records = await adapter.discover({ tenantId: 'hair_tp' });
  assert.deepEqual(records, []);
});

test('P0.I: discover med coupling-path som inte finns på disk returnerar tom lista', async () => {
  const adapter = createCcoOldCcoAssetAdapter({
    masterCardCouplingPath: '/tmp/does-not-exist-coupling-' + Date.now() + '.json',
  });
  const records = await adapter.discover();
  assert.deepEqual(records, []);
});

// ----------------------------------------------------------------------------
// 2) discover med couplings men UTAN driveClient → link-only-records
// ----------------------------------------------------------------------------

test('P0.I: discover med couplings men utan driveClient → records med null loadBody (OS#6: + _folderOnly + _needsPatientReview när customerStore saknas)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-adapter-'));
  try {
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'cliento_aaa': {
          predictedFolderId: 'folder-aaa',
          predictedFolderPath: '/AnonPatients/aaa',
          predictionConfidence: 'high',
        },
        'cliento_bbb': {
          predictedFolderId: 'folder-bbb',
          predictedFolderPath: '/AnonPatients/bbb',
          predictionConfidence: 'high',
        },
      },
    });
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
    });
    const records = await adapter.discover();
    assert.equal(records.length, 2);
    for (const r of records) {
      assert.equal(r.sourceSystem, 'old_cco');
      assert.ok(r.originalDriveFileId, 'originalDriveFileId måste finnas');
      // sourceRecordId-prefix för "no service-account" varianten
      assert.match(r.sourceRecordId, /^no-sa-/);
      // OS#6: utan customerStore → patientId=null + _needsPatientReview=true
      assert.equal(r.patientId, null, 'utan customerStore måste patientId vara null');
      assert.equal(r._needsPatientReview, true);
      assert.equal(r._patientValidation.reason, 'no_customer_store_configured');
      assert.ok(r._rawPatientId, '_rawPatientId måste bevaras för diagnostik');
      // OS#6: folder-only när vi inte kan enumerera filer
      assert.equal(r._folderOnly, true);
      // loadBody returnerar null → pipelinen sätter LINK_ONLY_BLOCKER
      const body = await r.loadBody();
      assert.equal(body, null);
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------------------------
// 3) discover med couplings + mock driveClient → records med loadBody buffer
// ----------------------------------------------------------------------------

test('P0.I: discover med couplings + mock driveClient → records med fungerande loadBody (OS#6: med customerStore som direct-master-id-matchar)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-adapter-'));
  try {
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'cliento_aaa': {
          predictedFolderId: 'folder-aaa',
          predictedFolderPath: '/AnonPatients/aaa',
        },
      },
    });
    const fileBytes = Buffer.from('mock-pdf-content-anon', 'utf8');
    const driveClient = {
      async listFilesInFolder(folderId) {
        assert.equal(folderId, 'folder-aaa');
        return [
          {
            id: 'drv-file-001',
            name: 'demo-journal.pdf',
            mimeType: 'application/pdf',
            modifiedTime: '2026-05-15T10:00:00Z',
          },
          {
            id: 'drv-file-002',
            name: 'demo-foto.jpg',
            mimeType: 'image/jpeg',
            createdTime: '2026-05-16T10:00:00Z',
          },
        ];
      },
      async streamFile(id) {
        assert.ok(id === 'drv-file-001' || id === 'drv-file-002');
        return Readable.from([fileBytes]);
      },
    };
    // OS#6: customerStore med "cliento_aaa" som direkt master-id (directory key)
    const customerStore = {
      async peekTenantCustomerState() {
        return {
          directory: {
            'cliento_aaa': { name: 'AnonAlfa' },
          },
        };
      },
    };
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient,
      customerStore,
    });
    const records = await adapter.discover();
    assert.equal(records.length, 2);
    // Första rekordet — patientId via direct_master_id_match
    assert.equal(records[0].sourceRecordId, 'drv-file-001');
    assert.equal(records[0].patientId, 'cliento_aaa');
    assert.equal(records[0]._rawPatientId, 'cliento_aaa');
    assert.equal(records[0]._patientValidation.basis, 'direct_master_id_match');
    assert.equal(records[0]._needsPatientReview, false);
    assert.equal(records[0].originalDriveFileId, 'drv-file-001');
    assert.equal(records[0].originalDrivePath, '/AnonPatients/aaa');
    assert.equal(records[0].originalFileName, 'demo-journal.pdf');
    assert.equal(records[0].mimeType, 'application/pdf');
    assert.equal(records[0].documentDate, '2026-05-15T10:00:00Z');
    // loadBody fungerar och returnerar buffer
    const body = await records[0].loadBody();
    assert.ok(Buffer.isBuffer(body));
    assert.equal(body.toString('utf8'), 'mock-pdf-content-anon');
    // Andra rekordet — createdTime som fallback för documentDate
    assert.equal(records[1].documentDate, '2026-05-16T10:00:00Z');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------------------------
// 4) discover respekterar limit
// ----------------------------------------------------------------------------

test('P0.I: discover respekterar limit (over coupling- + file-loops)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-adapter-'));
  try {
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'pat-1': { predictedFolderId: 'folder-1', predictedFolderPath: '/p1' },
        'pat-2': { predictedFolderId: 'folder-2', predictedFolderPath: '/p2' },
        'pat-3': { predictedFolderId: 'folder-3', predictedFolderPath: '/p3' },
      },
    });
    const driveClient = {
      async listFilesInFolder() {
        return [
          { id: 'f1', name: 'a.pdf', mimeType: 'application/pdf' },
          { id: 'f2', name: 'b.pdf', mimeType: 'application/pdf' },
        ];
      },
    };
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient,
    });
    const records = await adapter.discover({ limit: 3 });
    assert.equal(records.length, 3);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------------------------
// 5) discover hanterar driveClient-fel utan att kasta
// ----------------------------------------------------------------------------

test('P0.I: discover fångar driveClient-fel och lägger till link-only-blocker per folder', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-adapter-'));
  try {
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'pat-x': {
          predictedFolderId: 'folder-broken',
          predictedFolderPath: '/x',
        },
      },
    });
    const driveClient = {
      async listFilesInFolder() {
        throw new Error('drive_api_403_forbidden_test');
      },
    };
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient,
    });
    // Får INTE kasta
    const records = await adapter.discover();
    assert.equal(records.length, 1);
    const r = records[0];
    assert.match(r.sourceRecordId, /^drive-folder-/);
    assert.equal(r.originalDriveFileId, 'folder-broken');
    // loadBody returnerar null (saknad binär)
    assert.equal(await r.loadBody(), null);
    // _driveError exponeras för diagnostik
    assert.match(r._driveError, /drive_api_403_forbidden_test/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------------------------
// 6) stats returnerar counts
// ----------------------------------------------------------------------------

test('P0.I: stats returnerar totalCouplings + withFolderId + driveClientAvailable', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-adapter-'));
  try {
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'p-1': { predictedFolderId: 'f-1' },
        'p-2': { predictedFolderId: 'f-2' },
        'p-3': { predictedFolderId: null }, // saknar folder
        'p-4': {}, // saknar folder
      },
    });
    const driveClient = { listFilesInFolder: async () => [] };
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient,
    });
    const s = adapter.stats();
    assert.equal(s.sourceType, 'old_cco');
    assert.equal(s.totalCouplings, 4);
    assert.equal(s.withFolderId, 2);
    assert.equal(s.driveClientAvailable, true);
    assert.equal(s.masterCardCouplingPath, couplingPath);

    // Utan driveClient — driveClientAvailable=false
    const adapter2 = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
    });
    assert.equal(adapter2.stats().driveClientAvailable, false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------------------------
// 7) Adapter integration: pipeline importerar via adapter → assets skapas
// ----------------------------------------------------------------------------

test('P0.I: pipeline.discoverFromOldCco delegerar till adapter och fullImportRun skapar assets (OS#6: med customerStore för patientId-validering)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-pipeline-'));
  try {
    // Coupling-fil med 1 patient + 1 folder
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'anon-pat-int-001': {
          predictedFolderId: 'folder-int',
          predictedFolderPath: '/AnonPatients/int-001',
        },
      },
    });
    // Mock-drive med 1 fil som har content
    const fileBytes = Buffer.from('mock-pdf-integration-test', 'utf8');
    const driveClient = {
      async listFilesInFolder() {
        return [
          {
            id: 'drv-int-001',
            name: 'demo-journal-int.pdf',
            mimeType: 'application/pdf',
            modifiedTime: '2026-05-20T10:00:00Z',
          },
        ];
      },
      async streamFile() {
        return Readable.from([fileBytes]);
      },
    };
    // OS#6: customerStore med direct master-id-match för 'anon-pat-int-001'
    const customerStore = {
      async peekTenantCustomerState() {
        return {
          directory: {
            'anon-pat-int-001': { name: 'IntegrationAnon' },
          },
        };
      },
    };
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient,
      customerStore,
    });

    const audit = makeMemoryAudit();
    const assetStore = await createCcoPatientAssetStore({
      filePath: path.join(tmp, 'assets.json'),
      auditLog: audit,
    });
    const importRunStore = await createCcoAssetImportRunStore({
      filePath: path.join(tmp, 'runs.json'),
      auditLog: audit,
    });
    const reviewQueueStore = await createCcoAssetReviewQueueStore({
      filePath: path.join(tmp, 'review.json'),
      auditLog: audit,
    });
    const storage = createLocalProvider({ rootPath: path.join(tmp, 'storage') });

    const pipeline = createCcoAssetImportPipeline({
      assetStore,
      importRunStore,
      reviewQueueStore,
      storage,
      auditLog: audit,
      oldCcoAdapter: adapter,
    });

    const { runId, results } = await pipeline.fullImportRun({
      tenantId: 'hair_tp',
      sourceSystem: 'old_cco',
      mode: 'full',
      createdBy: 'test',
    });
    assert.ok(runId);
    assert.equal(results.length, 1);
    // Asset skapad — direct patientId från coupling
    assert.equal(results[0].ok, true);
    assert.equal(results[0].asset.patientId, 'anon-pat-int-001');
    assert.equal(results[0].asset.sourceSystem, 'old_cco');
    assert.ok(results[0].asset.storageKey);
    assert.ok(results[0].asset.checksum);
    // Filen ska finnas på disk i secure storage
    const absPath = path.join(tmp, 'storage', results[0].asset.storageKey);
    assert.ok(fsSync.existsSync(absPath), 'fil saknas i secure storage');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------------------------
// 8) extractCouplings tolerar tre shaper (modern results / legacy couplings / direct)
// ----------------------------------------------------------------------------

test('P0.I: extractCouplings hanterar results, couplings och direct shape', () => {
  const { extractCouplings } = _internal;
  // Modern shape
  assert.deepEqual(extractCouplings({ results: { a: { id: 1 } } }), {
    a: { id: 1 },
  });
  // Legacy
  assert.deepEqual(extractCouplings({ couplings: { b: { id: 2 } } }), {
    b: { id: 2 },
  });
  // Direct — filtrerar bort kända metadata-fält + non-objects
  const direct = extractCouplings({
    generatedAt: 'ignore',
    tenantId: 'ignore',
    stats: { x: 1 },
    'pat-1': { folder: 'f1' },
  });
  assert.deepEqual(direct, { 'pat-1': { folder: 'f1' } });
});

// ----------------------------------------------------------------------------
// 9-13) OWNER-SKÄRPNING #6 — patientId-validering via CCO master store
// ----------------------------------------------------------------------------

test('OS#6: discover utan customerStore → records.patientId=null + _patientValidation.reason=no_customer_store_configured', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-os6-'));
  try {
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'cliento_x': { predictedFolderId: 'folder-x', predictedFolderPath: '/x' },
      },
    });
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient: {
        async listFilesInFolder() {
          return [
            { id: 'f-1', name: 'a.pdf', mimeType: 'application/pdf' },
          ];
        },
      },
      // ingen customerStore
    });
    const records = await adapter.discover({ tenantId: 'hair_tp' });
    assert.equal(records.length, 1);
    const r = records[0];
    assert.equal(r.patientId, null);
    assert.equal(r._needsPatientReview, true);
    assert.equal(r._patientValidation.valid, false);
    assert.equal(r._patientValidation.reason, 'no_customer_store_configured');
    assert.equal(r._rawPatientId, 'cliento_x');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('OS#6: discover med rawPatientId som matchar CCO master directly → basis=direct_master_id_match', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-os6-'));
  try {
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'cco-master-001': { predictedFolderId: 'folder-1', predictedFolderPath: '/1' },
      },
    });
    const customerStore = {
      async peekTenantCustomerState() {
        return {
          directory: {
            'cco-master-001': { name: 'AnonAlpha' },
          },
        };
      },
    };
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient: {
        async listFilesInFolder() {
          return [{ id: 'f-1', name: 'demo.pdf', mimeType: 'application/pdf' }];
        },
      },
      customerStore,
    });
    const records = await adapter.discover({ tenantId: 'hair_tp' });
    assert.equal(records.length, 1);
    assert.equal(records[0].patientId, 'cco-master-001');
    assert.equal(records[0]._patientValidation.basis, 'direct_master_id_match');
    assert.equal(records[0]._needsPatientReview, false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('OS#6: discover med rawPatientId som matchar via clientoId i directory → basis=cliento_id_translation', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-os6-'));
  try {
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'cliento_legacy_id_42': {
          predictedFolderId: 'folder-42',
          predictedFolderPath: '/42',
        },
      },
    });
    const customerStore = {
      async peekTenantCustomerState() {
        return {
          directory: {
            'cco-master-42': {
              name: 'AnonBeta',
              clientoId: 'cliento_legacy_id_42',
            },
          },
        };
      },
    };
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient: {
        async listFilesInFolder() {
          return [{ id: 'f-1', name: 'doc.pdf', mimeType: 'application/pdf' }];
        },
      },
      customerStore,
    });
    const records = await adapter.discover({ tenantId: 'hair_tp' });
    assert.equal(records.length, 1);
    assert.equal(records[0].patientId, 'cco-master-42');
    assert.equal(records[0]._rawPatientId, 'cliento_legacy_id_42');
    assert.equal(records[0]._patientValidation.basis, 'cliento_id_translation');
    assert.equal(records[0]._needsPatientReview, false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('OS#6: discover med rawPatientId som matchar via meridiqMeta.meridiqPatientId → basis=meridiq_id_translation', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-os6-'));
  try {
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'meridiq_pat_777': {
          predictedFolderId: 'folder-777',
          predictedFolderPath: '/777',
        },
      },
    });
    const customerStore = {
      async peekTenantCustomerState() {
        return {
          directory: {
            'cco-master-777': {
              name: 'AnonGamma',
              meridiqMeta: { meridiqPatientId: 'meridiq_pat_777' },
            },
          },
        };
      },
    };
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient: {
        async listFilesInFolder() {
          return [{ id: 'f-1', name: 'doc.pdf', mimeType: 'application/pdf' }];
        },
      },
      customerStore,
    });
    const records = await adapter.discover({ tenantId: 'hair_tp' });
    assert.equal(records.length, 1);
    assert.equal(records[0].patientId, 'cco-master-777');
    assert.equal(records[0]._patientValidation.basis, 'meridiq_id_translation');
    assert.equal(records[0]._needsPatientReview, false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('OS#6: discover med okänd rawPatientId → patientId=null + _needsPatientReview=true', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-os6-'));
  try {
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'unknown_orphan_id': {
          predictedFolderId: 'folder-orphan',
          predictedFolderPath: '/orphan',
        },
      },
    });
    const customerStore = {
      async peekTenantCustomerState() {
        return {
          directory: {
            'cco-master-1': { name: 'Alpha', clientoId: 'cliento_1' },
          },
        };
      },
    };
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient: {
        async listFilesInFolder() {
          return [{ id: 'f-1', name: 'x.pdf', mimeType: 'application/pdf' }];
        },
      },
      customerStore,
    });
    const records = await adapter.discover({ tenantId: 'hair_tp' });
    assert.equal(records.length, 1);
    assert.equal(records[0].patientId, null);
    assert.equal(records[0]._needsPatientReview, true);
    assert.equal(records[0]._patientValidation.reason, 'no_translation_found');
    assert.equal(records[0]._patientValidation.rawId, 'unknown_orphan_id');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('OS#6: validatePatientIdAgainstCcoMaster är exposed som _internal helper', async () => {
  const { validatePatientIdAgainstCcoMaster } = _internal;
  // utan input id
  const a = await validatePatientIdAgainstCcoMaster(null, 'hair_tp', {});
  assert.equal(a.valid, false);
  assert.equal(a.reason, 'no_input_id');
  // utan customerStore
  const b = await validatePatientIdAgainstCcoMaster('x', 'hair_tp', null);
  assert.equal(b.valid, false);
  assert.equal(b.reason, 'no_customer_store_configured');
  // customerStore som kastar — ska svälja och returnera reason
  const c = await validatePatientIdAgainstCcoMaster('x', 'hair_tp', {
    async peekTenantCustomerState() {
      throw new Error('boom');
    },
  });
  assert.equal(c.valid, false);
  assert.equal(c.reason, 'customer_store_peek_failed');
});

test('OS#6: discover med folder utan filer (Drive listFilesInFolder returnerar []) → record har _folderOnly=true', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'oldcco-os6-'));
  try {
    const couplingPath = await writeCoupling(tmp, {
      results: {
        'cco-master-empty': {
          predictedFolderId: 'folder-empty',
          predictedFolderPath: '/empty',
        },
      },
    });
    const customerStore = {
      async peekTenantCustomerState() {
        return { directory: { 'cco-master-empty': { name: 'X' } } };
      },
    };
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient: {
        async listFilesInFolder() {
          return []; // tom mapp
        },
      },
      customerStore,
    });
    const records = await adapter.discover({ tenantId: 'hair_tp' });
    assert.equal(records.length, 1);
    assert.equal(records[0]._folderOnly, true);
    assert.equal(await records[0].loadBody(), null);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
