#!/usr/bin/env node
'use strict';

/**
 * Drive history — journal-PDF binary import (Batch 1 scope).
 *
 *   node scripts/import-drive-journal-pdfs.js --verify
 *   node scripts/import-drive-journal-pdfs.js --dry-run
 *   node scripts/import-drive-journal-pdfs.js --commit --limit 10
 */

require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable } = require('node:stream');

const REPO = path.resolve(__dirname, '..');
const DATA = path.join(REPO, 'data');
const REPO_ROOT = REPO;

const {
  loadDriveImportContext,
  listJournalImportCandidates,
  sliceCandidatesByPatients,
  uniquePatientIds,
} = require('./migration/lib/driveHistoryImportCandidates');
const { loadServiceAccountFromEnv } = require('../src/lib/googleDriveClient');
const {
  getAccessToken,
  loadServiceAccountJson,
  openDriveFileReadStream,
} = require('./migration/lib/googleDriveApi');
const { createCcoAssetImportPipeline } = require('../src/ops/ccoAssetImportPipeline');
const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoAssetImportRunStore } = require('../src/ops/ccoAssetImportRunStore');
const { createCcoAssetReviewQueueStore } = require('../src/ops/ccoAssetReviewQueueStore');
const { createCcoJournalStore } = require('../src/ops/ccoJournalStore');
const { createSecureStorageProvider } = require('../src/ops/ccoSecureStorageProvider');
const { createCcoAuditLog } = require('../src/security/ccoAuditLog');
const {
  _internal: { validatePatientIdAgainstCcoMaster },
} = require('../src/ops/ccoOldCcoAssetAdapter');

const FATAL_CODES = new Set([
  'drive_config',
  'drive_auth',
  'storage_put_failed',
  'checksum_mismatch',
  'audit_failed',
  'missing_patient_id',
  'drive_link_blocker',
  'repo_storage_path',
  'patient_id_invalid',
  'unexpected_duplicate_import',
  'pii_github_risk',
]);

function parseArgs(argv) {
  const args = {
    commit: false,
    dryRun: false,
    verify: false,
    limit: 0,
    canaryPatients: 0,
    patientIds: null,
    delayMs: 200,
    reportJson: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--commit') args.commit = true;
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--verify') args.verify = true;
    else if (flag === '--limit') args.limit = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--canary-patients')
      args.canaryPatients = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--patient-ids')
      args.patientIds = new Set(String(argv[++i]).split(',').filter(Boolean));
    else if (flag === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--report-json') args.reportJson = path.resolve(argv[++i]);
  }
  if (!args.commit && !args.dryRun && !args.verify) args.dryRun = true;
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponseBodyBuffer(response) {
  if (typeof response.arrayBuffer === 'function') {
    return Buffer.from(await response.arrayBuffer());
  }
  const stream = response.body?.getReader ? Readable.fromWeb(response.body) : response.body;
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function createDriveDownloadClient(serviceAccount) {
  let accessToken = null;
  let tokenFetchedAt = 0;
  async function ensureToken() {
    if (accessToken && Date.now() - tokenFetchedAt < 50 * 60 * 1000) return accessToken;
    accessToken = await getAccessToken(serviceAccount);
    tokenFetchedAt = Date.now();
    return accessToken;
  }
  return {
    async downloadBuffer(driveFileId) {
      const token = await ensureToken();
      const response = await openDriveFileReadStream({ accessToken: token, driveFileId });
      return readResponseBodyBuffer(response);
    },
  };
}

async function assertStorageOutsideRepo(storage) {
  const stats = typeof storage.stats === 'function' ? await storage.stats() : null;
  const root = path.resolve(String(stats?.rootPath || ''));
  if (!root) return;
  if (root === REPO_ROOT || root.startsWith(`${REPO_ROOT}${path.sep}`)) {
    const err = new Error(`Secure storage root ligger i repo: ${root}`);
    err.code = 'repo_storage_path';
    throw err;
  }
}

function assetHasDriveLinkLeak(asset) {
  const blob = JSON.stringify(asset || {});
  return /drive\.google\.com|webViewLink/i.test(blob);
}

async function auditAppend(auditLog, event) {
  if (!auditLog?.append) return;
  try {
    auditLog.append(event);
  } catch (err) {
    const e = new Error(`audit append failed: ${err.message}`);
    e.code = 'audit_failed';
    throw e;
  }
}

function emptyStats(runId, { dryRun, phase, candidateCount }) {
  return {
    runId,
    dryRun,
    phase: phase || 'full',
    candidateCount,
    attempted: 0,
    downloaded: 0,
    imported: 0,
    visible: 0,
    duplicate: 0,
    skipped: 0,
    failed: 0,
    fatalErrors: 0,
    checksumOk: 0,
    needsEncounterReview: 0,
    timelineEvents: 0,
    auditEvents: 0,
    customersTouched: [],
    errors: [],
    stoppedReason: null,
  };
}

function buildCustomerStoreAdapter(ctx) {
  return {
    ...ctx.customerStore,
    async peekTenantCustomerState() {
      return { directory: ctx.directory };
    },
  };
}

function selectBatch(candidates, { canaryPatients = 0, patientIds = null, limit = 0 } = {}) {
  let batch = candidates;
  if (patientIds?.size) {
    batch = sliceCandidatesByPatients(batch, patientIds);
  } else if (canaryPatients > 0) {
    const ids = uniquePatientIds(batch).slice(0, canaryPatients);
    batch = sliceCandidatesByPatients(batch, new Set(ids));
  }
  if (limit > 0) batch = batch.slice(0, limit);
  return batch;
}

async function runDriveJournalImport({
  commit = false,
  canaryPatients = 0,
  patientIds = null,
  limit = 0,
  delayMs = 200,
  phase = 'full',
  runId = `drive-journal-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 6)}`,
  assetStore = null,
  auditLog = null,
  pipeline = null,
  driveClient = null,
  ctx = null,
} = {}) {
  const importCtx = ctx || loadDriveImportContext({ repoRoot: REPO });
  const candidates = listJournalImportCandidates(importCtx);
  const batch = selectBatch(candidates, { canaryPatients, patientIds, limit });
  const stats = emptyStats(runId, { dryRun: !commit, phase, candidateCount: candidates.length });
  stats.batchSize = batch.length;
  stats.batchPatients = uniquePatientIds(batch).length;

  if (!commit) {
    stats.wouldProcess = batch.length;
    stats.withDriveFileId = batch.filter((c) => c.file.driveFileId).length;
    stats.withoutDriveFileId = batch.length - stats.withDriveFileId;
    return stats;
  }

  if (!driveClient) {
    const driveConfig = loadServiceAccountFromEnv(process.env);
    if (!driveConfig.ok) {
      const err = new Error('Drive service account saknas');
      err.code = 'drive_config';
      throw err;
    }
    const serviceAccount =
      driveConfig.serviceAccount ||
      loadServiceAccountJson(process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON);
    driveClient = createDriveDownloadClient(serviceAccount);
  }

  const store =
    assetStore ||
    (await createCcoPatientAssetStore({
      filePath: path.join(DATA, 'cco-patient-assets.json'),
      auditLog,
    }));
  const customerStoreAdapter = buildCustomerStoreAdapter(importCtx);
  const touchedPatients = new Set();
  const actor = { userId: 'import-drive-journal', role: 'system', tenantId: 'hair_tp' };

  for (const row of batch) {
    stats.attempted += 1;
    const { file, patientId, documentDate } = row;

    try {
      if (!patientId) {
        const e = new Error('patientId saknas på high-confidence');
        e.code = 'missing_patient_id';
        throw e;
      }

      const validation = await validatePatientIdAgainstCcoMaster(
        patientId,
        'hair_tp',
        customerStoreAdapter
      );
      if (!validation.valid) {
        const e = new Error(`patientId ogiltig: ${patientId}`);
        e.code = 'patient_id_invalid';
        throw e;
      }

      if (importCtx.driveMaps.review.has(patientId)) {
        stats.skipped += 1;
        stats.errors.push({
          fileId: file.id,
          code: 'medium_low_folder_mapping',
          message: 'review mapping',
        });
        continue;
      }

      if (importCtx.ccoIndex.driveIds.has(file.driveFileId)) {
        stats.duplicate += 1;
        continue;
      }
      if (importCtx.ccoIndex.sourceRecordIds.has(file.id)) {
        stats.duplicate += 1;
        continue;
      }

      if (!file.driveFileId) {
        stats.skipped += 1;
        stats.errors.push({
          fileId: file.id,
          code: 'missing_drive_file_id',
          message: 'Ingen driveFileId',
        });
        continue;
      }

      const buf = await driveClient.downloadBuffer(file.driveFileId);
      if (!buf?.length) throw new Error('Tom fil från Drive');
      stats.downloaded += 1;

      const sourceRecord = {
        patientId,
        personnummer: file.personnummer || null,
        sourceRecordId: file.id,
        originalDriveFileId: file.driveFileId,
        originalDrivePath: file.relativePath || null,
        originalFileName: file.fileName || null,
        mimeType: file.mimeType || 'application/pdf',
        documentDate,
        body: buf,
      };

      const result = await pipeline.importSingleAsset({
        sourceSystem: 'drive_import',
        sourceRecord,
        importRunId: runId,
        tenantId: 'hair_tp',
        actor,
      });

      if (result.status === 'LINK_ONLY_BLOCKER') {
        const e = new Error('LINK_ONLY_BLOCKER — binär saknas trots download');
        e.code = 'drive_link_blocker';
        throw e;
      }
      if (result.status === 'FAILED_IMPORT') {
        const e = new Error(result.error || 'FAILED_IMPORT');
        e.code = 'storage_put_failed';
        throw e;
      }
      if (result.status === 'DUPLICATE') {
        stats.duplicate += 1;
        continue;
      }

      const asset = result.asset || store.getAsset(result.asset?.id);
      if (!asset?.storageKey || !asset?.checksum || !(asset.fileSize > 0) || !asset.mimeType) {
        const e = new Error('storageKey/checksum/fileSize/mimeType saknas efter import');
        e.code = 'storage_put_failed';
        throw e;
      }
      if (assetHasDriveLinkLeak(asset)) {
        const e = new Error('Drive-länk i asset payload');
        e.code = 'drive_link_blocker';
        throw e;
      }

      stats.checksumOk += 1;

      if (result.status === 'VISIBLE_ON_PATIENT_CARD') {
        stats.visible += 1;
        stats.imported += 1;
      } else if (result.status === 'NEEDS_REVIEW') {
        stats.skipped += 1;
      } else if (result.status === 'VERIFIED_IN_CCO') {
        stats.imported += 1;
      } else {
        stats.imported += 1;
      }

      if (!result.encounterLink?.encounterId) {
        stats.needsEncounterReview += 1;
        await store.patchAssetNamingMetadata(
          asset.id,
          {
            uiStatus: 'needs_encounter_review',
            technicalInfo: {
              ...(asset.technicalInfo || {}),
              needsEncounterReview: true,
              timelineSource: 'drive_import',
              importBadge: 'drive_history',
            },
          },
          { actor, reason: 'drive_journal_no_encounter_match' }
        );
      }

      touchedPatients.add(patientId);
      importCtx.ccoIndex.driveIds.add(file.driveFileId);
      importCtx.ccoIndex.sourceRecordIds.add(file.id);

      await auditAppend(auditLog, {
        ts: new Date().toISOString(),
        action: 'drive_journal_imported',
        actor,
        target: { kind: 'patient', id: patientId },
        result: 'ok',
        detail: {
          assetId: asset.id,
          importRunId: runId,
          sourceRecordId: file.id,
          originalDriveFileId: file.driveFileId,
          storageKey: asset.storageKey,
          checksum: asset.checksum,
          fileSize: asset.fileSize,
          status: result.status,
          needsEncounterReview: !result.encounterLink?.encounterId,
        },
      });
      stats.auditEvents += 1;
      stats.timelineEvents += 1;
    } catch (err) {
      stats.failed += 1;
      const code = err.code || 'import_failed';
      stats.errors.push({
        fileId: file.id,
        driveFileId: file.driveFileId || null,
        patientId,
        code,
        message: err.message,
      });
      if (FATAL_CODES.has(code)) {
        stats.fatalErrors += 1;
        stats.stoppedReason = code;
        break;
      }
    }

    if (delayMs) await sleep(delayMs);
  }

  stats.customersTouched = [...touchedPatients];
  return stats;
}

async function main() {
  const args = parseArgs(process.argv);
  const runId = `drive-journal-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 6)}`;

  const driveConfig = loadServiceAccountFromEnv(process.env);
  if (args.verify) {
    console.log(
      JSON.stringify(
        {
          ok: driveConfig.ok,
          verify: { drive: driveConfig.ok },
          runId,
        },
        null,
        2
      )
    );
    process.exit(driveConfig.ok ? 0 : 2);
  }

  const ctx = loadDriveImportContext({ repoRoot: REPO });

  if (args.dryRun) {
    const stats = await runDriveJournalImport({
      commit: false,
      canaryPatients: args.canaryPatients,
      patientIds: args.patientIds,
      limit: args.limit,
      phase: args.canaryPatients ? 'canary' : 'dry-run',
      runId,
      ctx,
    });
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const auditPath = path.join(DATA, 'cco-audit.jsonl');
  const auditLog = createCcoAuditLog({ filePath: auditPath });
  const assetStore = await createCcoPatientAssetStore({
    filePath: path.join(DATA, 'cco-patient-assets.json'),
    auditLog,
  });
  const importRunStore = await createCcoAssetImportRunStore({
    filePath: path.join(DATA, 'cco-asset-import-runs.json'),
    auditLog,
  });
  const reviewQueueStore = await createCcoAssetReviewQueueStore({
    filePath: path.join(DATA, 'cco-asset-review-queue.json'),
    auditLog,
  });
  const journalStore = await createCcoJournalStore({
    filePath: path.join(DATA, 'cco-journal.json'),
  });
  const storage = createSecureStorageProvider({ provider: 'local' });
  await assertStorageOutsideRepo(storage);

  const customerStoreAdapter = buildCustomerStoreAdapter(ctx);
  const pipeline = createCcoAssetImportPipeline({
    assetStore,
    importRunStore,
    reviewQueueStore,
    storage,
    customerStore: customerStoreAdapter,
    journalStore,
    auditLog,
  });

  const serviceAccount =
    driveConfig.serviceAccount ||
    loadServiceAccountJson(process.env.ARCANA_GOOGLE_SERVICE_ACCOUNT_JSON);
  const driveClient = createDriveDownloadClient(serviceAccount);
  const actor = { userId: 'import-drive-journal', role: 'system', tenantId: 'hair_tp' };

  const importRunId = await importRunStore.startRun(
    { sourceSystem: 'drive_import', mode: 'incremental', createdBy: 'drive-journal-batch1' },
    { actor }
  );

  const stats = await runDriveJournalImport({
    commit: true,
    canaryPatients: args.canaryPatients,
    patientIds: args.patientIds,
    limit: args.limit,
    delayMs: args.delayMs,
    runId: importRunId,
    assetStore,
    auditLog,
    pipeline,
    driveClient,
    ctx,
  });

  await importRunStore.finishRun(importRunId, { actor });

  if (args.reportJson) {
    await fs.mkdir(path.dirname(args.reportJson), { recursive: true });
    await fs.writeFile(args.reportJson, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify(stats, null, 2));
  if (stats.fatalErrors > 0 || stats.stoppedReason) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: err.message, code: err.code || 'fatal' }));
    process.exit(1);
  });
}

module.exports = {
  runDriveJournalImport,
  FATAL_CODES,
  loadDriveImportContext,
  listJournalImportCandidates,
  createDriveDownloadClient,
};
