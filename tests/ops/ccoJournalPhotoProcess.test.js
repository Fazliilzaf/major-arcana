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
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    return;
  }
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
