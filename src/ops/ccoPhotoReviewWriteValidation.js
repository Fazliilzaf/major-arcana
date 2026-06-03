'use strict';

const {
  buildPhotoReviewNamingPatch,
  buildPhotoReviewRejectPatch,
  buildPhotoReviewReassignPatch,
} = require('./ccoAssetNaming/photoReviewNaming');

function requireReviewer(body, actor) {
  const reviewer = String(body?.reviewer || actor?.userId || '').trim();
  if (reviewer.length < 2) {
    const e = new Error('reviewer krävs (minst 2 tecken) för audit.');
    e.statusCode = 400;
    throw e;
  }
  return reviewer;
}

function requireApprovedCategory(body, asset) {
  const cat = String(body?.approvedCategory || body?.category || asset?.category || '').trim();
  if (!['photo_before', 'photo_during', 'photo_after'].includes(cat)) {
    const e = new Error('approvedCategory krävs (photo_before, photo_during, photo_after).');
    e.statusCode = 400;
    throw e;
  }
  return cat;
}

function snapshotImmutable(asset) {
  return {
    storageKey: asset.storageKey || null,
    checksum: asset.checksum || null,
    originalFileName: asset.originalFileName || null,
    patientId: asset.patientId || null,
  };
}

function assertImmutableUnchanged(before, after) {
  const fields = ['storageKey', 'checksum', 'originalFileName', 'patientId'];
  for (const f of fields) {
    if (before[f] !== after[f]) {
      const e = new Error(`immutable_field_changed: ${f}`);
      e.statusCode = 409;
      e.detail = { field: f, before: before[f], after: after[f] };
      throw e;
    }
  }
}

function assertNoDriveLinkInAsset(asset) {
  const hay = `${asset.originalDrivePath || ''} ${asset.storageKey || ''}`.toLowerCase();
  if (hay.includes('drive.google.com') || hay.includes('docs.google.com')) {
    const e = new Error('drive_link_blocked_in_asset');
    e.statusCode = 409;
    throw e;
  }
}

function validateWriteBody(body, actor, { requireStageBody = true } = {}) {
  const reason = String(body?.reason || '').trim();
  if (reason.length < 3) {
    const e = new Error('reason krävs (minst 3 tecken).');
    e.statusCode = 400;
    throw e;
  }
  const reviewer = requireReviewer(body, actor);
  let namingPatch = null;
  if (requireStageBody) {
    namingPatch = buildPhotoReviewNamingPatch({}, body, { reviewer });
  }
  return { reason: reason.slice(0, 500), reviewer, namingPatch };
}

module.exports = {
  requireReviewer,
  requireApprovedCategory,
  snapshotImmutable,
  assertImmutableUnchanged,
  assertNoDriveLinkInAsset,
  validateWriteBody,
  buildPhotoReviewNamingPatch,
  buildPhotoReviewRejectPatch,
  buildPhotoReviewReassignPatch,
};
