#!/usr/bin/env node
'use strict';

/**
 * Drive full customer-history import — binary import per fas.
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
  listFullImportCandidates,
  listCustomerReviewCandidates,
  sliceCandidatesByPatients,
  uniquePatientIds,
  refreshImportIndexes,
} = require('./migration/lib/driveHistoryImportCandidates');
const { loadServiceAccountFromEnv } = require('../src/lib/googleDriveClient');
const {
  getAccessToken,
  loadServiceAccountJson,
  openDriveFileReadStream,
} = require('./migration/lib/googleDriveApi');
const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoImportReviewQueueStore } = require('../src/ops/ccoImportReviewQueueStore');
const { createCcoAuditLog } = require('../src/security/ccoAuditLog');
const { buildAssetNamingMetadata } = require('../src/ops/ccoAssetNaming');
const { resolvePatientCardSection } = require('../src/ops/ccoAssetNaming/patientCardSections');
const { isPhotoCategory } = require('../src/ops/ccoAssetImportPipeline');
const {
  _internal: { validatePatientIdAgainstCcoMaster },
} = require('../src/ops/ccoOldCcoAssetAdapter');
const { createSecureStorageProvider } = require('../src/ops/ccoSecureStorageProvider');
const { recordDriveImportAlias } = require('./migration/lib/driveImportAliasIndex');

const FATAL_CODES = new Set([
  'drive_config',
  'storage_put_failed',
  'checksum_mismatch',
  'audit_failed',
  'missing_patient_id',
  'drive_link_blocker',
  'repo_storage_path',
  'patient_id_invalid',
  'new_customer_created',
  'visible_before_photo_review',
  'failure_rate_exceeded',
]);

function parseArgs(argv) {
  const args = {
    commit: false,
    dryRun: false,
    phase: 'documents',
    limit: 0,
    canaryPatients: 0,
    canaryLimit: 0,
    patientIds: null,
    delayMs: 100,
    maxFailureRate: 0.01,
    reportJson: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--commit') args.commit = true;
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--phase') args.phase = argv[++i];
    else if (flag === '--limit') args.limit = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--canary-patients')
      args.canaryPatients = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--canary-limit') args.canaryLimit = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--max-failure-rate')
      args.maxFailureRate = Math.max(0, Number(argv[++i]) || 0.01);
    else if (flag === '--patient-ids')
      args.patientIds = new Set(String(argv[++i]).split(',').filter(Boolean));
    else if (flag === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--report-json') args.reportJson = path.resolve(argv[++i]);
  }
  if (!args.commit && !args.dryRun) args.dryRun = true;
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
  if (root === REPO_ROOT || root.startsWith(`${REPO_ROOT}${path.sep}`)) {
    const err = new Error(`Secure storage root ligger i repo: ${root}`);
    err.code = 'repo_storage_path';
    throw err;
  }
}

function assetHasDriveLinkLeak(asset) {
  return /drive\.google\.com|webViewLink/i.test(JSON.stringify(asset || {}));
}

async function auditAppend(auditLog, event) {
  try {
    auditLog?.append(event);
  } catch (err) {
    const e = new Error(`audit append failed: ${err.message}`);
    e.code = 'audit_failed';
    throw e;
  }
}

function emptyStats(runId, { dryRun, phase, scanned }) {
  return {
    runId,
    dryRun,
    phase,
    scanned: scanned || 0,
    attempted: 0,
    downloaded: 0,
    imported: 0,
    visible: 0,
    needsReview: 0,
    journals: 0,
    documents: 0,
    images: 0,
    needsClassification: 0,
    needsPhotoReview: 0,
    needsEncounterReview: 0,
    duplicate: 0,
    skipped: 0,
    failed: 0,
    fatalErrors: 0,
    checksumOk: 0,
    reviewQueued: 0,
    timelineEvents: 0,
    auditEvents: 0,
    customersTouched: [],
    errors: [],
    stoppedReason: null,
  };
}

function selectBatch(candidates, opts = {}) {
  let batch = candidates;
  if (opts.patientIds?.size) batch = sliceCandidatesByPatients(batch, opts.patientIds);
  else if (opts.canaryPatients > 0) {
    batch = sliceCandidatesByPatients(
      batch,
      new Set(uniquePatientIds(batch).slice(0, opts.canaryPatients))
    );
  }
  const cap = opts.canaryLimit > 0 ? opts.canaryLimit : opts.limit > 0 ? opts.limit : 0;
  if (cap > 0) batch = batch.slice(0, cap);
  return batch;
}

function buildImportMetadata({ row, phase }) {
  const { file, classification, documentDate } = row;
  let category = classification.category;
  if (phase === 'images' && !isPhotoCategory(category)) category = 'photo_during';

  const needsClassification =
    phase === 'documents' && (classification.confidence === 'low' || category === 'other');

  const needsPhotoReview = phase === 'images';
  const imageStage =
    needsPhotoReview && classification.confidence === 'low'
      ? 'unknown'
      : isPhotoCategory(category)
        ? category.replace('photo_', '')
        : 'unknown';

  const draft = buildAssetNamingMetadata(
    {
      category,
      originalFileName: file.fileName,
      originalDrivePath: file.relativePath,
      mimeType: file.mimeType,
      documentDate,
      imageStage,
      bodyArea: needsPhotoReview && classification.confidence === 'low' ? 'unknown' : null,
    },
    { siblingAssets: [] }
  );

  const section = resolvePatientCardSection(
    { category, status: needsPhotoReview ? 'NEEDS_REVIEW' : 'VERIFIED_IN_CCO', ...draft },
    { classification }
  );

  return {
    category,
    draft,
    section: section.section,
    needsClassification,
    needsPhotoReview,
    needsEncounterReview: true,
    imageStage,
    makeVisible: phase === 'documents' && !needsClassification && category === 'journal',
  };
}

async function importOneFile(params) {
  const {
    row,
    store,
    storage,
    auditLog,
    runId,
    actor,
    phase,
    driveClient,
    ctx,
    customerStoreAdapter,
    stats,
  } = params;
  const { file, patientId, documentDate } = row;

  if (!patientId) {
    const e = new Error('patientId saknas');
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

  const customerCountBefore = Object.keys(ctx.directory).length;
  if (ctx.ccoIndex.driveIds.has(file.driveFileId) || ctx.ccoIndex.sourceRecordIds.has(file.id)) {
    stats.duplicate += 1;
    return null;
  }

  const buf = await driveClient.downloadBuffer(file.driveFileId);
  stats.downloaded += 1;

  const putResult = await storage
    .putObject({
      body: buf,
      contentType: file.mimeType || 'application/octet-stream',
      metadata: { patientId, sourceSystem: 'drive_import', importRunId: runId },
    })
    .catch((err) => {
      const e = new Error(err.message);
      e.code = 'storage_put_failed';
      throw e;
    });

  if (putResult.deduped) {
    stats.duplicate += 1;
    ctx.ccoIndex.driveIds.add(file.driveFileId);
    ctx.ccoIndex.sourceRecordIds.add(file.id);
    recordDriveImportAlias({
      filePath: ctx.aliasPath,
      driveFileId: file.driveFileId,
      sourceRecordId: file.id,
    });
    return null;
  }

  const reread = await storage.getObject(putResult.storageKey);
  if (reread.checksum !== putResult.checksum) {
    const e = new Error('checksum mismatch');
    e.code = 'checksum_mismatch';
    throw e;
  }
  stats.checksumOk += 1;

  const meta = buildImportMetadata({ row, phase });
  if (meta.category === 'journal') stats.journals += 1;
  else if (phase === 'images') stats.images += 1;
  else stats.documents += 1;
  if (meta.needsClassification) stats.needsClassification += 1;
  if (meta.needsPhotoReview) stats.needsPhotoReview += 1;
  stats.needsEncounterReview += 1;

  const asset = await store.addAsset(
    {
      patientId,
      sourceSystem: 'drive_import',
      sourceRecordId: file.id,
      originalDriveFileId: file.driveFileId,
      originalDrivePath: file.relativePath || null,
      originalFileName: file.fileName || null,
      storageProvider: 'local',
      storageKey: putResult.storageKey,
      checksum: putResult.checksum,
      fileSize: putResult.size,
      mimeType: file.mimeType || 'application/octet-stream',
      category: meta.category,
      documentDate,
      importRunId: runId,
      confidence: 'high',
      status: 'DISCOVERED',
      isJournalRelevant: meta.category === 'journal',
      patientCardSection: meta.section,
      ...meta.draft,
      imageStage: meta.imageStage,
      bodyArea: meta.needsPhotoReview ? meta.draft.bodyArea || 'unknown' : meta.draft.bodyArea,
      uiStatus: meta.needsClassification
        ? 'needs_classification'
        : meta.needsPhotoReview
          ? 'needs_photo_review'
          : 'imported',
      technicalInfo: {
        timelineSource: 'drive_import',
        importBadge: 'drive_history',
        needsClassification: meta.needsClassification,
        needsPhotoReview: meta.needsPhotoReview,
        needsEncounterReview: true,
      },
    },
    { actor }
  );

  if (assetHasDriveLinkLeak(asset)) {
    const e = new Error('Drive-länk i payload');
    e.code = 'drive_link_blocker';
    throw e;
  }

  await store.transitionStatus(asset.id, 'IMPORTING', { actor, reason: 'drive_full' });
  await store.transitionStatus(asset.id, 'IMPORTED_TO_CCO', { actor, reason: 'drive_full' });
  await store.transitionStatus(asset.id, 'VERIFIED_IN_CCO', { actor, reason: 'drive_full' });

  if (meta.makeVisible) {
    await store.markAsVisibleOnPatientCard(asset.id, { actor });
    stats.visible += 1;
  } else {
    await store.transitionStatus(asset.id, 'NEEDS_REVIEW', {
      actor,
      reason: meta.needsPhotoReview ? 'needs_photo_review' : 'needs_classification',
    });
    stats.needsReview += 1;
  }

  if (phase === 'images') {
    const after = await store.getAsset(asset.id);
    if (after?.status === 'VISIBLE') {
      const e = new Error('Bild VISIBLE före photo review');
      e.code = 'visible_before_photo_review';
      throw e;
    }
  }

  if (Object.keys(ctx.directory).length > customerCountBefore) {
    const e = new Error('Ny kund skapades');
    e.code = 'new_customer_created';
    throw e;
  }

  ctx.ccoIndex.driveIds.add(file.driveFileId);
  ctx.ccoIndex.sourceRecordIds.add(file.id);
  stats.imported += 1;

  await auditAppend(auditLog, {
    ts: new Date().toISOString(),
    action: 'drive_history_imported',
    actor,
    target: { kind: 'patient', id: patientId },
    result: 'ok',
    detail: { assetId: asset.id, phase, importRunId: runId, category: meta.category },
  });
  stats.auditEvents += 1;
  stats.timelineEvents += 1;
  return asset;
}

async function runDriveFullImport(opts = {}) {
  let ctx = opts.ctx || loadDriveImportContext({ repoRoot: REPO, dataDir: DATA });
  ctx.assetsPath = path.join(DATA, 'cco-patient-assets.json');

  if (opts.phase === 'customer_review') {
    const pending = listCustomerReviewCandidates(ctx);
    const stats = emptyStats(opts.runId, {
      dryRun: !opts.commit,
      phase: 'customer_review',
      scanned: pending.length,
    });
    if (!opts.commit) return stats;
    for (const row of pending.slice(0, opts.limit || pending.length)) {
      await opts.reviewStore.enqueue(
        {
          kind: 'drive_file',
          sourceSystem: 'drive_import',
          sourceRecordId: row.file.id,
          reason:
            row.outcome.reason === 'medium_confidence_match'
              ? 'ambiguous_patient'
              : 'no_patient_match',
          suggestedPatientIds: row.link.patientId ? [row.link.patientId] : [],
          matchConfidence: row.link.confidence || 'low',
          documentName: row.file.fileName || null,
        },
        { actor: opts.actor }
      );
      stats.reviewQueued += 1;
    }
    return stats;
  }

  const candidates = listFullImportCandidates(ctx, { phase: opts.phase });
  const batch = selectBatch(candidates, opts);
  const stats = emptyStats(opts.runId, {
    dryRun: !opts.commit,
    phase: opts.phase,
    scanned: candidates.length,
  });
  stats.batchSize = batch.length;
  if (!opts.commit) {
    stats.wouldProcess = batch.length;
    return stats;
  }

  const storage = createSecureStorageProvider({ provider: 'local' });
  await assertStorageOutsideRepo(storage);
  const customerStoreAdapter = {
    ...ctx.customerStore,
    async peekTenantCustomerState() {
      return { directory: ctx.directory };
    },
  };
  const touched = new Set();

  for (let i = 0; i < batch.length; i += 1) {
    stats.attempted += 1;
    try {
      await importOneFile({
        row: batch[i],
        store: opts.assetStore,
        storage,
        auditLog: opts.auditLog,
        runId: opts.runId,
        actor: opts.actor,
        phase: opts.phase,
        driveClient: opts.driveClient,
        ctx,
        customerStoreAdapter,
        stats,
      });
      if (batch[i].patientId) touched.add(batch[i].patientId);
      if ((i + 1) % 50 === 0) ctx = refreshImportIndexes(ctx);
    } catch (err) {
      stats.failed += 1;
      stats.errors.push({ fileId: batch[i].file.id, code: err.code, message: err.message });
      if (FATAL_CODES.has(err.code)) {
        stats.fatalErrors += 1;
        stats.stoppedReason = err.code;
        break;
      }
      const maxRate = opts.maxFailureRate ?? 0.01;
      if (maxRate > 0 && stats.attempted >= 20) {
        const rate = stats.failed / stats.attempted;
        if (rate > maxRate) {
          stats.fatalErrors += 1;
          stats.stoppedReason = 'failure_rate_exceeded';
          break;
        }
      }
    }
    if (opts.delayMs) await sleep(opts.delayMs);
  }
  stats.customersTouched = [...touched];
  return stats;
}

module.exports = {
  runDriveFullImport,
  FATAL_CODES,
  createDriveDownloadClient,
  emptyStats,
  selectBatch,
};
