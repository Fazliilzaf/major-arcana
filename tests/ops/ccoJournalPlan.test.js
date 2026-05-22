'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoJournalPhotoStore } = require('../../src/ops/ccoJournalPhotoStore');
const { createCcoJournalStore, JOURNAL_TYPES } = require('../../src/ops/ccoJournalStore');

test('consultation_plan is a supported journal type', () => {
  assert.ok(JOURNAL_TYPES.includes('consultation_plan'));
});

test('journal photo store saves photo and annotations', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-photos-'));
  const store = await createCcoJournalPhotoStore({ baseDir: dir });
  const saved = await store.savePhoto({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    buffer: Buffer.from('fake-image'),
    mimeType: 'image/jpeg',
    originalName: 'front.jpg',
  });
  assert.ok(saved.photoId);

  const read = await store.readPhoto({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    photoId: saved.photoId,
  });
  assert.ok(read?.buffer?.length);

  await store.saveAnnotations({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    photoId: saved.photoId,
    annotations: { shapes: [{ type: 'rect', x: 1, y: 2, w: 3, h: 4 }] },
    planSummary: { method: 'FUE', graftsTotal: '2500' },
  });

  const annotation = await store.readAnnotations({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    photoId: saved.photoId,
  });
  assert.equal(annotation.planSummary.method, 'FUE');
  assert.equal(annotation.annotations.shapes.length, 1);
});

test('journal store manages consultation plan photos and annotations', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-store-'));
  const store = await createCcoJournalStore({ filePath: path.join(dir, 'journal.json') });

  const plan = await store.ensureConsultationPlan({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    personnummer: '19960830-4698',
    actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
  });
  assert.equal(plan.journalType, 'consultation_plan');

  const withPhoto = await store.addConsultationPhotoAttachment({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    entryId: plan.entryId,
    photo: {
      photoId: 'photo-1',
      fileName: 'front.jpg',
      mimeType: 'image/jpeg',
      storedAt: new Date().toISOString(),
      label: 'Front',
    },
    actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
  });
  assert.equal(withPhoto.attachments.length, 1);

  const attachmentId = withPhoto.attachments[0].attachmentId;
  const annotated = await store.updateConsultationPhotoAnnotation({
    tenantId: 'hair-tp-clinic',
    patientId: 'patient-1',
    entryId: plan.entryId,
    attachmentId,
    annotations: { shapes: [{ type: 'arrow', x1: 0, y1: 0, x2: 10, y2: 10 }] },
    planSummary: { method: 'FUE', graftsTotal: '2800', zones: ['Front'], notes: 'Plan A' },
    actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
  });

  assert.equal(annotated.fields.method, 'FUE');
  assert.equal(annotated.attachments[0].hasAnnotation, true);
});
