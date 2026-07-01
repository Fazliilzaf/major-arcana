'use strict';

const path = require('node:path');
const { assertCanaryAllows, recordCanaryDecision } = require('./ccoOperatorCanary');
const {
  invalidateDriveImportReviewCache,
  isDriveNeedsReviewAsset,
  loadCustomerDirectory,
  loadPatientMasterBucket,
} = require('./ccoDriveImportReviewReadService');
const {
  validateWriteBody,
  requireTargetPatientId,
  snapshotDriveImmutable,
  assertDriveImmutableUnchanged,
  assertNoDriveLinkInAsset,
  assertPatientInRegistry,
  resolveApprovedCategory,
} = require('./ccoDriveImportReviewWriteValidation');

const CANARY_TRACK = 'drive_import';

function assertWriteEnabled(config) {
  if (!config?.enableDriveImportReviewWrite) {
    const e = new Error('drive_import_review_write_disabled');
    e.statusCode = 403;
    throw e;
  }
}

function snapshotAsset(asset) {
  return {
    assetId: asset.id,
    patientId: asset.patientId || null,
    status: asset.status,
    category: asset.category || null,
    sourceSystem: asset.sourceSystem || null,
  };
}

function assertDriveReviewAsset(asset) {
  if (!isDriveNeedsReviewAsset(asset)) {
    const e = new Error('not_drive_import_review_asset');
    e.statusCode = 409;
    throw e;
  }
}

function assertApproveReady(asset) {
  const missing = [];
  const patientId = String(asset.patientId || '').trim();
  if (!patientId || patientId === 'unknown') missing.push('patientId');
  if (!asset.storageKey || asset.storageKey === 'pending-no-binary') missing.push('storageKey');
  if (!asset.checksum) missing.push('checksum');
  if (missing.length) {
    const e = new Error(`approve_blocked_missing: ${missing.join(', ')}`);
    e.statusCode = 409;
    e.missing = missing;
    throw e;
  }
}

function appendDriveReviewAudit(
  auditLog,
  { actor, assetBefore, assetAfter, reason, decision, extra = {} }
) {
  if (!auditLog) {
    const e = new Error('audit_unavailable');
    e.statusCode = 503;
    throw e;
  }
  auditLog.append({
    action: 'drive_import_review.decision',
    actor,
    target: { kind: 'patient_asset', id: assetBefore.assetId },
    result: 'ok',
    detail: {
      decision,
      reviewer: actor?.userId || actor?.role || 'unknown',
      reason,
      oldStatus: assetBefore.status,
      newStatus: assetAfter.status,
      oldPatientId: assetBefore.patientId,
      newPatientId: assetAfter.patientId,
      oldCategory: assetBefore.category,
      newCategory: assetAfter.category,
      sourceSystem: assetBefore.sourceSystem,
      timestamp: new Date().toISOString(),
      ...extra,
    },
  });
}

function recordDriveCanary(patch, { projectRoot, maxDecisions, enabled }) {
  if (!enabled) return null;
  return recordCanaryDecision(CANARY_TRACK, patch, { projectRoot, maxDecisions });
}

function loadPatientRegistry(projectRoot) {
  const root = projectRoot || path.join(__dirname, '../..');
  const dataDir = process.env.ARCANA_STATE_ROOT || path.join(root, 'data');
  return {
    directory: loadCustomerDirectory(dataDir),
    masterBucket: loadPatientMasterBucket(dataDir),
  };
}

async function maybePatchCategory(assetStore, assetId, body, asset, ctx) {
  const category = resolveApprovedCategory(body, asset);
  if (!category || category === asset.category) return assetStore.getAsset(assetId);
  return assetStore.patchAssetForReview(
    assetId,
    { category, confidence: 'high' },
    { actor: ctx.actor, reason: ctx.reason }
  );
}

async function finalizeApprove(assetStore, assetId, immutableBefore, ctx) {
  const asset = assetStore.getAsset(assetId);
  assertApproveReady(asset);
  const patientId = String(asset.patientId || '').trim();
  const verified = await assetStore.reassignToPatient(assetId, {
    patientId,
    actor: ctx.actor,
    reason: ctx.reason,
  });
  assertDriveImmutableUnchanged(immutableBefore, snapshotDriveImmutable(verified));
  const visible = await assetStore.markAsVisibleOnPatientCard(assetId, { actor: ctx.actor });
  assertDriveImmutableUnchanged(immutableBefore, snapshotDriveImmutable(visible));
  return visible;
}

async function applyDriveImportReviewApprove(assetStore, assetId, body, ctx) {
  const validated = validateWriteBody(body, ctx.actor);
  const asset = assetStore.getAsset(assetId);
  if (!asset) {
    const e = new Error('asset_not_found');
    e.statusCode = 404;
    throw e;
  }
  assertDriveReviewAsset(asset);
  assertNoDriveLinkInAsset(asset);

  const requestedPatient = String(body?.patientId || body?.expectedPatientId || '').trim();
  if (requestedPatient && asset.patientId && requestedPatient !== asset.patientId) {
    const e = new Error('wrong_patient_asset_binding');
    e.statusCode = 409;
    e.detail = { assetPatientId: asset.patientId, requestedPatientId: requestedPatient };
    throw e;
  }

  const registry = loadPatientRegistry(ctx.projectRoot);
  assertPatientInRegistry(asset.patientId, registry);

  const immutableBefore = snapshotDriveImmutable(asset);
  const before = snapshotAsset(asset);

  await maybePatchCategory(assetStore, assetId, body, asset, {
    actor: { ...ctx.actor, userId: validated.reviewer },
    reason: validated.reason,
  });

  const visible = await finalizeApprove(assetStore, assetId, immutableBefore, {
    actor: { ...ctx.actor, userId: validated.reviewer },
    reason: validated.reason,
  });
  const after = snapshotAsset(visible);

  appendDriveReviewAudit(ctx.auditLog, {
    actor: { ...ctx.actor, userId: validated.reviewer },
    assetBefore: before,
    assetAfter: after,
    reason: validated.reason,
    decision: 'approve',
    extra: {
      checksumOk: visible.checksum === immutableBefore.checksum,
      storageKeyUnchanged: visible.storageKey === immutableBefore.storageKey,
      driveMetadataUnchanged:
        visible.originalDriveFileId === immutableBefore.originalDriveFileId &&
        visible.originalDrivePath === immutableBefore.originalDrivePath,
    },
  });

  const canary = recordDriveCanary(
    { approved: 1, manualResolved: 1 },
    {
      projectRoot: ctx.projectRoot,
      maxDecisions: ctx.config?.driveImportReviewCanaryMax,
      enabled: ctx.config?.enableDriveImportReviewWrite,
    }
  );

  invalidateDriveImportReviewCache();
  return { decision: 'approve', asset: after, canary };
}

async function applyDriveImportReviewReassign(assetStore, assetId, body, ctx) {
  const validated = validateWriteBody(body, ctx.actor);
  if (validated.decision !== 'reassign') {
    const e = new Error('decision måste vara reassign.');
    e.statusCode = 400;
    throw e;
  }

  const asset = assetStore.getAsset(assetId);
  if (!asset) {
    const e = new Error('asset_not_found');
    e.statusCode = 404;
    throw e;
  }
  assertDriveReviewAsset(asset);
  assertNoDriveLinkInAsset(asset);

  const targetPatientId = requireTargetPatientId(body);
  const registry = loadPatientRegistry(ctx.projectRoot);
  assertPatientInRegistry(targetPatientId, registry);

  const immutableBefore = snapshotDriveImmutable(asset);
  const before = snapshotAsset(asset);

  await maybePatchCategory(assetStore, assetId, body, asset, {
    actor: { ...ctx.actor, userId: validated.reviewer },
    reason: validated.reason,
  });

  const verified = await assetStore.reassignToPatient(assetId, {
    patientId: targetPatientId,
    actor: { ...ctx.actor, userId: validated.reviewer },
    reason: validated.reason,
  });
  assertDriveImmutableUnchanged(immutableBefore, snapshotDriveImmutable(verified));

  const visible = await assetStore.markAsVisibleOnPatientCard(assetId, {
    actor: { ...ctx.actor, userId: validated.reviewer },
  });
  assertDriveImmutableUnchanged(immutableBefore, snapshotDriveImmutable(visible));
  const after = snapshotAsset(visible);

  appendDriveReviewAudit(ctx.auditLog, {
    actor: { ...ctx.actor, userId: validated.reviewer },
    assetBefore: before,
    assetAfter: after,
    reason: validated.reason,
    decision: 'reassign',
    extra: {
      previousPatientId: before.patientId,
      newPatientId: after.patientId,
      storageKeyUnchanged: visible.storageKey === immutableBefore.storageKey,
    },
  });

  const canary = recordDriveCanary(
    { reassigned: 1, approved: 1, manualResolved: 1 },
    {
      projectRoot: ctx.projectRoot,
      maxDecisions: ctx.config?.driveImportReviewCanaryMax,
      enabled: ctx.config?.enableDriveImportReviewWrite,
    }
  );

  invalidateDriveImportReviewCache();
  return { decision: 'reassign', asset: after, canary };
}

async function applyDriveImportReviewReject(
  assetStore,
  assetId,
  body,
  ctx,
  { duplicate = false } = {}
) {
  const validated = validateWriteBody(body, ctx.actor);
  const expectedDecision = duplicate ? 'mark_duplicate' : 'reject';
  if (validated.decision !== expectedDecision) {
    const e = new Error(`decision måste vara ${expectedDecision}.`);
    e.statusCode = 400;
    throw e;
  }

  const asset = assetStore.getAsset(assetId);
  if (!asset) {
    const e = new Error('asset_not_found');
    e.statusCode = 404;
    throw e;
  }
  assertDriveReviewAsset(asset);
  assertNoDriveLinkInAsset(asset);

  const immutableBefore = snapshotDriveImmutable(asset);
  const before = snapshotAsset(asset);

  if (duplicate) {
    await assetStore.patchAssetNamingMetadata(
      assetId,
      {
        reviewReason: 'marked_duplicate',
        technicalInfo: {
          ...(asset.technicalInfo || {}),
          markedDuplicate: true,
          reviewDecision: 'duplicate',
        },
      },
      { actor: { ...ctx.actor, userId: validated.reviewer }, reason: validated.reason }
    );
  }

  const rejected = await assetStore.transitionStatus(assetId, 'REJECTED', {
    actor: { ...ctx.actor, userId: validated.reviewer },
    reason: validated.reason,
  });
  assertDriveImmutableUnchanged(immutableBefore, snapshotDriveImmutable(rejected));
  const after = snapshotAsset(rejected);

  appendDriveReviewAudit(ctx.auditLog, {
    actor: { ...ctx.actor, userId: validated.reviewer },
    assetBefore: before,
    assetAfter: after,
    reason: validated.reason,
    decision: expectedDecision,
    extra: {
      markedDuplicate: duplicate,
      storageKeyUnchanged: rejected.storageKey === immutableBefore.storageKey,
    },
  });

  const canary = recordDriveCanary(
    { rejected: 1, excluded: duplicate ? 1 : 0 },
    {
      projectRoot: ctx.projectRoot,
      maxDecisions: ctx.config?.driveImportReviewCanaryMax,
      enabled: ctx.config?.enableDriveImportReviewWrite,
    }
  );

  invalidateDriveImportReviewCache();
  return { decision: expectedDecision, asset: after, canary };
}

async function applyDriveImportReviewDecision({
  assetStore,
  projectRoot,
  config,
  auditLog,
  assetId,
  body,
  actor,
}) {
  assertWriteEnabled(config);
  assertCanaryAllows(CANARY_TRACK, {
    projectRoot,
    maxDecisions: config?.driveImportReviewCanaryMax,
    enabled: config.enableDriveImportReviewWrite,
  });

  const validated = validateWriteBody(body, actor);
  const ctx = { projectRoot, config, auditLog, actor };

  if (validated.decision === 'approve') {
    return applyDriveImportReviewApprove(assetStore, assetId, body, ctx);
  }
  if (validated.decision === 'reassign') {
    return applyDriveImportReviewReassign(assetStore, assetId, body, ctx);
  }
  if (validated.decision === 'mark_duplicate') {
    return applyDriveImportReviewReject(assetStore, assetId, body, ctx, { duplicate: true });
  }
  return applyDriveImportReviewReject(assetStore, assetId, body, ctx, { duplicate: false });
}

module.exports = {
  applyDriveImportReviewDecision,
  applyDriveImportReviewApprove,
  applyDriveImportReviewReassign,
  applyDriveImportReviewReject,
  CANARY_TRACK,
};
