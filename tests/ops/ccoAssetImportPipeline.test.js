'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoAssetImportPipeline,
  classify,
  linkPatient,
  extractPnrCandidates,
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

function makeMemoryAuditLog() {
  const events = [];
  return {
    events,
    append(e) {
      events.push(e);
    },
  };
}

async function makeRig() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-pipeline-'));
  const audit = makeMemoryAuditLog();
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
  // Stub customerStore — bara en findByPersonnummer-funktion
  const customerStore = {
    findByPersonnummer(pnr) {
      const map = {
        '19800101-1234': { id: 'pat-known-001' },
      };
      return map[pnr] || null;
    },
    all() {
      return [{ id: 'pat-known-002', name: 'AlphaName BetaSurname' }];
    },
  };
  const journalStore = {
    listForPatientOnDate(patientId, date) {
      if (patientId === 'pat-known-001' && date === '2026-03-15') {
        return [{ id: 'enc-001' }];
      }
      return [];
    },
  };
  const pipeline = createCcoAssetImportPipeline({
    assetStore,
    importRunStore,
    reviewQueueStore,
    storage,
    customerStore,
    journalStore,
    auditLog: audit,
  });
  return {
    tmp,
    audit,
    assetStore,
    importRunStore,
    reviewQueueStore,
    storage,
    customerStore,
    journalStore,
    pipeline,
  };
}

test('classify: 6 kategorier (journal/consent/agreement/form/aisia/photo)', () => {
  assert.equal(
    classify({ mimeType: 'application/pdf', fileName: 'journalanteckning-2026.pdf' }).category,
    'journal'
  );
  assert.equal(
    classify({ mimeType: 'application/pdf', fileName: 'samtycke-foto.pdf' }).category,
    'consent'
  );
  assert.equal(
    classify({ mimeType: 'application/pdf', fileName: 'avtal-behandling.pdf' }).category,
    'agreement'
  );
  assert.equal(
    classify({ mimeType: 'application/pdf', fileName: 'halsodeklaration.pdf' }).category,
    'form'
  );
  assert.equal(
    classify({ mimeType: 'application/pdf', fileName: 'AISIA-rapport-abc.pdf' }).category,
    'aisia_report'
  );
  assert.equal(
    classify({ mimeType: 'image/jpeg', fileName: 'fore-bild.jpg' }).category,
    'photo_before'
  );
  assert.equal(
    classify({ mimeType: 'image/jpeg', fileName: 'efter-3-manader.jpg' }).category,
    'photo_after'
  );
  assert.equal(
    classify({ mimeType: 'image/jpeg', fileName: 'operation-1.jpg' }).category,
    'photo_during'
  );
});

test('extractPnrCandidates: hittar olika varianter', () => {
  const found = extractPnrCandidates('Fil 19800101-1234 i mapp');
  assert.ok(found.includes('19800101-1234'));
  assert.ok(found.includes('800101-1234'));
  const f2 = extractPnrCandidates('800101-1234 nakna');
  assert.ok(f2.includes('800101-1234'));
});

test('linkPatient: pnr-match → high confidence', () => {
  const customerStore = {
    findByPersonnummer(pnr) {
      return pnr === '19800101-1234' ? { id: 'pat-A' } : null;
    },
  };
  const result = linkPatient({
    sourceRecord: {},
    fileName: 'journal-19800101-1234.pdf',
    customerStore,
  });
  assert.equal(result.patientId, 'pat-A');
  assert.equal(result.confidence, 'high');
  assert.equal(result.basis, 'filename_pnr_match');
});

test('linkPatient: ingen match → null + review', () => {
  const customerStore = { findByPersonnummer: () => null, all: () => [] };
  const result = linkPatient({
    sourceRecord: {},
    fileName: 'random-no-pnr.pdf',
    drivePath: '/anonymous/folder',
    customerStore,
  });
  assert.equal(result.patientId, null);
  assert.equal(result.basis, 'none');
});

test('importSingleAsset end-to-end: high-conf pnr-match → IMPORTED + VISIBLE', async () => {
  const rig = await makeRig();
  try {
    const runId = await rig.importRunStore.startRun({
      sourceSystem: 'drive',
      mode: 'incremental',
    });
    const result = await rig.pipeline.importSingleAsset({
      sourceSystem: 'drive',
      importRunId: runId,
      sourceRecord: {
        sourceRecordId: 'drive-abc-123',
        originalDriveFileId: 'abc123',
        originalDrivePath: '/Kunder/19800101-1234/2026/journal.pdf',
        originalFileName: 'journal-anteckning-19800101-1234.pdf',
        mimeType: 'application/pdf',
        documentDate: '2026-03-15',
        body: Buffer.from('fake pdf content for high-conf test'),
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.asset.patientId, 'pat-known-001');
    assert.equal(result.asset.category, 'journal');
    // High-conf → markeras VISIBLE_ON_PATIENT_CARD
    assert.equal(result.asset.status, 'VISIBLE_ON_PATIENT_CARD');
    assert.ok(result.asset.checksum);
    assert.ok(result.asset.storageKey);
    // Encounter länkad via journalStore-stub
    assert.equal(result.encounterLink?.encounterId, 'enc-001');
    // Provenance bevarad
    assert.equal(result.asset.originalDriveFileId, 'abc123');
    assert.equal(result.asset.originalDrivePath, '/Kunder/19800101-1234/2026/journal.pdf');
  } finally {
    /* leave tmp for inspection */
  }
});

test('importSingleAsset: no patient match → NEEDS_REVIEW + queue-item', async () => {
  const rig = await makeRig();
  const runId = await rig.importRunStore.startRun({
    sourceSystem: 'drive',
    mode: 'incremental',
  });
  const result = await rig.pipeline.importSingleAsset({
    sourceSystem: 'drive',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'drive-xyz',
      originalFileName: 'okand-fil.pdf',
      originalDrivePath: '/unknown/path',
      mimeType: 'application/pdf',
      body: Buffer.from('orphan-pdf-content'),
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.equal(result.asset.patientId, 'unknown');
  // Review-queue ska ha 1 pending
  const pending = rig.reviewQueueStore.listPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].reason, 'no_patient_match');
});

test('importSingleAsset: duplicate detection → DUPLICATE status', async () => {
  const rig = await makeRig();
  const runId = await rig.importRunStore.startRun({
    sourceSystem: 'drive',
    mode: 'incremental',
  });
  const body = Buffer.from('same-checksum-payload-12345');
  const r1 = await rig.pipeline.importSingleAsset({
    sourceSystem: 'drive',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'drive-dup-1',
      originalFileName: 'journal-19800101-1234.pdf',
      originalDrivePath: '/Kunder/19800101-1234/journal.pdf',
      mimeType: 'application/pdf',
      documentDate: '2026-03-15',
      body,
    },
  });
  assert.equal(r1.ok, true);
  const r2 = await rig.pipeline.importSingleAsset({
    sourceSystem: 'drive',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'drive-dup-2',
      originalFileName: 'journal-19800101-1234.pdf',
      originalDrivePath: '/Kunder/19800101-1234/duplicate.pdf',
      mimeType: 'application/pdf',
      documentDate: '2026-03-15',
      body, // same body → same checksum
    },
  });
  assert.equal(r2.status, 'DUPLICATE');
  assert.equal(r2.asset.status, 'DUPLICATE');
});

test('importSingleAsset: no body (link-only) → LINK_ONLY_BLOCKER', async () => {
  const rig = await makeRig();
  const runId = await rig.importRunStore.startRun({
    sourceSystem: 'drive',
    mode: 'incremental',
  });
  const result = await rig.pipeline.importSingleAsset({
    sourceSystem: 'drive',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'drive-linkonly',
      originalDriveFileId: 'xyz789',
      originalDrivePath: '/somewhere/file.pdf',
      originalFileName: 'file.pdf',
      mimeType: 'application/pdf',
      // body saknas helt
    },
  });
  assert.equal(result.status, 'LINK_ONLY_BLOCKER');
  const run = rig.importRunStore.getRun(runId);
  assert.equal(run.totalLinkOnlyBlockers, 1);
});

test('fullImportRun: counters uppdateras + run stängs', async () => {
  const rig = await makeRig();
  // Vi har inga discover-records (default-discover returnerar [] för drive utan client),
  // så vi använder old_cco-discovery med en fake index-fil.
  // För enkelhet kör vi manuellt: starta run + 2 imports + finishRun.
  const runId = await rig.importRunStore.startRun({
    sourceSystem: 'drive',
    mode: 'full',
  });
  await rig.pipeline.importSingleAsset({
    sourceSystem: 'drive',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'r1',
      originalFileName: 'journal-19800101-1234.pdf',
      originalDrivePath: '/Kunder/19800101-1234/journal.pdf',
      mimeType: 'application/pdf',
      documentDate: '2026-03-15',
      body: Buffer.from('payload-a'),
    },
  });
  await rig.pipeline.importSingleAsset({
    sourceSystem: 'drive',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'r2',
      originalFileName: 'okand.pdf',
      originalDrivePath: '/orphan/x',
      mimeType: 'application/pdf',
      body: Buffer.from('payload-b'),
    },
  });
  const finished = await rig.importRunStore.finishRun(runId);
  assert.equal(finished.totalDiscovered, 2);
  assert.equal(finished.totalImported, 1, 'one high-conf import');
  assert.equal(finished.totalNeedsReview, 1, 'one orphan to review');
  assert.equal(finished.totalVerified, 1);
  assert.ok(finished.finishedAt);
});

test('fullImportRun-wrapper: tom discovery för drive utan client → run klar med 0 imports', async () => {
  const rig = await makeRig();
  const out = await rig.pipeline.fullImportRun({
    sourceSystem: 'drive',
    mode: 'incremental',
  });
  assert.ok(out.runId);
  assert.equal(out.run.totalDiscovered, 0);
  assert.equal(out.run.totalImported, 0);
  assert.ok(out.run.finishedAt);
});
