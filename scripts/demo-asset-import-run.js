#!/usr/bin/env node
'use strict';

/**
 * demo-asset-import-run.js — Första demo-import-run för CCO Asset Import Pipeline.
 *
 * SYFTE: bevisa end-to-end att en patientfil kan landa DIREKT i CCO secure
 * storage, kopplas till en patient och bli VISIBLE_ON_PATIENT_CARD — utan
 * att staff någonsin behöver öppna Google Drive.
 *
 * Använder ENDAST mock/anonymiserad data — INGA riktiga patienter.
 *
 * Producerar:
 *   - 1 asset hela vägen till VISIBLE_ON_PATIENT_CARD
 *   - 1 LINK_ONLY_BLOCKER  (saknar binär — bara Drive-länk)
 *   - 1 NEEDS_REVIEW       (osäker patient-match)
 *   - 1 DUPLICATE          (samma checksum som första assetet)
 *   - 1 FAILED_IMPORT      (loadBody-fel utan Drive-provenance)
 *
 * Output:
 *   - data/demo/cco-patient-assets.json     (5 entries)
 *   - data/demo/cco-asset-import-runs.json  (1 run)
 *   - data/demo/cco-asset-review-queue.json (1 item)
 *   - data/demo/cco-audit.jsonl             (audit-trail)
 *   - data/demo/cco-secure-storage/<year>/<month>/<hash>/<uuid>.{pdf,jpg}
 *
 * Compliance:
 *   - Alla patientIds är 'anon-patient-XXX'
 *   - Alla filnamn är 'demo-*'
 *   - INGEN riktig PII
 *
 * Användning:
 *   node scripts/demo-asset-import-run.js
 *   node scripts/demo-asset-import-run.js --clean   (rensar data/demo/ först)
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const {
  createCcoPatientAssetStore,
} = require('../src/ops/ccoPatientAssetStore');
const {
  createCcoAssetImportRunStore,
} = require('../src/ops/ccoAssetImportRunStore');
const {
  createCcoAssetReviewQueueStore,
} = require('../src/ops/ccoAssetReviewQueueStore');
const {
  createLocalProvider,
} = require('../src/ops/ccoSecureStorageProvider');
const {
  createCcoAssetImportPipeline,
} = require('../src/ops/ccoAssetImportPipeline');
const { createCcoAuditLog } = require('../src/security/ccoAuditLog');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const CLEAN = args.includes('--clean');

const ROOT = path.resolve(__dirname, '..');
const DEMO_DIR = path.join(ROOT, 'data', 'demo');
const STORAGE_DIR = path.join(DEMO_DIR, 'cco-secure-storage');

// ---------------------------------------------------------------------------
// Stub customerStore (anonymiserade test-patienter)
// ---------------------------------------------------------------------------
const ANON_CUSTOMERS = [
  { id: 'anon-patient-001', name: 'AnonAlfa AnonBeta', personnummer: '19000101-0001' },
  { id: 'anon-patient-002', name: 'AnonGamma AnonDelta', personnummer: '19000202-0002' },
];

function makeStubCustomerStore() {
  return {
    findByPersonnummer(pnr) {
      return ANON_CUSTOMERS.find((c) => c.personnummer === pnr) || null;
    },
    all() {
      return ANON_CUSTOMERS;
    },
    getById(id) {
      return ANON_CUSTOMERS.find((c) => c.id === id) || null;
    },
  };
}

// ---------------------------------------------------------------------------
// Stub journalStore — tom (vi vill inte koppla till encounter i demo)
// ---------------------------------------------------------------------------
function makeStubJournalStore() {
  return {
    listForPatientOnDate() {
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Mock source-records — 5 olika scenarier (designade för förutsägbara
// status-utfall). DRY: en helper-funktion bygger varje record.
// ---------------------------------------------------------------------------
function buildMockSourceRecords() {
  // PDF-innehåll = "Anonymiserad demo-journal" (samma för dup + första assetet)
  const journalBody = Buffer.from(
    '%PDF-1.4\n% Anonymiserad demo-journal — ingen riktig PII\n%%EOF',
    'utf8'
  );
  return [
    // 1. Hög konfidens → VISIBLE_ON_PATIENT_CARD
    {
      label: 'high_conf_visible',
      sourceSystem: 'drive',
      sourceRecord: {
        sourceRecordId: 'demo-drive-001',
        originalDriveFileId: 'drive-demo-abc-001',
        originalDrivePath: '/AnonPatients/19000101-0001/2026/demo-journal.pdf',
        originalFileName: 'demo-journal-19000101-0001.pdf',
        mimeType: 'application/pdf',
        documentDate: '2026-05-15',
        body: journalBody,
      },
    },
    // 2. LINK_ONLY_BLOCKER — Drive-record utan body
    {
      label: 'link_only_blocker',
      sourceSystem: 'drive',
      sourceRecord: {
        sourceRecordId: 'demo-drive-002',
        originalDriveFileId: 'drive-demo-xyz-002',
        originalDrivePath: '/AnonPatients/unknown-pat/missing-binary.pdf',
        originalFileName: 'demo-missing-binary.pdf',
        mimeType: 'application/pdf',
        // body saknas → LINK_ONLY_BLOCKER
      },
    },
    // 3. NEEDS_REVIEW — okänd patient (ingen pnr-match, ingen folder-match)
    {
      label: 'needs_review',
      sourceSystem: 'drive',
      sourceRecord: {
        sourceRecordId: 'demo-drive-003',
        originalDriveFileId: 'drive-demo-orphan-003',
        originalDrivePath: '/AnonPatients/no-such-patient/demo-foto-fore.jpg',
        originalFileName: 'demo-foto-fore.jpg',
        mimeType: 'image/jpeg',
        documentDate: '2026-05-20',
        body: Buffer.from('mock-jpeg-bytes-anon-no-patient-match', 'utf8'),
      },
    },
    // 4. DUPLICATE — samma checksum som #1
    {
      label: 'duplicate',
      sourceSystem: 'drive',
      sourceRecord: {
        sourceRecordId: 'demo-drive-004',
        originalDriveFileId: 'drive-demo-abc-001-dup',
        originalDrivePath: '/AnonPatients/19000101-0001/2026/demo-journal-dup.pdf',
        originalFileName: 'demo-journal-19000101-0001-dup.pdf',
        mimeType: 'application/pdf',
        documentDate: '2026-05-15',
        body: journalBody, // SAMMA bytes → DUPLICATE
      },
    },
    // 5. FAILED_IMPORT — loadBody-fel UTAN Drive-provenance
    {
      label: 'failed_import',
      sourceSystem: 'meridiq',
      sourceRecord: {
        sourceRecordId: 'demo-meridiq-005',
        // INGEN originalDriveFileId/Path
        originalFileName: 'demo-meridiq-failed.pdf',
        mimeType: 'application/pdf',
        loadBody: async () => {
          throw new Error('demo_simulated_meridiq_timeout');
        },
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
async function setup() {
  if (CLEAN && fs.existsSync(DEMO_DIR)) {
    await fsp.rm(DEMO_DIR, { recursive: true, force: true });
  }
  await fsp.mkdir(DEMO_DIR, { recursive: true });

  const auditLogPath = path.join(DEMO_DIR, 'cco-audit.jsonl');
  const auditLog = createCcoAuditLog({ filePath: auditLogPath });

  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(DEMO_DIR, 'cco-patient-assets.json'),
    auditLog,
  });
  const importRunStore = await createCcoAssetImportRunStore({
    filePath: path.join(DEMO_DIR, 'cco-asset-import-runs.json'),
    auditLog,
  });
  const reviewQueueStore = await createCcoAssetReviewQueueStore({
    filePath: path.join(DEMO_DIR, 'cco-asset-review-queue.json'),
    auditLog,
  });
  const storage = createLocalProvider({ rootPath: STORAGE_DIR });

  const pipeline = createCcoAssetImportPipeline({
    assetStore,
    importRunStore,
    reviewQueueStore,
    storage,
    customerStore: makeStubCustomerStore(),
    journalStore: makeStubJournalStore(),
    auditLog,
  });

  return {
    auditLog,
    auditLogPath,
    assetStore,
    importRunStore,
    reviewQueueStore,
    storage,
    pipeline,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function fmt(n) {
  return String(n).padStart(3);
}

async function main() {
  console.log('=== CCO ASSET IMPORT — DEMO RUN ===');
  console.log(`Demo-dir: ${DEMO_DIR}`);
  console.log(`Storage-rot: ${STORAGE_DIR}`);
  console.log('');

  const rig = await setup();
  const actor = { role: 'system', userId: 'demo-script', tenantId: 'hair_tp' };

  // Starta run
  const runId = await rig.importRunStore.startRun(
    { sourceSystem: 'drive', mode: 'full', createdBy: 'demo-script' },
    { actor }
  );
  console.log(`Run-id: ${runId}`);
  console.log('');

  // Importera 5 mock-records
  const mocks = buildMockSourceRecords();
  const results = [];
  for (const m of mocks) {
    try {
      // Pipeline accepterar drive/meridiq/old_cco — sourceSystem från mock
      const r = await rig.pipeline.importSingleAsset({
        sourceSystem: m.sourceSystem,
        sourceRecord: m.sourceRecord,
        importRunId: runId,
        tenantId: 'hair_tp',
        actor,
      });
      results.push({ label: m.label, ...r });
      console.log(`  [${m.label.padEnd(20)}] → status=${r.status}`);
    } catch (err) {
      results.push({ label: m.label, ok: false, status: 'ERROR', error: err.message });
      console.log(`  [${m.label.padEnd(20)}] → ERROR: ${err.message}`);
    }
  }

  // Stäng run
  const finishedRun = await rig.importRunStore.finishRun(runId, { actor });
  console.log('');

  // ---------------------------------------------------------------------
  // Final stats
  // ---------------------------------------------------------------------
  const stats = rig.assetStore.stats('hair_tp');

  console.log('=== DEMO IMPORT RUN — RESULTAT ===');
  console.log(`Total discovered:               ${fmt(finishedRun.totalDiscovered)}`);
  console.log(`Total imported to CCO storage:  ${fmt(finishedRun.totalImported)}`);
  console.log(`Total verified:                 ${fmt(finishedRun.totalVerified)}`);
  console.log(`Total NEEDS_REVIEW:             ${fmt(finishedRun.totalNeedsReview)}`);
  console.log(`Total DUPLICATE (run-counter):  -   (DUPLICATE räknas inte separat i runs)`);
  console.log(`Total FAILED_IMPORT:            ${fmt(finishedRun.totalFailed)}`);
  console.log(`Total LINK_ONLY_BLOCKER:        ${fmt(finishedRun.totalLinkOnlyBlockers)}   ← detta är ${finishedRun.totalLinkOnlyBlockers} efter run!`);
  console.log('');
  console.log(`Asset-store byStatus:`);
  for (const [k, v] of Object.entries(stats.byStatus)) {
    console.log(`  ${k.padEnd(28)} ${fmt(v)}`);
  }
  console.log('');
  console.log(`linkOnlyBlockerCount: ${stats.linkOnlyBlockerCount} (assets med originalDriveFileId men saknar binär)`);
  console.log(`visibleOnPatientCardCount: ${stats.visibleOnPatientCardCount}`);
  console.log(`needsReviewCount: ${stats.needsReviewCount}`);
  console.log('');
  console.log('cutoverReadiness:');
  console.log(`  ready:   ${stats.cutoverReadiness.ready}`);
  console.log(`  reason:  ${stats.cutoverReadiness.reason}`);
  console.log(`  message: ${stats.cutoverReadiness.message}`);
  console.log('');

  // Hitta VISIBLE-asset och bevisa filen finns på disk
  const visible = results.find((r) => r.status === 'VISIBLE_ON_PATIENT_CARD');
  if (visible && visible.asset) {
    const a = visible.asset;
    const absPath = path.join(STORAGE_DIR, a.storageKey);
    const exists = fs.existsSync(absPath);
    const stat = exists ? fs.statSync(absPath) : null;

    console.log('VISIBLE_ON_PATIENT_CARD asset:');
    console.log(`  id:           ${a.id}`);
    console.log(`  storageKey:   ${a.storageKey}`);
    console.log(`  checksum:     ${a.checksum}`);
    console.log(`  patientId:    ${a.patientId}`);
    console.log(`  category:     ${a.category}`);
    console.log(`  status:       ${a.status}`);
    console.log('');
    console.log('Bevis: FIL FINNS I CCO SECURE STORAGE');
    console.log(`  - Path:     ${absPath}`);
    console.log(`  - Finns:    ${exists ? 'JA' : 'NEJ'}`);
    if (stat) {
      console.log(`  - Storlek:  ${stat.size} bytes`);
    }
    console.log(`  - mimeType: ${a.mimeType}`);
    console.log(`  - Ingen Drive-länk behövs för att öppna denna fil.`);
    console.log('');
  } else {
    console.log('VARNING: ingen VISIBLE_ON_PATIENT_CARD asset producerad — kolla pipeline-loggen.');
    console.log('');
  }

  console.log(`linkOnlyBlockerCount efter denna run: ${stats.linkOnlyBlockerCount}`);
  console.log('(förväntat ≥ 1, demo bygger 1 sådan avsiktligt)');
  console.log('För prod-cutover måste den siffran vara 0 efter alla source-systems körts.');
  console.log('');
  console.log('=== DEMO KLAR ===');

  // Returvärde för automatiserade test eller wrappers
  return {
    runId,
    finishedRun,
    stats,
    results,
    visibleAsset: visible?.asset || null,
  };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('DEMO-RUN FAILED:', err);
      process.exit(1);
    });
}

module.exports = { main };
