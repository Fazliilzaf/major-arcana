'use strict';

const BEFORE_AFTER_PHASES = Object.freeze(['before', 'after']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizePhotoPhase(value) {
  const key = normalizeKey(value);
  return BEFORE_AFTER_PHASES.includes(key) ? key : '';
}

function isClinicalPhotoAttachment(attachment = {}) {
  const type = normalizeKey(attachment.type);
  return type === 'consultation_photo' || type === 'historical_image';
}

function buildPhotoItem(entry = {}, attachment = {}) {
  const safeEntry = asObject(entry);
  const safeAttachment = asObject(attachment);
  return {
    photoId: normalizeText(safeAttachment.photoId),
    attachmentId: normalizeText(safeAttachment.attachmentId),
    entryId: normalizeText(safeEntry.entryId),
    journalType: normalizeText(safeEntry.journalType),
    treatmentEncounterId:
      normalizeText(safeAttachment.treatmentEncounterId) ||
      normalizeText(safeEntry.treatmentEncounterId),
    label: normalizeText(safeAttachment.label),
    fileName: normalizeText(safeAttachment.fileName),
    mimeType: normalizeText(safeAttachment.mimeType) || 'image/jpeg',
    capturedAt: normalizeText(safeAttachment.capturedAt),
    photoPhase: normalizePhotoPhase(safeAttachment.photoPhase),
    hasAnnotation: Boolean(safeAttachment.hasAnnotation),
    annotatedPreviewAvailable: Boolean(safeAttachment.annotatedPreviewAvailable),
  };
}

function listBeforeAfterPhotosFromEntries(entries = []) {
  const before = [];
  const after = [];
  const unclassified = [];

  for (const entry of asArray(entries)) {
    for (const attachment of asArray(entry.attachments)) {
      if (!isClinicalPhotoAttachment(attachment)) continue;
      const item = buildPhotoItem(entry, attachment);
      if (!item.photoId) continue;
      if (item.photoPhase === 'before') {
        before.push(item);
        continue;
      }
      if (item.photoPhase === 'after') {
        after.push(item);
        continue;
      }
      unclassified.push(item);
    }
  }

  const sortByCaptured = (a, b) =>
    Date.parse(b.capturedAt || 0) - Date.parse(a.capturedAt || 0);
  before.sort(sortByCaptured);
  after.sort(sortByCaptured);
  unclassified.sort(sortByCaptured);

  return {
    before,
    after,
    unclassified,
    total: before.length + after.length + unclassified.length,
  };
}

async function listBeforeAfterPhotos({ journalStore, tenantId, patientId } = {}) {
  if (!journalStore?.listEntries) {
    return { before: [], after: [], unclassified: [], total: 0 };
  }
  const result = await journalStore.listEntries({ tenantId, patientId });
  const entries = asArray(result?.entries);
  return listBeforeAfterPhotosFromEntries(entries);
}

module.exports = {
  BEFORE_AFTER_PHASES,
  listBeforeAfterPhotos,
  listBeforeAfterPhotosFromEntries,
  normalizePhotoPhase,
};
