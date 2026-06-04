'use strict';

const { classifyDocument } = require('./documentClassifier');
const { resolveEncounterNaming, parseIsoDate } = require('./encounterNameResolver');
const { buildAssetDisplayName } = require('./assetDisplayNameBuilder');
const { buildImageDisplayName, classifyImage } = require('./imageDisplayNameBuilder');

function isPhotoCategory(category) {
  return ['photo_before', 'photo_during', 'photo_after'].includes(category);
}

function mapUiStatus(status, namingStatus) {
  if (namingStatus === 'needs_review_for_naming') return 'needs_review_for_naming';
  const st = String(status || '').toUpperCase();
  if (st === 'VISIBLE_ON_PATIENT_CARD') return 'visible';
  if (st === 'NEEDS_REVIEW') return 'needs_review';
  if (st === 'REJECTED') return 'rejected';
  if (st === 'DUPLICATE') return 'duplicate';
  return 'other';
}

/**
 * Bygg komplett naming/metadata-patch för ett asset.
 * Ändrar inte storageKey, checksum eller binär.
 *
 * @param {object} asset
 * @param {{ siblingAssets?: object[] }} ctx
 */
function buildAssetNamingMetadata(asset = {}, ctx = {}) {
  const classification = classifyDocument(asset);
  const encounter = resolveEncounterNaming(
    { ...asset, treatmentType: classification.treatmentType || asset.treatmentType },
    ctx
  );

  const merged = {
    ...asset,
    category: asset.category || classification.category,
    subCategory: classification.subCategory || asset.subCategory || null,
    documentTitle: classification.documentTitle || asset.documentTitle || null,
    treatmentType: encounter.treatmentType || classification.treatmentType || null,
    encounterType: encounter.encounterType,
    visitLabel: encounter.visitLabel,
    documentDate: parseIsoDate(asset.documentDate) || parseIsoDate(asset.importedAt),
    version: asset.version || null,
  };

  let namingResult;
  if (
    isPhotoCategory(merged.category) ||
    String(classification.category || '').startsWith('photo_')
  ) {
    namingResult = buildImageDisplayName(merged, encounter);
    merged.imageType = namingResult.imageType;
    merged.imageStage = namingResult.imageStage;
    merged.bodyArea = namingResult.bodyArea;
    merged.angle = namingResult.angle;
    merged.suggestedCategory = namingResult.suggestedCategory;
    merged.approvedCategory = asset.approvedCategory || merged.category;
    merged.captureDate = namingResult.captureDate;
  } else {
    namingResult = buildAssetDisplayName(merged, {
      ...encounter,
      namingConfidence: classification.confidence,
    });
  }

  const namingConfidence = namingResult.namingConfidence || classification.confidence || 'low';
  const namingStatus =
    namingConfidence === 'low'
      ? 'needs_review_for_naming'
      : asset.namingStatus === 'manual'
        ? 'manual'
        : 'resolved';

  return {
    displayName: namingResult.displayName,
    documentTitle: merged.documentTitle || namingResult.documentTitle || null,
    documentDate: merged.documentDate,
    treatmentType: merged.treatmentType,
    encounterType: merged.encounterType,
    visitLabel: merged.visitLabel,
    subCategory: merged.subCategory,
    imageStage: merged.imageStage || null,
    imageType: merged.imageType || null,
    bodyArea: merged.bodyArea || null,
    angle: merged.angle || null,
    sessionNumber: encounter.sessionNumber || null,
    suggestedCategory: merged.suggestedCategory || null,
    approvedCategory: merged.approvedCategory || null,
    captureDate: merged.captureDate || null,
    version: merged.version,
    namingConfidence,
    namingStatus,
    uiStatus: mapUiStatus(asset.status, namingStatus),
    namingSignals: classification.signals || [],
    namingBuiltAt: new Date().toISOString(),
  };
}

const photoReviewNaming = require('./photoReviewNaming');
const patientCardSections = require('./patientCardSections');
const encounterMapper = require('./encounterMapper');

module.exports = {
  buildAssetNamingMetadata,
  classifyDocument,
  resolveEncounterNaming,
  buildAssetDisplayName,
  buildImageDisplayName,
  classifyImage,
  mapUiStatus,
  photoReviewNaming,
  ...photoReviewNaming,
  ...patientCardSections,
  ...encounterMapper,
  ...require('./assetDisplayLabel'),
};
