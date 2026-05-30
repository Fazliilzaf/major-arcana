'use strict';

/**
 * Photo Review Fas 2 — single-asset write handlers.
 * Gated by ENABLE_PHOTO_REVIEW_WRITE (never on primary prod hosts).
 */

const { classify, isPhotoCategory } = require('../ops/ccoAssetImportPipeline');
const { assertPilotWriteAllowed } = require('../ops/ccoPhotoReviewPilot');

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

function snapshotAsset(asset) {
  return {
    assetId: asset.id,
    patientId: asset.patientId || null,
    status: asset.status,
    category: asset.category || null,
  };
}

function appendReviewAudit(auditLog, { action, actor, assetBefore, assetAfter, reason, decision }) {
  if (!auditLog) return;
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
    },
  });
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

async function applyPhotoReviewApprove(assetStore, assetId, body, ctx) {
  const { actor, auditLog, pilotConfig } = ctx;
  const reason = requireReason(body);
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
  assertPilotWriteAllowed({ asset, pilotConfig, auditLog });

  const category = normalizeCategory(body?.category || asset.category);
  const before = snapshotAsset(asset);

  await assetStore.patchAssetForReview(
    assetId,
    { category, confidence: 'high' },
    { actor, reason }
  );
  const patched = assetStore.getAsset(assetId);
  assertApproveReady(patched);

  await assetStore.transitionStatus(assetId, 'VERIFIED_IN_CCO', { actor, reason });
  const visible = await assetStore.markAsVisibleOnPatientCard(assetId, { actor });
  const after = snapshotAsset(visible);

  appendReviewAudit(auditLog, {
    action: 'photo_review.approved',
    actor,
    assetBefore: before,
    assetAfter: after,
    reason,
    decision: 'approve',
  });

  return {
    decision: 'approve',
    asset: after,
    listAssetsForPatient: assetStore.listAssetsForPatient(visible.patientId, {}, { actor }),
  };
}

async function applyPhotoReviewReject(assetStore, assetId, body, ctx) {
  const { actor, auditLog, pilotConfig } = ctx;
  const reason = requireReason(body);
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
  assertPilotWriteAllowed({ asset, pilotConfig, auditLog });

  const before = snapshotAsset(asset);
  const rejected = await assetStore.transitionStatus(assetId, 'REJECTED', { actor, reason });
  const after = snapshotAsset(rejected);

  appendReviewAudit(auditLog, {
    action: 'photo_review.rejected',
    actor,
    assetBefore: before,
    assetAfter: after,
    reason,
    decision: 'reject',
  });

  return { decision: 'reject', asset: after };
}

async function applyPhotoReviewReassign(assetStore, assetId, body, ctx) {
  const { actor, auditLog, pilotConfig } = ctx;
  const reason = requireReason(body);
  const category = normalizeCategory(body?.category);
  const alsoApprove = body?.alsoApprove === true;

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
  assertPilotWriteAllowed({ asset, pilotConfig, auditLog });

  const before = snapshotAsset(asset);
  const updated = await assetStore.patchAssetForReview(assetId, { category }, { actor, reason });

  if (alsoApprove) {
    return applyPhotoReviewApprove(
      assetStore,
      assetId,
      { category, reason: `${reason} (reassign+approve)` },
      ctx
    );
  }

  const after = snapshotAsset(updated);
  appendReviewAudit(auditLog, {
    action: 'photo_review.reassigned',
    actor,
    assetBefore: before,
    assetAfter: after,
    reason,
    decision: 'reassign',
  });

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
