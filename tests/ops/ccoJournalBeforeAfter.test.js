'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  listBeforeAfterPhotos,
  listBeforeAfterPhotosFromEntries,
  normalizePhotoPhase,
} = require('../../src/ops/ccoJournalBeforeAfter');

test('normalizePhotoPhase accepts before/after only', () => {
  assert.equal(normalizePhotoPhase('before'), 'before');
  assert.equal(normalizePhotoPhase('AFTER'), 'after');
  assert.equal(normalizePhotoPhase('side'), '');
});

test('listBeforeAfterPhotosFromEntries groups clinical photos', () => {
  const gallery = listBeforeAfterPhotosFromEntries([
    {
      entryId: 'e1',
      journalType: 'consultation_plan',
      attachments: [
        { type: 'consultation_photo', photoId: 'p1', photoPhase: 'before', capturedAt: '2026-05-01' },
        { type: 'consultation_photo', photoId: 'p2', photoPhase: 'after', capturedAt: '2026-06-01' },
        { type: 'historical_pdf', photoId: 'pdf1' },
      ],
    },
  ]);
  assert.equal(gallery.before.length, 1);
  assert.equal(gallery.after.length, 1);
  assert.equal(gallery.total, 2);
});

test('listBeforeAfterPhotos hanterar bade array och objekt fran journalStore', async () => {
  const entries = [
    {
      entryId: 'e1',
      journalType: 'consultation_plan',
      attachments: [
        { type: 'consultation_photo', photoId: 'p1', photoPhase: 'before', capturedAt: '2026-05-01' },
      ],
    },
  ];

  const arrayStore = { listEntries: async () => entries };
  const objectStore = { listEntries: async () => ({ entries }) };

  const fromArray = await listBeforeAfterPhotos({
    journalStore: arrayStore,
    tenantId: 't1',
    patientId: 'pat-1',
  });
  assert.equal(fromArray.before.length, 1, 'array-format ska fungera');

  const fromObject = await listBeforeAfterPhotos({
    journalStore: objectStore,
    tenantId: 't1',
    patientId: 'pat-1',
  });
  assert.equal(fromObject.before.length, 1, 'objektformat ska fungera');
});
