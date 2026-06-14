const test = require('node:test');
const assert = require('node:assert/strict');

const { buildImageDisplayName } = require('../../src/ops/ccoAssetNaming/imageDisplayNameBuilder');
const { buildPhotoReviewDisplayName } = require('../../src/ops/ccoAssetNaming/photoReviewNaming');
const { assetEncounterDate } = require('../../src/ops/ccoAssetNaming/encounterMapper');

const mismatchedPhoto = {
  id: 'asset-mismatch',
  category: 'photo_during',
  mimeType: 'image/jpeg',
  originalFileName: '025436E4.jpeg',
  originalDrivePath: 'Hair TP Clinic/Abdirahman - 2025-01-06 OP (FUE)/025436E4.jpeg',
  documentDate: '2025-01-06',
  captureDate: '2026-01-06',
  captureDateTime: '2026-01-06T11:36:21+01:00',
};

test('image display naming uses EXIF capture date before Drive folder documentDate', () => {
  const name = buildImageDisplayName(mismatchedPhoto);

  assert.match(name.displayName, /^2026-01-06 ·/);
  assert.equal(name.captureDate, '2026-01-06');
});

test('photo review naming uses EXIF capture date before Drive folder documentDate', () => {
  const name = buildPhotoReviewDisplayName({
    ...mismatchedPhoto,
    imageStage: 'during',
    bodyArea: 'skalp',
  });

  assert.match(name, /^2026-01-06 ·/);
});

test('encounter mapping uses media capture date before Drive folder documentDate', () => {
  assert.equal(assetEncounterDate(mismatchedPhoto), '2026-01-06');
  assert.equal(
    assetEncounterDate({
      category: 'journal',
      mimeType: 'application/pdf',
      documentDate: '2025-01-06',
      captureDate: '2026-01-06',
    }),
    '2025-01-06'
  );
});
