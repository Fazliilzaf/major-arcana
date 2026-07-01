'use strict';

const VALID_DECISIONS = new Set(['approve', 'reassign', 'reject', 'mark_duplicate']);
const VALID_DOCUMENT_CATEGORIES = new Set([
  'journal',
  'consent',
  'agreement',
  'form',
  'aisia_report',
  'other',
]);
const VALID_PHOTO_CATEGORIES = new Set(['photo_before', 'photo_during', 'photo_after']);

function requireReviewer(body, actor) {
  const reviewer = String(body?.reviewer || actor?.userId || '').trim();
  if (reviewer.length < 2) {
    const e = new Error('reviewer krävs (minst 2 tecken) för audit.');
    e.statusCode = 400;
    throw e;
  }
  return reviewer;
}

function requireReason(body) {
  const reason = String(body?.reason || '').trim();
  if (reason.length < 3) {
    const e = new Error('reason krävs (minst 3 tecken).');
    e.statusCode = 400;
    throw e;
  }
  return reason.slice(0, 500);
}

function snapshotDriveImmutable(asset) {
  return {
    storageKey: asset.storageKey || null,
    checksum: asset.checksum || null,
    originalFileName: asset.originalFileName || null,
    originalDriveFileId: asset.originalDriveFileId || null,
    originalDrivePath: asset.originalDrivePath || null,
  };
}

function assertDriveImmutableUnchanged(before, after) {
  for (const field of Object.keys(before)) {
    if (before[field] !== after[field]) {
      const e = new Error(`immutable_field_changed: ${field}`);
      e.statusCode = 409;
      e.detail = { field, before: before[field], after: after[field] };
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

function assertSingleAssetDecision(body) {
  if (Array.isArray(body?.assetIds) && body.assetIds.length > 1) {
    const e = new Error('mass_decision_blocked');
    e.statusCode = 409;
    throw e;
  }
}

function requireDecision(body) {
  const decision = String(body?.decision || '').trim();
  if (!VALID_DECISIONS.has(decision)) {
    const e = new Error('decision måste vara approve, reassign, reject eller mark_duplicate.');
    e.statusCode = 400;
    throw e;
  }
  return decision;
}

function requireTargetPatientId(body) {
  const patientId = String(body?.patientId || body?.targetPatientId || '').trim();
  if (!patientId || patientId === 'unknown') {
    const e = new Error('patientId krävs för reassign.');
    e.statusCode = 400;
    throw e;
  }
  return patientId;
}

function assertPatientInDirectory(patientId, directory) {
  if (!directory?.[patientId]) {
    const e = new Error('patient_not_in_directory');
    e.statusCode = 409;
    e.detail = { patientId };
    throw e;
  }
}

function resolveApprovedCategory(body, asset) {
  const requested = String(body?.approvedCategory || body?.category || '').trim();
  if (requested) {
    if (!VALID_PHOTO_CATEGORIES.has(requested) && !VALID_DOCUMENT_CATEGORIES.has(requested)) {
      const e = new Error('approvedCategory ogiltig.');
      e.statusCode = 400;
      throw e;
    }
    return requested;
  }
  const existing = String(asset?.category || '').trim();
  if (existing) return existing;
  return null;
}

function validateWriteBody(body, actor) {
  assertSingleAssetDecision(body);
  const decision = requireDecision(body);
  const reason = requireReason(body);
  const reviewer = requireReviewer(body, actor);
  return { decision, reason, reviewer };
}

module.exports = {
  VALID_DECISIONS,
  VALID_DOCUMENT_CATEGORIES,
  VALID_PHOTO_CATEGORIES,
  requireReviewer,
  requireReason,
  requireDecision,
  requireTargetPatientId,
  snapshotDriveImmutable,
  assertDriveImmutableUnchanged,
  assertNoDriveLinkInAsset,
  assertSingleAssetDecision,
  assertPatientInDirectory,
  resolveApprovedCategory,
  validateWriteBody,
};
