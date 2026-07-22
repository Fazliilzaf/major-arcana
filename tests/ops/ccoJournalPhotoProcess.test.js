'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectUploadMime,
  isAllowedJournalPhotoMime,
  isHeicLike,
  normalizeJournalPhotoUpload,
  buildStoredFileName,
} = require('../../src/ops/ccoJournalPhotoProcess');

test('detectUploadMime recognizes HEIC by extension', () => {
  assert.equal(detectUploadMime('', 'IMG_1234.HEIC'), 'image/heic');
  assert.equal(detectUploadMime('image/jpeg', 'photo.jpg'), 'image/jpeg');
});

test('isAllowedJournalPhotoMime accepts jpeg png heic', () => {
  assert.equal(isAllowedJournalPhotoMime('image/jpeg', 'a.jpg'), true);
  assert.equal(isAllowedJournalPhotoMime('image/png', 'a.png'), true);
  assert.equal(isAllowedJournalPhotoMime('', 'a.heic'), true);
  assert.equal(isAllowedJournalPhotoMime('image/gif', 'a.gif'), false);
});

test('buildStoredFileName keeps safe base name', () => {
  assert.match(buildStoredFileName('Front view.jpg', 'image/jpeg'), /^Front view\.jpg$/);
  assert.match(buildStoredFileName('', 'image/png'), /\.png$/);
});

test('normalizeJournalPhotoUpload converts jpeg buffer', async () => {
  const sharp = require('sharp');
  const input = await sharp({
    create: { width: 24, height: 24, channels: 3, background: { r: 200, g: 120, b: 80 } },
  })
    .jpeg()
    .toBuffer();

  const normalized = await normalizeJournalPhotoUpload({
    buffer: input,
    mimeType: 'image/jpeg',
    originalName: 'test.jpg',
  });
  assert.equal(normalized.mimeType, 'image/jpeg');
  assert.ok(normalized.buffer.length > 0);
  assert.match(normalized.fileName, /\.jpg$/);
});

test('normalizeJournalPhotoUpload preserves the patient-photo transform contract with sharp', async () => {
  const sharp = require('sharp');

  const rotatedInput = await sharp({
    create: { width: 64, height: 32, channels: 3, background: { r: 40, g: 110, b: 190 } },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const normalizedJpeg = await normalizeJournalPhotoUpload({
    buffer: rotatedInput,
    mimeType: 'image/jpeg',
    originalName: 'rotation.jpg',
  });
  const jpegMeta = await sharp(normalizedJpeg.buffer).metadata();
  assert.equal(normalizedJpeg.mimeType, 'image/jpeg');
  assert.equal(jpegMeta.format, 'jpeg');
  assert.deepEqual([jpegMeta.width, jpegMeta.height], [32, 64]);

  const pngInput = await sharp({
    create: { width: 80, height: 40, channels: 4, background: { r: 30, g: 160, b: 100, alpha: 1 } },
  })
    .png()
    .toBuffer();
  const normalizedPng = await normalizeJournalPhotoUpload({
    buffer: pngInput,
    mimeType: 'image/png',
    originalName: 'patient.png',
  });
  const pngMeta = await sharp(normalizedPng.buffer).metadata();
  assert.equal(normalizedPng.mimeType, 'image/png');
  assert.equal(pngMeta.format, 'png');

  // The same rotate/resize/JPEG sequence used by the patient-file preview must
  // remain valid after the sharp upgrade.
  const preview = await sharp(normalizedPng.buffer)
    .rotate()
    .resize({ width: 24, height: 24, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
  const previewMeta = await sharp(preview).metadata();
  assert.equal(previewMeta.format, 'jpeg');
  assert.deepEqual([previewMeta.width, previewMeta.height], [24, 12]);
});

test('normalizeJournalPhotoUpload rejects unsupported mime', async () => {
  await assert.rejects(
    () =>
      normalizeJournalPhotoUpload({
        buffer: Buffer.from('not-an-image'),
        mimeType: 'image/gif',
        originalName: 'x.gif',
      }),
    (error) => error.statusCode === 415
  );
});

test('isHeicLike detects HEIF variants', () => {
  assert.equal(isHeicLike('image/heif', 'photo.heif'), true);
  assert.equal(isHeicLike('image/jpeg', 'photo.jpg'), false);
});
