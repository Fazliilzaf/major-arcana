'use strict';

/**
 * Photo Review Fas 2 — single-asset write handlers (canary-gated).
 */

const { classify, isPhotoCategory } = require('../ops/ccoAssetImportPipeline');
const { assertPilotWriteAllowed } = require('../ops/ccoPhotoReviewPilot');
const { recordCanaryDecision } = require('../ops/ccoOperatorCanary');
const {
  requireApprovedCategory,
  snapshotImmutable,
  assertImmutableUnchanged,
  assertNoDriveLinkInAsset,
  validateWriteBody,
  buildPhotoReviewNamingPatch,
  buildPhotoReviewRejectPatch,
  buildPhotoReviewReassignPatch,
} = require('../ops/ccoPhotoReviewWriteValidation');

const PHOTO_CATS = new Set(['photo_before', 'photo_during', 'photo_after']);
const VALID_DECISIONS = new Set(['approve', 'reject']);
const VALID_PHOTO_CATEGORIES = ['photo_before', 'photo_during', 'photo_after'];

function isPhotoReviewAsset(asset) {
  if (!asset || asset.status !== 'NEEDS_REVIEW') return false;
  if (PHOTO_CATS.has(asset.category)) return true;
  const classification = classify({
    mimeType: asset.mimeType,
    fileName: asset.originalFileName,
    sourceFolder: asset.originalDrivePath,
  });
  return (
    isPhotoCategory(classification.category) || String(asset.mimeType || '').startsWith('image/')
  );
}

function normalizeCategory(category) {
  const cat = String(category || '').trim();
  if (!cat) return null;
  if (!VALID_PHOTO_CATEGORIES.includes(cat)) {
    const e = new Error('category måste vara photo_before, photo_during eller photo_after.');
    e.statusCode = 400;
    throw e;
  }
  return cat;
}

function requireReason(body) {
  const reason = String(body?.reason || '').trim();
  if (!reason || reason.length < 3) {
    const e = new Error('reason krävs (minst 3 tecken).');
    e.statusCode = 400;
    throw e;
  }
  return reason.slice(0, 500);
}

function assertApproveReady(asset) {
  const missing = [];
  if (!asset.patientId || asset.patientId === 'unknown') missing.push('patientId');
  if (!asset.storageKey || asset.storageKey === 'pending-no-binary') missing.push('storageKey');
  if (!asset.checksum) missing.push('checksum');
  if (!(Number(asset.fileSize) > 0)) missing.push('fileSize');
  if (!asset.mimeType) missing.push('mimeType');
  const category = asset.category;
  if (!category || !isPhotoCategory(category)) missing.push('photo_category');
  if (missing.length) {
    const e = new Error(`approve_blocked_missing: ${missing.join(', ')}`);
    e.statusCode = 409;
    e.missing = missing;
    throw e;
  }
}

function snapshotAsset(asset) {
  return {
    assetId: asset.id,
    patientId: asset.patientId || null,
    status: asset.status,
    category: asset.category || null,
  };
}

function appendReviewAudit(
  auditLog,
  { action, actor, assetBefore, assetAfter, reason, decision, extra }
) {
  if (!auditLog) {
    const e = new Error('audit_unavailable');
    e.statusCode = 503;
    throw e;
  }
  auditLog.append({
    action: 'photo_review.decision',
    actor,
    target: { kind: 'patient_asset', id: assetBefore.assetId },
    result: 'ok',
    detail: {
      decision: decision || action,
      reviewer: actor?.userId || actor?.role || 'unknown',
      reason,
      oldStatus: assetBefore.status,
      newStatus: assetAfter.status,
      oldCategory: assetBefore.category,
      newCategory: assetAfter.category,
      patientId: assetAfter.patientId || assetBefore.patientId,
      timestamp: new Date().toISOString(),
      ...extra,
    },
  });
}

async function applyPhotoReviewApprove(assetStore, assetId, body, ctx) {
  const { actor, auditLog, pilotConfig } = ctx;
  const validated = validateWriteBody(body, actor);
  const category = requireApprovedCategory(body, assetStore.getAsset(assetId));
  const asset = assetStore.getAsset(assetId);
  if (!asset) {
    const e = new Error('asset_not_found');
    e.statusCode = 404;
    throw e;
  }
  if (!isPhotoReviewAsset(asset)) {
    const e = new Error('not_photo_review_asset');
    e.statusCode = 409;
    throw e;
  }
  assertNoDriveLinkInAsset(asset);
  assertPilotWriteAllowed({ asset, pilotConfig, auditLog });

  const immutableBefore = snapshotImmutable(asset);
  const before = snapshotAsset(asset);
  const namingPatch = buildPhotoReviewNamingPatch(
    asset,
    { ...body, category },
    { reviewer: validated.reviewer }
  );

  await assetStore.patchAssetNamingMetadata(assetId, namingPatch, {
    actor,
    reason: validated.reason,
  });
  await assetStore.patchAssetForReview(
    assetId,
    { category, confidence: 'high' },
    { actor, reason: validated.reason }
  );

  const patched = assetStore.getAsset(assetId);
  assertImmutableUnchanged(immutableBefore, snapshotImmutable(patched));
  assertApproveReady(patched);

  await assetStore.transitionStatus(assetId, 'VERIFIED_IN_CCO', {
    actor,
    reason: validated.reason,
  });
  const visible = await assetStore.markAsVisibleOnPatientCard(assetId, { actor });
  assertImmutableUnchanged(immutableBefore, snapshotImmutable(visible));
  const after = snapshotAsset(visible);

  appendReviewAudit(auditLog, {
    action: 'photo_review.approved',
    actor: { ...actor, userId: validated.reviewer },
    assetBefore: before,
    assetAfter: after,
    reason: validated.reason,
    decision: 'approve',
    extra: {
      imageStage: namingPatch.imageStage,
      bodyArea: namingPatch.bodyArea,
      approvedCategory: category,
      namingStatus: namingPatch.namingStatus,
      checksumOk: !!visible.checksum && visible.checksum === immutableBefore.checksum,
    },
  });

  if (pilotConfig?.canaryMode) {
    recordCanaryDecision(
      'photo',
      { approved: 1, manualResolved: 1 },
      { maxDecisions: pilotConfig.maxDecisions }
    );
  }

  return {
    decision: 'approve',
    asset: after,
    manualResolved: true,
    listAssetsForPatient: assetStore.listAssetsForPatient(visible.patientId, {}, { actor }),
  };
}

async function applyPhotoReviewReject(assetStore, assetId, body, ctx) {
  const { actor, auditLog, pilotConfig } = ctx;
  const validated = validateWriteBody(body, actor, { requireStageBody: false });
  const asset = assetStore.getAsset(assetId);
  if (!asset) {
    const e = new Error('asset_not_found');
    e.statusCode = 404;
    throw e;
  }
  if (!isPhotoReviewAsset(asset)) {
    const e = new Error('not_photo_review_asset');
    e.statusCode = 409;
    throw e;
  }
  assertNoDriveLinkInAsset(asset);
  assertPilotWriteAllowed({ asset, pilotConfig, auditLog });

  const immutableBefore = snapshotImmutable(asset);
  const before = snapshotAsset(asset);
  const rejectPatch = buildPhotoReviewRejectPatch(asset, body, { reviewer: validated.reviewer });
  await assetStore.patchAssetNamingMetadata(assetId, rejectPatch, {
    actor,
    reason: validated.reason,
  });
  const rejected = await assetStore.transitionStatus(assetId, 'REJECTED', {
    actor,
    reason: validated.reason,
  });
  assertImmutableUnchanged(immutableBefore, snapshotImmutable(rejected));
  const after = snapshotAsset(rejected);

  appendReviewAudit(auditLog, {
    action: 'photo_review.rejected',
    actor: { ...actor, userId: validated.reviewer },
    assetBefore: before,
    assetAfter: after,
    reason: validated.reason,
    decision: 'reject',
  });

  if (pilotConfig?.canaryMode) {
    recordCanaryDecision('photo', { rejected: 1 }, { maxDecisions: pilotConfig.maxDecisions });
  }

  return { decision: 'reject', asset: after };
}

async function applyPhotoReviewReassign(assetStore, assetId, body, ctx) {
  const { actor, auditLog, pilotConfig } = ctx;
  const validated = validateWriteBody(body, actor);
  const category = requireApprovedCategory(body, assetStore.getAsset(assetId));
  const alsoApprove = body?.alsoApprove === true;
  if (alsoApprove) {
    const e = new Error('mass_approval_blocked');
    e.statusCode = 409;
    throw e;
  }

  const asset = assetStore.getAsset(assetId);
  if (!asset) {
    const e = new Error('asset_not_found');
    e.statusCode = 404;
    throw e;
  }
  if (!isPhotoReviewAsset(asset)) {
    const e = new Error('not_photo_review_asset');
    e.statusCode = 409;
    throw e;
  }
  assertNoDriveLinkInAsset(asset);
  assertPilotWriteAllowed({ asset, pilotConfig, auditLog });

  const immutableBefore = snapshotImmutable(asset);
  const before = snapshotAsset(asset);
  const namingPatch = buildPhotoReviewReassignPatch(
    asset,
    { ...body, category },
    { reviewer: validated.reviewer }
  );
  await assetStore.patchAssetNamingMetadata(assetId, namingPatch, {
    actor,
    reason: validated.reason,
  });
  const updated = await assetStore.patchAssetForReview(
    assetId,
    { category },
    { actor, reason: validated.reason }
  );
  assertImmutableUnchanged(immutableBefore, snapshotImmutable(updated));
  const after = snapshotAsset(updated);

  appendReviewAudit(auditLog, {
    action: 'photo_review.reassigned',
    actor: { ...actor, userId: validated.reviewer },
    assetBefore: before,
    assetAfter: after,
    reason: validated.reason,
    decision: 'reassign',
    extra: { imageStage: namingPatch.imageStage, bodyArea: namingPatch.bodyArea },
  });

  if (pilotConfig?.canaryMode) {
    recordCanaryDecision('photo', { reassigned: 1 }, { maxDecisions: pilotConfig.maxDecisions });
  }

  return { decision: 'reassign', asset: after };
}

async function applyPhotoReviewDecision(assetStore, assetId, body, ctx) {
  const decision = String(body?.decision || '').trim();
  if (!VALID_DECISIONS.has(decision)) {
    const e = new Error('decision måste vara approve eller reject.');
    e.statusCode = 400;
    throw e;
  }
  if (decision === 'approve') return applyPhotoReviewApprove(assetStore, assetId, body, ctx);
  return applyPhotoReviewReject(assetStore, assetId, body, ctx);
}

module.exports = {
  applyPhotoReviewDecision,
  applyPhotoReviewApprove,
  applyPhotoReviewReject,
  applyPhotoReviewReassign,
  normalizeCategory,
  requireReason,
  isPhotoReviewAsset,
  assertApproveReady,
};
