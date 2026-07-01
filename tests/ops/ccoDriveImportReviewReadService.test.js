'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  deriveMatchGround,
  mediaKind,
  mapItemForUi,
  loadSummary,
  listQueue,
  invalidateDriveImportReviewCache,
  isLegacyDriveDuplicateAsset,
} = require('../../src/ops/ccoDriveImportReviewReadService');

function withTempAssets(items, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dir-review-'));
  const assetsPath = path.join(dir, 'cco-patient-assets.json');
  fs.writeFileSync(assetsPath, `${JSON.stringify({ items }, null, 2)}\n`);
  process.env.ARCANA_CCO_PATIENT_ASSETS_PATH = assetsPath;
  invalidateDriveImportReviewCache();
  try {
    return run(dir);
  } finally {
    delete process.env.ARCANA_CCO_PATIENT_ASSETS_PATH;
    invalidateDriveImportReviewCache();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('deriveMatchGround uses statusHistory reason for photo review', () => {
  const ground = deriveMatchGround({
    patientId: 'cliento_abc',
    confidence: 'high',
    statusHistory: [{ reason: 'needs_photo_review' }],
    technicalInfo: { needsPhotoReview: true },
  });
  assert.equal(ground, 'needs_photo_review');
});

test('mediaKind splits documents and images', () => {
  assert.equal(mediaKind({ mimeType: 'image/jpeg', category: 'photo_before' }), 'image');
  assert.equal(mediaKind({ mimeType: 'application/pdf', category: 'journal' }), 'document');
});

test('loadSummary counts drive_import NEEDS_REVIEW only', () => {
  withTempAssets(
    {
      a1: {
        id: 'a1',
        status: 'NEEDS_REVIEW',
        sourceSystem: 'drive_import',
        patientId: 'cliento_1',
        originalFileName: 'IMG_1.JPG',
        mimeType: 'image/jpeg',
        category: 'photo_before',
        confidence: 'high',
        originalDrivePath: 'Hair TP Clinic 2025/foo/IMG_1.JPG',
        statusHistory: [{ reason: 'needs_photo_review' }],
        technicalInfo: { needsPhotoReview: true },
      },
      a2: {
        id: 'a2',
        status: 'VISIBLE_ON_PATIENT_CARD',
        sourceSystem: 'drive_import',
        patientId: 'cliento_1',
      },
      a3: {
        id: 'a3',
        status: 'NEEDS_REVIEW',
        sourceSystem: 'm365_halso',
        patientId: 'cliento_2',
      },
    },
    (dir) => {
      const summary = loadSummary(dir);
      assert.equal(summary.totalNeedsReview, 1);
      assert.equal(summary.writeEnabled, false);
      assert.equal(summary.facets.mediaKinds.image, 1);
    }
  );
});

test('isLegacyDriveDuplicateAsset detects R2 REJECTED duplicates', () => {
  assert.equal(
    isLegacyDriveDuplicateAsset({
      status: 'REJECTED',
      sourceSystem: 'drive_import',
      technicalInfo: { markedDuplicate: true },
    }),
    true
  );
  assert.equal(
    isLegacyDriveDuplicateAsset({
      status: 'DUPLICATE',
      sourceSystem: 'drive_import',
      technicalInfo: { markedDuplicate: true },
    }),
    false
  );
});

test('loadSummary reports legacyRejectedDuplicates separately from queue', () => {
  withTempAssets(
    {
      legacy: {
        id: 'legacy',
        status: 'REJECTED',
        sourceSystem: 'drive_import',
        reviewReason: 'marked_duplicate',
        patientId: 'cliento_1',
      },
      open: {
        id: 'open',
        status: 'NEEDS_REVIEW',
        sourceSystem: 'drive_import',
        patientId: 'cliento_2',
        originalFileName: 'doc.pdf',
        mimeType: 'application/pdf',
        category: 'other',
        confidence: 'high',
        originalDrivePath: 'Hair TP Clinic 2025/doc.pdf',
      },
    },
    (dir) => {
      const summary = loadSummary(dir);
      assert.equal(summary.totalNeedsReview, 1);
      assert.equal(summary.legacyRejectedDuplicates, 1);
    }
  );
});

test('listQueue filters by year, mediaKind and patientId', () => {
  withTempAssets(
    {
      img: {
        id: 'img',
        status: 'NEEDS_REVIEW',
        sourceSystem: 'drive_import',
        patientId: 'cliento_jonas',
        originalFileName: 'IMG_2.JPG',
        mimeType: 'image/jpeg',
        category: 'photo_during',
        confidence: 'medium',
        originalDrivePath: 'Hair TP Clinic 2024/Jonas/IMG_2.JPG',
        statusHistory: [{ reason: 'needs_photo_review' }],
        technicalInfo: { needsPhotoReview: true },
      },
      doc: {
        id: 'doc',
        status: 'NEEDS_REVIEW',
        sourceSystem: 'drive_import',
        patientId: 'cliento_other',
        originalFileName: 'Journal.pdf',
        mimeType: 'application/pdf',
        category: 'journal',
        confidence: 'high',
        documentDate: '2023-05-01',
        originalDrivePath: 'Hair TP Clinic 2023/other/Journal.pdf',
        statusHistory: [{ reason: 'needs_classification' }],
        technicalInfo: { needsClassification: true },
      },
    },
    (dir) => {
      const directory = {
        cliento_jonas: { displayName: 'Jonas Lundvall' },
      };
      fs.writeFileSync(
        path.join(dir, 'cco-customers.json'),
        `${JSON.stringify({ tenants: { hair_tp: { customerState: { directory } } } }, null, 2)}\n`
      );
      invalidateDriveImportReviewCache();

      const mapped = mapItemForUi(
        {
          id: 'img',
          status: 'NEEDS_REVIEW',
          sourceSystem: 'drive_import',
          patientId: 'cliento_jonas',
          originalFileName: 'IMG_2.JPG',
          mimeType: 'image/jpeg',
          category: 'photo_during',
          confidence: 'medium',
          originalDrivePath: 'Hair TP Clinic 2024/Jonas/IMG_2.JPG',
          originalDriveFileId: 'drive-123',
          statusHistory: [{ reason: 'needs_photo_review' }],
          technicalInfo: { needsPhotoReview: true },
        },
        directory
      );
      assert.equal(mapped.suggestedPatientLabel, 'Jonas Lundvall');
      assert.equal(mapped.matchGround, 'needs_photo_review');
      assert.match(mapped.customerCardHref, /cliento_jonas/);

      const images = listQueue(dir, { mediaKind: 'image' });
      assert.equal(images.total, 1);
      assert.equal(images.items[0].assetId, 'img');

      const year2023 = listQueue(dir, { year: '2023' });
      assert.equal(year2023.total, 1);
      assert.equal(year2023.items[0].assetId, 'doc');

      const patient = listQueue(dir, { patientId: 'jonas' });
      assert.equal(patient.total, 1);
      assert.equal(patient.items[0].assetId, 'img');
    }
  );
});
