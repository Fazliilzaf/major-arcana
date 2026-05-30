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

test('P0.I: discover med couplings men utan driveClient → records med null loadBody', async () => {
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

test('P0.I: discover med couplings + mock driveClient → records med fungerande loadBody', async () => {
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
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient,
    });
    const records = await adapter.discover();
    assert.equal(records.length, 2);
    // Första rekordet
    assert.equal(records[0].sourceRecordId, 'drv-file-001');
    assert.equal(records[0].patientId, 'cliento_aaa');
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

test('P0.I: pipeline.discoverFromOldCco delegerar till adapter och fullImportRun skapar assets', async () => {
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
    const adapter = createCcoOldCcoAssetAdapter({
      masterCardCouplingPath: couplingPath,
      driveClient,
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
