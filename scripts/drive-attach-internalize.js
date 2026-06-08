#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const DATA = path.join(REPO, 'data');

const { createCcoAssetImportPipeline } = require('../src/ops/ccoAssetImportPipeline');
const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoAssetImportRunStore } = require('../src/ops/ccoAssetImportRunStore');
const { createCcoAssetReviewQueueStore } = require('../src/ops/ccoAssetReviewQueueStore');
const { createSecureStorageProvider } = require('../src/ops/ccoSecureStorageProvider');
const { getDriveFileMetadata, loadServiceAccountFromEnv } = require('../src/lib/googleDriveClient');
const { getAccessToken, openDriveFileReadStream } = require('./migration/lib/googleDriveApi');
const {
  internalizeDriveAssets,
  inventoryDriveAssets,
  maskValue,
} = require('../src/ops/ccoDriveAssetInternalization');

function parseArgs(argv) {
  const args = {
    dryRun: true,
    go: false,
    source: 'patient-master',
    phase: 'all',
    patientMasterPath: path.join(DATA, 'cco-patient-master.json'),
    assetsPath: path.join(DATA, 'cco-patient-assets.json'),
    runsPath: path.join(DATA, 'cco-asset-import-runs.json'),
    reviewPath: path.join(DATA, 'cco-asset-review-queue.json'),
    reportJson: '',
    limit: 0,
    offset: 0,
    sampleSize: 5,
    verifyDriveAccess: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--commit') args.dryRun = false;
    else if (flag === '--go') args.go = true;
    else if (flag === '--source') args.source = argv[++i];
    else if (flag === '--phase') args.phase = argv[++i];
    else if (flag === '--patient-master') args.patientMasterPath = path.resolve(argv[++i]);
    else if (flag === '--assets') args.assetsPath = path.resolve(argv[++i]);
    else if (flag === '--runs') args.runsPath = path.resolve(argv[++i]);
    else if (flag === '--review') args.reviewPath = path.resolve(argv[++i]);
    else if (flag === '--report-json') args.reportJson = path.resolve(argv[++i]);
    else if (flag === '--limit') args.limit = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--offset') args.offset = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--sample-size') args.sampleSize = Math.max(0, Number(argv[++i]) || 5);
    else if (flag === '--verify-drive-access') args.verifyDriveAccess = true;
  }
  if (!args.dryRun && !args.go) {
    throw new Error('Commit kräver --go. Dry-run är default.');
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function collectPatientMasterDriveRows(state, tenantId = 'hair-tp-clinic') {
  const tenant = state.tenants?.[tenantId];
  const rows = [];
  for (const patient of Array.isArray(tenant?.patients) ? tenant.patients : []) {
    const attachments = Array.isArray(patient.drive?.attachments) ? patient.drive.attachments : [];
    for (const file of attachments) {
      rows.push({ patientId: patient.id, file });
    }
  }
  return rows;
}

function collectMigrationIndexRows(phase) {
  const {
    loadDriveImportContext,
    listFullImportCandidates,
  } = require('./migration/lib/driveHistoryImportCandidates');
  const ctx = loadDriveImportContext({ repoRoot: REPO, dataDir: DATA });
  const phases =
    phase === 'all'
      ? ['documents', 'images']
      : [phase].filter((item) => item === 'documents' || item === 'images');
  return phases.flatMap((item) => listFullImportCandidates(ctx, { phase: item }));
}

async function collectRows(args) {
  if (args.source === 'migration-index') return collectMigrationIndexRows(args.phase);
  if (args.source !== 'patient-master') {
    throw new Error('--source måste vara patient-master eller migration-index.');
  }
  return collectPatientMasterDriveRows(await readJson(args.patientMasterPath));
}

async function responseToBuffer(response) {
  if (typeof response.arrayBuffer === 'function') {
    return Buffer.from(await response.arrayBuffer());
  }
  const chunks = [];
  for await (const chunk of response.body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function createDriveClientFromEnv() {
  const config = loadServiceAccountFromEnv();
  if (!config.ok) {
    throw new Error('Google Drive service account saknas i miljön.');
  }
  let token = '';
  let tokenFetchedAt = 0;
  async function accessToken() {
    if (token && Date.now() - tokenFetchedAt < 50 * 60 * 1000) return token;
    token = await getAccessToken(config.serviceAccount);
    tokenFetchedAt = Date.now();
    return token;
  }
  return {
    serviceAccountEmail: config.serviceAccountEmail,
    async getFileMetadata(driveFileId) {
      const result = await getDriveFileMetadata({
        driveFileId,
        fields: 'id,name,mimeType,size,modifiedTime',
        accessToken: await accessToken(),
      });
      if (!result.ok) throw new Error(result.error || 'Drive metadata misslyckades.');
      return result.metadata;
    },
    async downloadBuffer(driveFileId) {
      const response = await openDriveFileReadStream({
        accessToken: await accessToken(),
        driveFileId,
      });
      return responseToBuffer(response);
    },
  };
}

async function verifyDriveMetadataSamples({ driveClient, rows = [], sampleSize = 5 } = {}) {
  const samples = [];
  let ok = 0;
  let errors = 0;
  for (const row of rows.filter((item) => item.driveFileId).slice(0, sampleSize)) {
    try {
      const metadata = await driveClient.getFileMetadata(row.driveFileId);
      ok += 1;
      samples.push({
        driveRef: maskValue(row.driveFileId, { keepStart: 4, keepEnd: 4 }),
        status: 'ok',
        nameChanged: Boolean(metadata?.name && metadata.name !== row.originalFileName),
        name: maskValue(metadata?.name || row.originalFileName, { keepStart: 1, keepEnd: 1 }),
      });
    } catch (error) {
      errors += 1;
      samples.push({
        driveRef: maskValue(row.driveFileId, { keepStart: 4, keepEnd: 4 }),
        status: 'error',
        error: error.message,
      });
    }
  }
  return { checked: ok + errors, ok, errors, samples };
}

function stripOperationalRows(report) {
  if (!report || !Array.isArray(report.remainingRows)) return report;
  const remainingCount = report.remainingRows.length;
  const safe = { ...report };
  delete safe.remainingRows;
  safe.remaining = { count: remainingCount, rowsRedacted: true };
  return safe;
}

async function main() {
  const args = parseArgs(process.argv);
  const rows = await collectRows(args);
  const assetStore = await createCcoPatientAssetStore({ filePath: args.assetsPath });

  let result;
  let operationalRemainingRows = [];
  if (args.dryRun && !args.verifyDriveAccess) {
    result = inventoryDriveAssets({ rows, assetStore, sampleSize: args.sampleSize });
    operationalRemainingRows = result.remainingRows || [];
  } else {
    const driveClient = createDriveClientFromEnv();
    const storage = createSecureStorageProvider({ provider: 'local' });
    const importRunStore = await createCcoAssetImportRunStore({ filePath: args.runsPath });
    const reviewQueueStore = await createCcoAssetReviewQueueStore({ filePath: args.reviewPath });
    const pipeline = createCcoAssetImportPipeline({
      assetStore,
      importRunStore,
      reviewQueueStore,
      storage,
    });
    result = await internalizeDriveAssets({
      rows,
      assetStore,
      importRunStore,
      reviewQueueStore,
      pipeline,
      driveClient,
      dryRun: args.dryRun,
      go: args.go,
      limit: args.limit,
      offset: args.offset,
      sampleSize: args.sampleSize,
    });
    result.drive = { serviceAccountEmail: driveClient.serviceAccountEmail };
    operationalRemainingRows = result.remainingRows || [];
    if (args.dryRun && args.verifyDriveAccess) {
      result.drive.metadataSample = await verifyDriveMetadataSamples({
        driveClient,
        rows: operationalRemainingRows,
        sampleSize: args.sampleSize,
      });
    }
  }

  result.branch = process.env.GIT_BRANCH || '';
  result.source = args.source;
  result.phase = args.phase;
  result = stripOperationalRows(result);
  if (args.reportJson) {
    await fs.mkdir(path.dirname(args.reportJson), { recursive: true });
    await fs.writeFile(args.reportJson, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(`[drive-attach-internalize] ${error.message}`);
  process.exit(1);
});
