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
const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createCcoAssetImportRunStore } = require('../../src/ops/ccoAssetImportRunStore');
const { createCcoAssetReviewQueueStore } = require('../../src/ops/ccoAssetReviewQueueStore');
const { createLocalProvider } = require('../../src/ops/ccoSecureStorageProvider');

async function makeJpegBuffer() {
  const sharp = require('sharp');
  return sharp({
    create: {
      width: 24,
      height: 24,
      channels: 3,
      background: { r: 130, g: 90, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
}

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

test('ORD-43: importSingleAsset skapar thumbnailKey för JPEG-foto', async () => {
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
        sourceRecordId: 'drive-photo-jpg',
        originalDriveFileId: 'drive-photo-jpg',
        originalDrivePath: '/Kunder/19800101-1234/2026/fore-bild.jpg',
        originalFileName: 'fore-bild-19800101-1234.jpg',
        mimeType: 'image/jpeg',
        documentDate: '2026-03-15',
        body: await makeJpegBuffer(),
      },
    });
    assert.equal(result.ok, true);
    assert.ok(result.asset.thumbnailKey);
    assert.match(result.asset.thumbnailKey, /\.thumb\.jpg$/);
    const thumb = await rig.storage.getObject(result.asset.thumbnailKey);
    assert.equal(thumb.mimeType, 'image/jpeg');
    assert.ok(thumb.size > 0);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
});

test('ORD-43: korrupt bild ger thumbnailKey=null utan import-krasch', async () => {
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
        sourceRecordId: 'drive-photo-bad',
        originalDriveFileId: 'drive-photo-bad',
        originalDrivePath: '/Kunder/19800101-1234/2026/operation.jpg',
        originalFileName: 'operation-19800101-1234.jpg',
        mimeType: 'image/jpeg',
        documentDate: '2026-03-15',
        body: Buffer.from('not a real image'),
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.asset.thumbnailKey, null);
  } finally {
    await fs.rm(rig.tmp, { recursive: true, force: true });
  }
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

// -----------------------------------------------------------------------------
// OWNER-SKÄRPNING #5 — pipeline auto-LINK_ONLY_BLOCKER
// -----------------------------------------------------------------------------

test('OS#5: pipeline emit asset.link_only_blocker_flagged audit för Drive-record utan body', async () => {
  const rig = await makeRig();
  const runId = await rig.importRunStore.startRun({
    sourceSystem: 'drive',
    mode: 'full',
  });
  const result = await rig.pipeline.importSingleAsset({
    sourceSystem: 'drive',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'drive-os5-001',
      originalDriveFileId: 'drive-id-abc-os5',
      originalDrivePath: '/Kunder/some/file.pdf',
      originalFileName: 'no-binary.pdf',
      mimeType: 'application/pdf',
      // body saknas
    },
  });
  assert.equal(result.status, 'LINK_ONLY_BLOCKER');
  // Audit-event ska emit:as
  const ev = rig.audit.events.find((e) => e.action === 'asset.link_only_blocker_flagged');
  assert.ok(ev, 'asset.link_only_blocker_flagged audit saknas');
  assert.equal(ev.detail.hasDriveProvenance, true);
  assert.equal(ev.detail.originalDriveFileId, 'drive-id-abc-os5');
});

test('OS#5: pipeline loadBody-fel + Drive-provenance → LINK_ONLY_BLOCKER (inte FAILED_IMPORT)', async () => {
  const rig = await makeRig();
  const runId = await rig.importRunStore.startRun({
    sourceSystem: 'drive',
    mode: 'full',
  });
  const result = await rig.pipeline.importSingleAsset({
    sourceSystem: 'drive',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'drive-os5-002',
      originalDriveFileId: 'drive-fail-load',
      originalFileName: 'will-fail-load.pdf',
      mimeType: 'application/pdf',
      loadBody: async () => {
        throw new Error('drive_api_403');
      },
    },
  });
  assert.equal(result.status, 'LINK_ONLY_BLOCKER');
  const run = rig.importRunStore.getRun(runId);
  assert.equal(run.totalLinkOnlyBlockers, 1);
  assert.equal(run.totalFailed, 0, 'med Drive-provenance: räknas som blocker, inte fail');
});

test('OS#5: pipeline utan Drive-provenance + loadBody-fel → FAILED_IMPORT (inte blocker)', async () => {
  // Använd source 'meridiq' för run (importRunStore accepterar bara drive/meridiq/old_cco),
  // men source-record har INGEN Drive-provenance — så loadBody-fel ska bli FAILED_IMPORT.
  const rig = await makeRig();
  const runId = await rig.importRunStore.startRun({
    sourceSystem: 'meridiq',
    mode: 'full',
  });
  const result = await rig.pipeline.importSingleAsset({
    sourceSystem: 'meridiq',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'meridiq-fail-001',
      // INGEN originalDriveFileId/Path → ingen Drive-provenance
      originalFileName: 'meridiq-export.pdf',
      mimeType: 'application/pdf',
      loadBody: async () => {
        throw new Error('meridiq_api_timeout');
      },
    },
  });
  assert.equal(result.status, 'FAILED_IMPORT');
  const run = rig.importRunStore.getRun(runId);
  assert.equal(run.totalLinkOnlyBlockers, 0);
  assert.equal(run.totalFailed, 1);
});

// -----------------------------------------------------------------------------
// OWNER-SKÄRPNING #6 (P0.D+++) — pipeline-guard mot predicted folder + patient-validation
// -----------------------------------------------------------------------------

test('OS#6: importSingleAsset med folder-only record (loadBody returnerar null) → LINK_ONLY_BLOCKER, NOT VERIFIED', async () => {
  const rig = await makeRig();
  const runId = await rig.importRunStore.startRun({
    sourceSystem: 'old_cco',
    mode: 'full',
  });
  const result = await rig.pipeline.importSingleAsset({
    sourceSystem: 'old_cco',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'folder-only-os6-001',
      originalDriveFileId: 'folder-id-zzz',
      originalDrivePath: '/SomeFolder',
      originalFileName: null,
      mimeType: null,
      _folderOnly: true,
      loadBody: async () => null,
    },
  });
  assert.equal(result.status, 'LINK_ONLY_BLOCKER');
  assert.notEqual(result.status, 'VERIFIED_IN_CCO');
  assert.notEqual(result.status, 'VISIBLE_ON_PATIENT_CARD');
  // Audit-event ska emit:as med folder_only_no_binary
  const ev = rig.audit.events.find(
    (e) =>
      e.action === 'asset.link_only_blocker_flagged' &&
      String(e.detail?.reason || '').includes('folder_only_no_binary')
  );
  assert.ok(ev, 'asset.link_only_blocker_flagged med folder_only_no_binary saknas');
});

test('OS#6: importSingleAsset med _needsPatientReview=true → NEEDS_REVIEW + queue-item (även med binär)', async () => {
  const rig = await makeRig();
  const runId = await rig.importRunStore.startRun({
    sourceSystem: 'old_cco',
    mode: 'full',
  });
  const result = await rig.pipeline.importSingleAsset({
    sourceSystem: 'old_cco',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'review-os6-002',
      originalDriveFileId: 'drv-os6-002',
      originalDrivePath: '/AnonPatients/raw-id/x.pdf',
      originalFileName: 'x.pdf',
      mimeType: 'application/pdf',
      documentDate: '2026-05-15',
      body: Buffer.from('valid-binary-content-os6-002'),
      patientId: null,
      _rawPatientId: 'unknown_orphan_id',
      _patientValidation: {
        valid: false,
        ccoPatientId: null,
        reason: 'no_translation_found',
        rawId: 'unknown_orphan_id',
      },
      _needsPatientReview: true,
    },
  });
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.notEqual(result.status, 'VERIFIED_IN_CCO');
  assert.notEqual(result.status, 'VISIBLE_ON_PATIENT_CARD');
  const pending = rig.reviewQueueStore.listPending();
  assert.ok(pending.length >= 1, 'review-queue item ska skapas');
  // Asset bör finnas på disk eftersom vi hade binär (storageKey + checksum
  // satta) — men status är NEEDS_REVIEW pga adapter-flag.
  assert.ok(result.asset.storageKey);
  assert.ok(result.asset.checksum);
});

test('OS#6: importSingleAsset utan patientId från adapter → status=NEEDS_REVIEW (aldrig VERIFIED)', async () => {
  const rig = await makeRig();
  const runId = await rig.importRunStore.startRun({
    sourceSystem: 'old_cco',
    mode: 'full',
  });
  // Simulerar exakt vad adapter producerar utan customerStore:
  // patientId: null, _needsPatientReview: true, men binär finns
  const result = await rig.pipeline.importSingleAsset({
    sourceSystem: 'old_cco',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'no-cust-store-os6-003',
      originalDriveFileId: 'drv-os6-003',
      originalDrivePath: '/x',
      originalFileName: 'doc.pdf',
      mimeType: 'application/pdf',
      body: Buffer.from('valid-binary-os6-003'),
      patientId: null,
      _needsPatientReview: true,
      _patientValidation: {
        valid: false,
        ccoPatientId: null,
        reason: 'no_customer_store_configured',
      },
    },
  });
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.notEqual(result.status, 'VERIFIED_IN_CCO');
  // Review-reason ska reflektera translation-failure
  const pending = rig.reviewQueueStore.listPending();
  const item = pending.find((p) => p.assetId === result.asset.id);
  assert.ok(item);
  assert.equal(item.reason, 'patient_id_translation_failed');
});

test('OS#6: predicted Drive-folder-record kan ALDRIG bli VISIBLE_ON_PATIENT_CARD via auto-pipeline', async () => {
  const rig = await makeRig();
  const runId = await rig.importRunStore.startRun({
    sourceSystem: 'old_cco',
    mode: 'full',
  });
  // Förbered record som hade matchat en patient via folder-namn ÄVEN
  // om _folderOnly är true → guard ska ändå blockera till LINK_ONLY_BLOCKER.
  const result = await rig.pipeline.importSingleAsset({
    sourceSystem: 'old_cco',
    importRunId: runId,
    sourceRecord: {
      sourceRecordId: 'predicted-os6-004',
      originalDriveFileId: 'folder-aaa',
      originalDrivePath: '/Kunder/19800101-1234/folder',
      originalFileName: null,
      mimeType: null,
      _folderOnly: true,
      // Trots att patientId skulle gå att gissa via pnr i path,
      // _folderOnly måste alltid stoppa till blocker.
      patientId: 'pat-known-001',
      loadBody: async () => null,
    },
  });
  assert.equal(result.status, 'LINK_ONLY_BLOCKER');
  // Verifiera att assetet inte fick VISIBLE/VERIFIED status någonsin
  assert.equal(result.asset.status, 'LINK_ONLY_BLOCKER');
});
