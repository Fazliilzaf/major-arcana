'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertCanaryAllowsCount } = require('./ccoOperatorCanary');
const { deriveMatchGround, isDriveNeedsReviewAsset } = require('./ccoDriveImportReviewReadService');
const {
  applyDriveImportReviewApprove,
  applyDriveImportReviewReject,
  CANARY_TRACK,
} = require('./ccoDriveImportReviewWriteService');
const {
  requireReason,
  requireReviewer,
  snapshotDriveImmutable,
  assertNoDriveLinkInAsset,
} = require('./ccoDriveImportReviewWriteValidation');

const BATCH_MAX_ASSETS = 25;
const PREVIEW_TTL_MS = 15 * 60 * 1000;
const VALID_BATCH_DECISIONS = new Set(['approve', 'mark_duplicate']);

function resolvePreviewStorePath(projectRoot) {
  const root = projectRoot || path.join(__dirname, '../..');
  const stateRoot = process.env.ARCANA_STATE_ROOT || path.join(root, 'data');
  return path.join(stateRoot, 'cco-drive-import-review-batch-previews.json');
}

function loadPreviewStore(projectRoot) {
  const filePath = resolvePreviewStorePath(projectRoot);
  if (!fs.existsSync(filePath)) {
    return { filePath, store: { schemaVersion: '1.0.0', previews: {} } };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      filePath,
      store: { schemaVersion: '1.0.0', previews: parsed.previews || {} },
    };
  } catch {
    return { filePath, store: { schemaVersion: '1.0.0', previews: {} } };
  }
}

function savePreviewStore(filePath, store) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ schemaVersion: store.schemaVersion || '1.0.0', previews: store.previews || {} }, null, 2)}\n`
  );
}

function purgeExpiredPreviews(store) {
  const now = Date.now();
  for (const [token, preview] of Object.entries(store.previews || {})) {
    if (!preview?.expiresAt || Date.parse(preview.expiresAt) <= now) {
      delete store.previews[token];
    }
  }
}

function assertWriteEnabled(config) {
  if (!config?.enableDriveImportReviewWrite) {
    const e = new Error('drive_import_review_write_disabled');
    e.statusCode = 403;
    throw e;
  }
}

function normalizeAssetIds(body) {
  const raw = Array.isArray(body?.assetIds) ? body.assetIds : [];
  const ids = [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) {
    const e = new Error('assetIds krävs (minst 1).');
    e.statusCode = 400;
    throw e;
  }
  if (ids.length > BATCH_MAX_ASSETS) {
    const e = new Error('batch_too_large');
    e.statusCode = 400;
    e.detail = { max: BATCH_MAX_ASSETS, requested: ids.length };
    throw e;
  }
  return ids;
}

function requireBatchDecision(body) {
  const decision = String(body?.decision || '').trim();
  if (!VALID_BATCH_DECISIONS.has(decision)) {
    const e = new Error('decision måste vara approve eller mark_duplicate.');
    e.statusCode = 400;
    throw e;
  }
  return decision;
}

function validateBatchPreviewBody(body, actor) {
  const assetIds = normalizeAssetIds(body);
  const decision = requireBatchDecision(body);
  const reason = requireReason(body);
  const reviewer = requireReviewer(body, actor);
  return { assetIds, decision, reason, reviewer };
}

function buildBatchRow(asset) {
  const suggestedPatientId = String(asset?.patientId || '').trim() || null;
  const confidence = asset?.confidence || 'unknown';
  const matchBasis = deriveMatchGround(asset);
  return {
    assetId: asset.id,
    suggestedPatientId,
    confidence,
    matchBasis,
    matchGround: matchBasis,
    status: asset.status,
    storageKey: asset.storageKey || null,
    checksum: asset.checksum || null,
    originalDriveFileId: asset.originalDriveFileId || null,
    originalDrivePath: asset.originalDrivePath || null,
    originalFileName: asset.originalFileName || null,
  };
}

function assertHomogeneous(rows) {
  if (!rows.length) {
    const e = new Error('batch_empty');
    e.statusCode = 400;
    throw e;
  }
  const first = rows[0];
  const divergent = rows.find(
    (row) =>
      row.suggestedPatientId !== first.suggestedPatientId ||
      row.confidence !== first.confidence ||
      row.matchBasis !== first.matchBasis
  );
  if (divergent) {
    const e = new Error('batch_not_homogeneous');
    e.statusCode = 409;
    e.detail = {
      expected: {
        suggestedPatientId: first.suggestedPatientId,
        confidence: first.confidence,
        matchBasis: first.matchBasis,
      },
      divergent: {
        assetId: divergent.assetId,
        suggestedPatientId: divergent.suggestedPatientId,
        confidence: divergent.confidence,
        matchBasis: divergent.matchBasis,
      },
    };
    throw e;
  }
  return {
    suggestedPatientId: first.suggestedPatientId,
    confidence: first.confidence,
    matchBasis: first.matchBasis,
  };
}

function collectAssetBlockers(asset, { decision, assetStore, ctx }) {
  const blockers = [];
  if (!asset) {
    blockers.push('asset_not_found');
    return blockers;
  }
  if (!isDriveNeedsReviewAsset(asset)) {
    blockers.push('not_drive_import_review_asset');
  }
  try {
    assertNoDriveLinkInAsset(asset);
  } catch {
    blockers.push('drive_link_blocked_in_asset');
  }
  if (decision === 'approve') {
    const patientId = String(asset.patientId || '').trim();
    if (!patientId || patientId === 'unknown') blockers.push('patientId');
    if (!asset.storageKey || asset.storageKey === 'pending-no-binary') blockers.push('storageKey');
    if (!asset.checksum) blockers.push('checksum');
  }
  return blockers;
}

async function previewDriveImportReviewBatch({ assetStore, projectRoot, config, body, actor }) {
  assertWriteEnabled(config);
  const validated = validateBatchPreviewBody(body, actor);
  const rows = [];
  const missing = [];

  for (const assetId of validated.assetIds) {
    const asset = assetStore.getAsset(assetId);
    if (!asset) {
      missing.push(assetId);
      continue;
    }
    rows.push(buildBatchRow(asset));
  }

  if (missing.length) {
    const e = new Error('batch_assets_not_found');
    e.statusCode = 404;
    e.detail = { missing };
    throw e;
  }

  const homogeneity = assertHomogeneous(rows);
  const evaluated = rows.map((row) => {
    const asset = assetStore.getAsset(row.assetId);
    const blockers = collectAssetBlockers(asset, {
      decision: validated.decision,
      assetStore,
    });
    return {
      ...row,
      ok: blockers.length === 0,
      blockers,
    };
  });

  const okCount = evaluated.filter((row) => row.ok).length;
  const blockerCount = evaluated.length - okCount;
  const canCommit = blockerCount === 0;

  const batchId = crypto.randomUUID();
  const previewToken = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();

  const previewRecord = {
    batchId,
    previewToken,
    createdAt,
    expiresAt,
    decision: validated.decision,
    reviewer: validated.reviewer,
    reason: validated.reason,
    assetIds: validated.assetIds,
    homogeneity,
    immutableSnapshots: Object.fromEntries(
      validated.assetIds.map((assetId) => {
        const asset = assetStore.getAsset(assetId);
        return [assetId, snapshotDriveImmutable(asset)];
      })
    ),
    actor: {
      role: actor?.role || 'operator',
      userId: validated.reviewer,
    },
  };

  const { filePath, store } = loadPreviewStore(projectRoot);
  purgeExpiredPreviews(store);
  store.previews[previewToken] = previewRecord;
  savePreviewStore(filePath, store);

  return {
    batchId,
    previewToken,
    expiresAt,
    decision: validated.decision,
    homogeneity,
    assetCount: evaluated.length,
    okCount,
    blockerCount,
    canCommit,
    rows: evaluated,
    readOnly: true,
  };
}

function loadPreviewRecord(projectRoot, previewToken) {
  const token = String(previewToken || '').trim();
  if (!token) {
    const e = new Error('previewToken krävs.');
    e.statusCode = 400;
    throw e;
  }
  const { filePath, store } = loadPreviewStore(projectRoot);
  purgeExpiredPreviews(store);
  savePreviewStore(filePath, store);
  const preview = store.previews[token];
  if (!preview) {
    const e = new Error('batch_preview_not_found');
    e.statusCode = 404;
    throw e;
  }
  if (Date.parse(preview.expiresAt) <= Date.now()) {
    delete store.previews[token];
    savePreviewStore(filePath, store);
    const e = new Error('batch_preview_expired');
    e.statusCode = 409;
    throw e;
  }
  return { filePath, store, preview, token };
}

function appendBatchCommittedAudit(auditLog, { actor, batchId, preview, results }) {
  if (!auditLog) return;
  auditLog.append({
    action: 'drive_import_review.batch_committed',
    actor,
    target: { kind: 'drive_import_review_batch', id: batchId },
    result: 'ok',
    detail: {
      batchId,
      decision: preview.decision,
      reviewer: preview.reviewer,
      reason: preview.reason,
      assetCount: preview.assetIds.length,
      assetIds: preview.assetIds,
      homogeneity: preview.homogeneity,
      committedAt: new Date().toISOString(),
      results: results.map((row) => ({
        assetId: row.assetId,
        decision: row.decision,
        status: row.asset?.status || null,
      })),
    },
  });
}

async function rollbackBatchCommits(assetStore, committed, ctx) {
  for (const entry of [...committed].reverse()) {
    const asset = assetStore.getAsset(entry.assetId);
    if (!asset) continue;
    if (entry.decision === 'approve') {
      if (asset.status === 'VISIBLE_ON_PATIENT_CARD') {
        await assetStore.transitionStatus(entry.assetId, 'NEEDS_REVIEW', {
          actor: ctx.actor,
          reason: `batch_rollback:${ctx.batchId}`,
        });
      }
      continue;
    }
    if (entry.decision === 'mark_duplicate' && asset.status === 'DUPLICATE') {
      await assetStore.transitionStatus(entry.assetId, 'NEEDS_REVIEW', {
        actor: ctx.actor,
        reason: `batch_rollback:${ctx.batchId}`,
      });
    }
  }
}

async function revalidatePreviewAssets(assetStore, preview) {
  const rows = [];
  for (const assetId of preview.assetIds) {
    const asset = assetStore.getAsset(assetId);
    const blockers = collectAssetBlockers(asset, { decision: preview.decision, assetStore });
    if (blockers.length) {
      rows.push({ assetId, blockers });
    }
  }
  if (rows.length) {
    const e = new Error('batch_confirm_blocked');
    e.statusCode = 409;
    e.detail = { blockers: rows };
    throw e;
  }
  const built = preview.assetIds.map((assetId) => buildBatchRow(assetStore.getAsset(assetId)));
  assertHomogeneous(built);
}

async function confirmDriveImportReviewBatch({
  assetStore,
  projectRoot,
  config,
  auditLog,
  body,
  actor,
  resolvePatientExists = null,
}) {
  assertWriteEnabled(config);
  const previewToken = String(body?.previewToken || '').trim();
  const { filePath, store, preview, token } = loadPreviewRecord(projectRoot, previewToken);

  await revalidatePreviewAssets(assetStore, preview);

  assertCanaryAllowsCount(CANARY_TRACK, preview.assetIds.length, {
    projectRoot,
    maxDecisions: config?.driveImportReviewCanaryMax,
    enabled: config.enableDriveImportReviewWrite,
  });

  const batchId = preview.batchId;
  const ctx = {
    projectRoot,
    config,
    auditLog,
    actor: preview.actor || actor,
    resolvePatientExists,
    batchId,
  };
  const decisionBody = {
    decision: preview.decision,
    reason: preview.reason,
    reviewer: preview.reviewer,
  };

  const committed = [];
  const results = [];

  try {
    for (const assetId of preview.assetIds) {
      const immutableBefore = preview.immutableSnapshots?.[assetId];
      let result;
      if (preview.decision === 'approve') {
        result = await applyDriveImportReviewApprove(assetStore, assetId, decisionBody, ctx);
      } else {
        result = await applyDriveImportReviewReject(assetStore, assetId, decisionBody, ctx, {
          duplicate: true,
        });
      }
      const asset = assetStore.getAsset(assetId);
      const immutableAfter = snapshotDriveImmutable(asset);
      for (const field of Object.keys(immutableBefore || {})) {
        if (immutableBefore[field] !== immutableAfter[field]) {
          const e = new Error(`immutable_field_changed: ${field}`);
          e.statusCode = 409;
          e.detail = {
            assetId,
            field,
            before: immutableBefore[field],
            after: immutableAfter[field],
          };
          throw e;
        }
      }
      committed.push({ assetId, decision: preview.decision });
      results.push(result);
    }
  } catch (err) {
    await rollbackBatchCommits(assetStore, committed, ctx);
    const e = new Error(err.message || 'batch_commit_failed');
    e.statusCode = err.statusCode || 409;
    e.detail = {
      ...(err.detail || {}),
      batchId,
      rolledBackCount: committed.length,
    };
    throw e;
  }

  delete store.previews[token];
  savePreviewStore(filePath, store);

  appendBatchCommittedAudit(auditLog, {
    actor: ctx.actor,
    batchId,
    preview,
    results,
  });

  return {
    batchId,
    previewToken: token,
    decision: preview.decision,
    assetCount: results.length,
    results,
    canary: results.at(-1)?.canary || null,
  };
}

module.exports = {
  BATCH_MAX_ASSETS,
  VALID_BATCH_DECISIONS,
  previewDriveImportReviewBatch,
  confirmDriveImportReviewBatch,
  loadPreviewRecord,
  resolvePreviewStorePath,
};
