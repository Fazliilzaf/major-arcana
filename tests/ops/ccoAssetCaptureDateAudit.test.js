'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCaptureDateAudit,
  parseCaptureDateFromName,
  parseExifDateTime,
} = require('../../src/ops/ccoAssetCaptureDateAudit');

test('parseExifDateTime returns ISO date and keeps timezone offset', () => {
  assert.deepEqual(parseExifDateTime('2026:05:05 13:50:23', '+02:00'), {
    date: '2026-05-05',
    dateTime: '2026-05-05T13:50:23+02:00',
    source: 'exif',
    confidence: 'high',
  });
});

test('parseCaptureDateFromName handles exported WhatsApp/photo names', () => {
  assert.deepEqual(parseCaptureDateFromName('PHOTO-2026-05-05-16-51-05 2.jpg'), {
    date: '2026-05-05',
    dateTime: '2026-05-05T16:51:05',
    source: 'filename',
    confidence: 'medium',
  });
});

test('buildCaptureDateAudit flags document/capture date conflicts', () => {
  const audit = buildCaptureDateAudit({
    asset: {
      mimeType: 'image/jpeg',
      documentDate: '2026-04-05',
      originalFileName: 'PHOTO-2026-03-05-15-12-04.jpg',
    },
  });
  assert.equal(audit.captureDate, '2026-03-05');
  assert.equal(audit.captureDateSource, 'filename');
  assert.equal(audit.captureDateMismatch, true);
});
