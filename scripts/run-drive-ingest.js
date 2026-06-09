#!/usr/bin/env node
'use strict';

/**
 * Fristående, minnessäker, återupptagbar Drive-ingest-runner.
 * - Single process (körs som Render one-off job) → inga multi-worker-problem.
 * - Idempotent: internalizeDriveAssets hoppar över alreadyInternal.
 * - Återupptagbar: kör bara om — den fortsätter där den var.
 * - Observerbar: skriver progress + ev. fel till /var/data/ingest-progress.json
 *   (läses tillförlitligt via /cco/asset-qa/backfill-thumbnails?readReport=).
 * - Använder appens prod-sökvägar via env (ARCANA_*_PATH), EJ repo/data.
 *
 * Flaggor: --chunk N (default 20), --max N (sluta efter N importerade, för test)
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoAssetImportRunStore } = require('../src/ops/ccoAssetImportRunStore');
const { createCcoAssetReviewQueueStore } = require('../src/ops/ccoAssetReviewQueueStore');
const { createSecureStorageProvider } = require('../src/ops/ccoSecureStorageProvider');
const { createCcoAssetImportPipeline } = require('../src/ops/ccoAssetImportPipeline');
const { internalizeDriveAssets } = require('../src/ops/ccoDriveAssetInternalization');
const {
  getDriveFileMetadata,
  loadServiceAccountFromEnv,
} = require('../src/lib/googleDriveClient');
const { getAccessToken, openDriveFileReadStream } = require('./migration/lib/googleDriveApi');

const STATE_ROOT = process.env.ARCANA_STATE_ROOT || '/var/data';
const PROGRESS_PATH = path.join(STATE_ROOT, 'ingest-progress.json');
const TENANT_ID = 'hair-tp-clinic';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { chunk: 20, max: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--chunk') args.chunk = Math.max(1, Number(argv[++i]) || 20);
    else if (argv[i] === '--max') args.max = Math.max(0, Number(argv[++i]) || 0);
  }
  return args;
}

const progress = {
  startedAt: new Date().toISOString(),
  updatedAt: null,
  finishedAt: null,
  pid: process.pid,
  chunk: 0,
  totalRows: 0,
  processedChunks: 0,
  attempted: 0,
  imported: 0,
  needsReview: 0,
  duplicate: 0,
  failed: 0,
  alreadyInternal: 0,
  remaining: null,
  done: false,
  lastError: null,
};

function writeProgress() {
  progress.updatedAt = new Date().toISOString();
  try {
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
  } catch {
    /* best-effort */
  }
}

function buildDriveClient() {
  const cfg = loadServiceAccountFromEnv();
  if (!cfg.ok) throw new Error('drive_sa_missing — ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON saknas/ogiltig');
  let tok = '';
  let tokAt = 0;
  const accessToken = async () => {
    if (tok && Date.now() - tokAt < 50 * 60 * 1000) return tok;
    tok = await getAccessToken(cfg.serviceAccount);
    tokAt = Date.now();
    return tok;
  };
  const respToBuf = async (r) => {
    if (typeof r.arrayBuffer === 'function') return Buffer.from(await r.arrayBuffer());
    const chunks = [];
    for await (const ch of r.body) chunks.push(ch);
    return Buffer.concat(chunks);
  };
  return {
    serviceAccountEmail: cfg.serviceAccountEmail,
    async getFileMetadata(id) {
      const r = await getDriveFileMetadata({
        driveFileId: id,
        fields: 'id,name,mimeType,size,modifiedTime,createdTime',
        accessToken: await accessToken(),
      });
      if (!r.ok) throw new Error(r.error || 'drive_metadata_failed');
      return r.metadata;
    },
    async downloadBuffer(id) {
      const r = await openDriveFileReadStream({ accessToken: await accessToken(), driveFileId: id });
      return respToBuf(r);
    },
  };
}

function collectRows() {
  const pmPath = path.join(STATE_ROOT, 'cco-patient-master.json');
  const pmState = JSON.parse(fs.readFileSync(pmPath, 'utf8'));
  const tenant = pmState.tenants && pmState.tenants[TENANT_ID];
  const patients = Array.isArray(tenant && tenant.patients) ? tenant.patients : [];
  const rows = [];
  for (const p of patients) {
    const atts = Array.isArray(p.drive && p.drive.attachments) ? p.drive.attachments : [];
    for (const file of atts) rows.push({ patientId: p.id, file });
  }
  return rows;
}

async function main() {
  const args = parseArgs();
  progress.chunk = args.chunk;
  writeProgress();

  const assetStore = await createCcoPatientAssetStore({
    filePath:
      process.env.ARCANA_CCO_PATIENT_ASSETS_PATH || path.join(STATE_ROOT, 'cco-patient-assets.json'),
  });
  const importRunStore = await createCcoAssetImportRunStore({
    filePath:
      process.env.ARCANA_CCO_ASSET_IMPORT_RUNS_PATH ||
      path.join(STATE_ROOT, 'cco-asset-import-runs.json'),
  });
  const reviewQueueStore = await createCcoAssetReviewQueueStore({
    filePath:
      process.env.ARCANA_CCO_ASSET_REVIEW_QUEUE_PATH ||
      path.join(STATE_ROOT, 'cco-asset-review-queue.json'),
  });
  const storage = createSecureStorageProvider({ provider: 'local' });
  const pipeline = createCcoAssetImportPipeline({
    assetStore,
    importRunStore,
    reviewQueueStore,
    storage,
  });
  const driveClient = buildDriveClient();
  const rows = collectRows();
  progress.totalRows = rows.length;
  writeProgress();

  for (;;) {
    const report = await internalizeDriveAssets({
      rows,
      assetStore,
      importRunStore,
      reviewQueueStore,
      pipeline,
      driveClient,
      dryRun: false,
      go: true,
      limit: args.chunk,
      sampleSize: 0,
      driveThrottleMs: 75,
      tenantId: TENANT_ID,
    });
    const st = (report && report.stats) || {};
    progress.processedChunks += 1;
    progress.attempted += st.attempted || 0;
    progress.imported += st.imported || 0;
    progress.needsReview += st.needsReview || 0;
    progress.duplicate += st.duplicate || 0;
    progress.failed += st.failed || 0;
    progress.alreadyInternal = st.alreadyInternal || progress.alreadyInternal;
    progress.remaining = (st.scanned || 0) - (st.alreadyInternal || 0) - (st.batchSize || 0);
    writeProgress();
    if (!st.batchSize) break;
    if (args.max && progress.imported + progress.needsReview + progress.duplicate >= args.max) break;
  }
  progress.done = true;
  progress.finishedAt = new Date().toISOString();
  writeProgress();
}

main().catch((err) => {
  progress.lastError = err && err.message ? err.message : String(err);
  progress.finishedAt = new Date().toISOString();
  writeProgress();
  process.exitCode = 1;
});
