'use strict';

/**
 * Photo Review → asset naming integration.
 * Bygger displayName/metadata vid manuellt godkännande utan att röra storageKey/checksum/binär.
 */

const { resolveEncounterNaming, parseIsoDate } = require('./encounterNameResolver');
const { STAGE_LABEL } = require('./imageDisplayNameBuilder');

const REVIEW_STAGES = Object.freeze([
  { id: 'before', category: 'photo_before', label: 'Före' },
  { id: 'during', category: 'photo_during', label: 'Under' },
  { id: 'after', category: 'photo_after', label: 'Efter' },
  { id: 'follow_up', category: 'photo_after', label: 'Uppföljning' },
]);

const BODY_AREAS = Object.freeze({
  skalp: 'skalp',
  donor: 'donorområde',
  recipient: 'recipient',
  hairline: 'hairline',
  crown: 'crown',
  front: 'front',
  sidor: 'sidor',
  bak: 'bak',
  annat: 'annat',
});

const STAGE_DISPLAY = Object.freeze({
  before: 'Före',
  during: 'Under behandling',
  after: 'Efter',
  follow_up: 'Uppföljning',
});

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function resolveReviewStage(body = {}) {
  const imageStage = normalizeText(body.imageStage);
  const category = normalizeText(body.category);
  const match =
    REVIEW_STAGES.find((s) => s.id === imageStage) ||
    REVIEW_STAGES.find((s) => s.category === category);
  if (!match) return null;
  return { imageStage: match.id, category: match.category, label: match.label };
}

function normalizeBodyArea(value) {
  const key = normalizeText(value).toLowerCase();
  if (!key) return null;
  if (!BODY_AREAS[key]) return null;
  return BODY_AREAS[key];
}

function buildTechnicalInfo(asset = {}) {
  return {
    storageKey: asset.storageKey || null,
    checksum: asset.checksum || null,
    fileSize: Number(asset.fileSize) > 0 ? Number(asset.fileSize) : null,
    mimeType: asset.mimeType || null,
    storageProvider: asset.storageProvider || null,
  };
}

/**
 * Manuell displayName efter photo review — utan status-suffix (synlighet = status-fält).
 */
function buildPhotoReviewDisplayName(asset = {}, ctx = {}) {
  const date =
    parseIsoDate(asset.captureDateTime) ||
    parseIsoDate(asset.captureDate) ||
    parseIsoDate(asset.documentDate) ||
    parseIsoDate(asset.importedAt) ||
    'okänt datum';
  const visit =
    normalizeText(ctx.visitLabel) ||
    normalizeText(asset.visitLabel) ||
    normalizeText(asset.treatmentType) ||
    'Besök';
  const imageStage = normalizeText(ctx.imageStage) || normalizeText(asset.imageStage) || 'unknown';
  const stage = STAGE_DISPLAY[imageStage] || STAGE_LABEL[imageStage] || 'Okänd fas';
  const zone =
    normalizeText(ctx.bodyArea) ||
    normalizeText(asset.bodyArea) ||
    normalizeText(asset.zone) ||
    null;

  const parts = [date, visit, stage];
  if (zone) parts.push(zone);
  return parts.join(' · ');
}

function buildPhotoReviewNamingPatch(asset, body, ctx = {}) {
  const stage = resolveReviewStage(body);
  if (!stage) {
    const e = new Error('imageStage/category ogiltig — kräver Före/Under/Efter/Uppföljning.');
    e.statusCode = 400;
    throw e;
  }

  const bodyArea = normalizeBodyArea(body.bodyArea);
  if (!bodyArea) {
    const e = new Error(
      'bodyArea krävs (skalp, donor, recipient, hairline, crown, front, sidor, bak, annat).'
    );
    e.statusCode = 400;
    throw e;
  }

  const encounter = resolveEncounterNaming(asset, ctx);
  const merged = {
    ...asset,
    category: stage.category,
    approvedCategory: stage.category,
    imageStage: stage.imageStage,
    imageType: stage.imageStage === 'follow_up' ? 'followup' : stage.imageStage,
    bodyArea,
    visitLabel: encounter.visitLabel,
    treatmentType: encounter.treatmentType,
    sessionNumber: encounter.sessionNumber,
  };

  const displayName = buildPhotoReviewDisplayName(merged, {
    visitLabel: encounter.visitLabel,
    imageStage: stage.imageStage,
    bodyArea,
  });

  return {
    displayName,
    documentTitle: `${STAGE_DISPLAY[stage.imageStage] || stage.label} · ${bodyArea}`,
    approvedCategory: stage.category,
    category: stage.category,
    imageStage: stage.imageStage,
    imageType: merged.imageType,
    bodyArea,
    visitLabel: encounter.visitLabel,
    treatmentType: encounter.treatmentType,
    sessionNumber: encounter.sessionNumber,
    encounterType: encounter.encounterType,
    captureDate:
      parseIsoDate(asset.captureDateTime) ||
      parseIsoDate(asset.captureDate) ||
      parseIsoDate(asset.documentDate) ||
      parseIsoDate(asset.importedAt),
    namingConfidence: 'high',
    namingStatus: 'manual_resolved',
    uiStatus: 'visible',
    technicalInfo: buildTechnicalInfo(asset),
    reviewedBy: normalizeText(body.reviewer) || normalizeText(ctx.reviewer) || null,
    reviewedAt: new Date().toISOString(),
    reviewReason: normalizeText(body.reason).slice(0, 500) || null,
  };
}

function buildPhotoReviewRejectPatch(asset, body, ctx = {}) {
  return {
    namingStatus: 'rejected',
    uiStatus: 'rejected',
    reviewReason: normalizeText(body.reason).slice(0, 500) || null,
    reviewedBy: normalizeText(body.reviewer) || normalizeText(ctx.reviewer) || null,
    reviewedAt: new Date().toISOString(),
    technicalInfo: buildTechnicalInfo(asset),
  };
}

function buildPhotoReviewReassignPatch(asset, body, ctx = {}) {
  const stage = resolveReviewStage(body);
  if (!stage) {
    const e = new Error('imageStage/category ogiltig vid omkategorisering.');
    e.statusCode = 400;
    throw e;
  }
  const bodyArea = normalizeBodyArea(body.bodyArea);
  if (!bodyArea) {
    const e = new Error('bodyArea krävs vid omkategorisering.');
    e.statusCode = 400;
    throw e;
  }

  const oldCategory = asset.category || null;
  const encounter = resolveEncounterNaming({ ...asset, category: stage.category }, ctx);
  const merged = {
    ...asset,
    category: stage.category,
    imageStage: stage.imageStage,
    bodyArea,
    visitLabel: encounter.visitLabel,
    treatmentType: encounter.treatmentType,
  };

  return {
    oldCategory,
    category: stage.category,
    suggestedCategory: stage.category,
    imageStage: stage.imageStage,
    imageType: stage.imageStage === 'follow_up' ? 'followup' : stage.imageStage,
    bodyArea,
    visitLabel: encounter.visitLabel,
    treatmentType: encounter.treatmentType,
    displayName: buildPhotoReviewDisplayName(merged, {
      visitLabel: encounter.visitLabel,
      imageStage: stage.imageStage,
      bodyArea,
    }),
    namingStatus: 'needs_review_for_naming',
    uiStatus: 'needs_review',
    reviewReason: normalizeText(body.reason).slice(0, 500) || null,
    reviewedBy: normalizeText(body.reviewer) || normalizeText(ctx.reviewer) || null,
    reviewedAt: new Date().toISOString(),
    technicalInfo: buildTechnicalInfo(asset),
  };
}

module.exports = {
  REVIEW_STAGES,
  BODY_AREAS,
  STAGE_DISPLAY,
  resolveReviewStage,
  normalizeBodyArea,
  buildTechnicalInfo,
  buildPhotoReviewDisplayName,
  buildPhotoReviewNamingPatch,
  buildPhotoReviewRejectPatch,
  buildPhotoReviewReassignPatch,
};
