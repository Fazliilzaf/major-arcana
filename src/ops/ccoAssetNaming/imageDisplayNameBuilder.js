'use strict';

const { parseIsoDate } = require('./encounterNameResolver');

const ZONE_PATTERNS = [
  { re: /donor|donator|occip/i, zone: 'donorområde' },
  { re: /crown|krona|vertex|vortex/i, zone: 'crown' },
  { re: /skalp|scalp|h[aä]rbotten|top/i, zone: 'skalp' },
  { re: /hairline|h[aä]rlinje|front/i, zone: 'hairline' },
  { re: /temporal|tinning/i, zone: 'tinning' },
  { re: /beard|sk[aä]gg/i, zone: 'skägg' },
];

const STAGE_LABEL = {
  before: 'Före',
  during: 'Under',
  after: 'Efter',
  follow_up: 'Uppföljning',
  unknown: 'Okänd fas',
};

const IMAGE_TYPE_MAP = {
  photo_before: 'before',
  photo_during: 'during',
  photo_after: 'after',
};

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function detectZone(text) {
  const hay = normalizeText(text);
  for (const p of ZONE_PATTERNS) {
    if (p.re.test(hay)) return p.zone;
  }
  return null;
}

function classifyImage(asset = {}) {
  const fileName = normalizeText(asset.originalFileName);
  const folder = normalizeText(asset.originalDrivePath);
  const hay = `${fileName} ${folder}`.toLowerCase();
  const cat = normalizeText(asset.category);

  let imageType = IMAGE_TYPE_MAP[cat] || 'unknown';
  if (/f[oö]re|before|innan/i.test(hay)) imageType = 'before';
  else if (/efter|after/i.test(hay)) imageType = 'after';
  else if (/uppf[oö]lj|follow/i.test(hay)) imageType = 'followup';
  else if (/under|during|intra|op\b/i.test(hay)) imageType = 'during';
  else if (/consult|konsult/i.test(hay)) imageType = 'consultation';
  else if (/aisia|trichos/i.test(hay)) imageType = 'aisia';

  const bodyArea = detectZone(hay);
  let angle = null;
  if (/top|ovifr[aå]n|bird/i.test(hay)) angle = 'top';
  else if (/side|profil/i.test(hay)) angle = 'profil';
  else if (/back|bak/i.test(hay)) angle = 'bak';

  const genericCamera = /^img[_-]\d+/i.test(fileName);
  const confidence =
    bodyArea && imageType !== 'unknown' ? 'high' : genericCamera ? 'low' : 'medium';

  return {
    imageType,
    imageStage: imageType === 'followup' ? 'follow_up' : imageType,
    bodyArea,
    angle,
    suggestedCategory:
      cat ||
      (imageType === 'before'
        ? 'photo_before'
        : imageType === 'after'
          ? 'photo_after'
          : 'photo_during'),
    confidence,
  };
}

function uiStatusLabel(status) {
  switch (normalizeText(status).toUpperCase()) {
    case 'VISIBLE_ON_PATIENT_CARD':
      return 'synlig';
    case 'NEEDS_REVIEW':
      return 'review';
    case 'REJECTED':
      return 'avvisad';
    case 'DUPLICATE':
      return 'dubblett';
    case 'VERIFIED_IN_CCO':
      return 'verifierad';
    default:
      return null;
  }
}

/**
 * YYYY-MM-DD · [Behandling/Besök] · [Före/Under/Efter/Uppföljning] · [zon]
 */
function buildImageDisplayName(asset = {}, ctx = {}) {
  const date =
    parseIsoDate(asset.documentDate) ||
    parseIsoDate(asset.captureDate) ||
    parseIsoDate(asset.importedAt) ||
    'okänt datum';
  const imageMeta = classifyImage(asset);
  const visit =
    normalizeText(ctx.visitLabel) ||
    normalizeText(asset.visitLabel) ||
    normalizeText(asset.treatmentType) ||
    'Besök';
  const stage = STAGE_LABEL[imageMeta.imageStage] || STAGE_LABEL.unknown;
  const zone = imageMeta.bodyArea || 'zon okänd';

  const parts = [date, visit, stage];
  if (zone !== 'zon okänd') parts.push(zone);
  const statusSuffix = uiStatusLabel(asset.status);
  if (statusSuffix) parts.push(statusSuffix);

  return {
    displayName: parts.join(' · '),
    documentTitle: `${stage}${zone !== 'zon okänd' ? ` · ${zone}` : ''}`,
    ...imageMeta,
    captureDate: parseIsoDate(asset.documentDate) || parseIsoDate(asset.importedAt),
    namingConfidence: imageMeta.confidence,
  };
}

module.exports = {
  buildImageDisplayName,
  classifyImage,
  STAGE_LABEL,
  detectZone,
};
