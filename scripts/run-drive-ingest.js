#!/usr/bin/env node
'use strict';

// Fristående, minnessäker, återupptagbar, OBSERVERBAR Drive-ingest-runner.
// Single process (Render one-off job). Skriver progress + ev. fel till
// /var/data/ingest-progress.json (läses via readReport). Idempotent/resumable.
// Tunga requires sker inuti try → require-fel blir synliga i progress-filen.

const fs = require('node:fs');
const path = require('node:path');

const STATE_ROOT = process.env.ARCANA_STATE_ROOT || '/var/data';
const PROGRESS_PATH = path.join(STATE_ROOT, 'ingest-progress.json');
const TENANT_ID = 'hair-tp-clinic';

const progress = {
  phase: 'boot',
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

// Markör direkt — bevisar att scriptet startade alls
writeProgress();

function parseArgs(argv) {
  const args = { chunk: 20, max: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--chunk') args.chunk = Math.max(1, Number(argv[++i]) || 20);
    else if (argv[i] === '--max') args.max = Math.max(0, Number(argv[++i]) || 0);
  }
  return args;
}

async function main() {
  progress.phase = 'require';
  writeProgress();
  let mods;
  try {
    require('dotenv').config({ quiet: true });
    mods = {
      createCcoPatientAssetStore: require('../src/ops/ccoPatientAssetStore')
        .createCcoPatientAssetStore,
      createCcoAssetImportRunStore: require('../src/ops/ccoAssetImportRunStore')
        .createCcoAssetImportRunStore,
      createCcoAssetReviewQueueStore: require('../src/ops/ccoAssetReviewQueueStore')
        .createCcoAssetReviewQueueStore,
      createSecureStorageProvider: require('../src/ops/ccoSecureStorageProvider')
        .createSecureStorageProvider,
      createCcoAssetImportPipeline: require('../src/ops/ccoAssetImportPipeline')
        .createCcoAssetImportPipeline,
      internalizeDriveAssets: require('../src/ops/ccoDriveAssetInternalization')
        .internalizeDriveAssets,
      getDriveFileMetadata: require('../src/lib/googleDriveClient').getDriveFileMetadata,
      loadServiceAccountFromEnv: require('../src/lib/googleDriveClient').loadServiceAccountFromEnv,
      googleDriveApi: require('./migration/lib/googleDriveApi'),
    };
  } catch (e) {
    progress.lastError = 'require_failed: ' + (e && e.message ? e.message : String(e));
    progress.phase = 'require_failed';
    progress.finishedAt = new Date().toISOString();
    writeProgress();
    throw e;
  }

  const { getAccessToken, openDriveFileReadStream } = mods.googleDriveApi;
  const args = parseArgs(process.argv.slice(2));
  progress.chunk = args.chunk;

  progress.phase = 'drive_client';
  writeProgress();
  const cfg = mods.loadServiceAccountFromEnv();
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
  const driveClient = {
    serviceAccountEmail: cfg.serviceAccountEmail,
    async getFileMetadata(id) {
      const r = await mods.getDriveFileMetadata({
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

  progress.phase = 'stores';
  writeProgress();
  const assetStore = await mods.createCcoPatientAssetStore({
    filePath:
      process.env.ARCANA_CCO_PATIENT_ASSETS_PATH || path.join(STATE_ROOT, 'cco-patient-assets.json'),
  });
  const importRunStore = await mods.createCcoAssetImportRunStore({
    filePath:
      process.env.ARCANA_CCO_ASSET_IMPORT_RUNS_PATH ||
      path.join(STATE_ROOT, 'cco-asset-import-runs.json'),
  });
  const reviewQueueStore = await mods.createCcoAssetReviewQueueStore({
    filePath:
      process.env.ARCANA_CCO_ASSET_REVIEW_QUEUE_PATH ||
      path.join(STATE_ROOT, 'cco-asset-review-queue.json'),
  });
  const storage = mods.createSecureStorageProvider({ provider: 'local' });
  const pipeline = mods.createCcoAssetImportPipeline({
    assetStore,
    importRunStore,
    reviewQueueStore,
    storage,
  });

  progress.phase = 'rows';
  writeProgress();
  const pmState = JSON.parse(fs.readFileSync(path.join(STATE_ROOT, 'cco-patient-master.json'), 'utf8'));
  const tenant = pmState.tenants && pmState.tenants[TENANT_ID];
  const patients = Array.isArray(tenant && tenant.patients) ? tenant.patients : [];
  const rows = [];
  for (const p of patients) {
    const atts = Array.isArray(p.drive && p.drive.attachments) ? p.drive.attachments : [];
    for (const file of atts) rows.push({ patientId: p.id, file });
  }
  progress.totalRows = rows.length;

  progress.phase = 'ingest';
  writeProgress();
  for (;;) {
    const report = await mods.internalizeDriveAssets({
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
  progress.phase = 'done';
  progress.done = true;
  progress.finishedAt = new Date().toISOString();
  writeProgress();
}

main().catch((err) => {
  if (!progress.lastError) progress.lastError = err && err.message ? err.message : String(err);
  progress.finishedAt = new Date().toISOString();
  writeProgress();
  process.exitCode = 1;
});
