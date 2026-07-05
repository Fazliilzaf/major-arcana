'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  buildVisitSegments,
  formatSegmentLabel,
  inferVisitTypeFromFiles,
  resolveVisitDate,
  resolveTakenAt,
} = require('../../src/ops/ccoPatientVisitSegments');
const { createCcoPatientMasterRouter } = require('../../src/routes/ccoPatientMaster');

test('formatSegmentLabel renders Swedish month label', () => {
  assert.equal(formatSegmentLabel('2024-04-22'), '22 april 2024');
});

test('buildVisitSegments groups images and documents on same visit date', () => {
  const result = buildVisitSegments({
    customerId: 'patient-1',
    driveFiles: [
      {
        id: 'img-1',
        assetId: 'img-1',
        fileType: 'image',
        fileName: 'Front.jpg',
        captureDateTime: '2024-04-22T09:14:00',
        documentDate: '2024-04-22',
        viewUrl: '/api/v1/cco/assets/img-1/download?inline=1',
        thumbnailUrl: '/api/v1/cco/assets/img-1/thumbnail',
        relativePath: 'Hair TP Clinic 2024/PRP 1/Front.jpg',
      },
      {
        id: 'doc-1',
        assetId: 'doc-1',
        fileType: 'journal_pdf',
        fileName: 'Journal.pdf',
        documentDate: '2024-04-22',
        viewUrl: '/api/v1/cco/assets/doc-1/download?inline=1',
        relativePath: 'Hair TP Clinic 2024/PRP 1/Journal.pdf',
      },
    ],
  });

  assert.equal(result.customerId, 'patient-1');
  assert.equal(result.visitSegments.length, 1);
  const segment = result.visitSegments[0];
  assert.equal(segment.date, '2024-04-22');
  assert.equal(segment.label, '22 april 2024');
  assert.equal(segment.visitType, 'prp');
  assert.equal(segment.images.length, 1);
  assert.equal(segment.documents.length, 1);
  assert.equal(segment.images[0].timeLabel, '09:14');
  assert.equal(segment.timeRange, '09:14');
});

test('buildVisitSegments sorts images by taken time ascending within segment', () => {
  const result = buildVisitSegments({
    driveFiles: [
      {
        id: 'img-b',
        fileType: 'image',
        fileName: 'B.jpg',
        captureDateTime: '2024-04-22T09:38:00',
        relativePath: 'PRP 1/B.jpg',
      },
      {
        id: 'img-a',
        fileType: 'image',
        fileName: 'A.jpg',
        captureDateTime: '2024-04-22T09:14:00',
        relativePath: 'PRP 1/A.jpg',
      },
    ],
  });

  const segment = result.visitSegments[0];
  assert.deepEqual(
    segment.images.map((row) => row.fileName),
    ['A.jpg', 'B.jpg']
  );
  assert.equal(segment.timeRange, '09:14–09:38');
});

test('buildVisitSegments splits same-day visits by image time clusters', () => {
  const result = buildVisitSegments({
    driveFiles: [
      {
        id: 'morning',
        fileType: 'image',
        fileName: 'Morning.jpg',
        captureDateTime: '2024-04-22T09:10:00',
        relativePath: 'Konsultation/Morning.jpg',
      },
      {
        id: 'afternoon',
        fileType: 'image',
        fileName: 'Afternoon.jpg',
        captureDateTime: '2024-04-22T15:20:00',
        relativePath: 'PRP 2/Afternoon.jpg',
      },
    ],
  });

  assert.equal(result.visitSegments.length, 2);
  assert.ok(result.visitSegments.every((segment) => segment.date === '2024-04-22'));
  assert.ok(
    result.visitSegments.some((segment) => segment.reasons.includes('same_day_time_cluster'))
  );
});

test('buildVisitSegments flags documents duplicated across same-day time clusters', () => {
  const result = buildVisitSegments({
    driveFiles: [
      {
        id: 'morning',
        fileType: 'image',
        fileName: 'Morning.jpg',
        captureDateTime: '2024-04-22T09:10:00',
        relativePath: 'Konsultation/Morning.jpg',
      },
      {
        id: 'afternoon',
        fileType: 'image',
        fileName: 'Afternoon.jpg',
        captureDateTime: '2024-04-22T15:20:00',
        relativePath: 'PRP 2/Afternoon.jpg',
      },
      {
        id: 'doc-1',
        fileType: 'journal_pdf',
        fileName: 'Journal.pdf',
        documentDate: '2024-04-22',
        relativePath: 'Hair TP Clinic 2024/PRP 1/Journal.pdf',
      },
    ],
  });

  assert.equal(result.visitSegments.length, 2);
  assert.ok(
    result.visitSegments.every((segment) =>
      segment.reasons.includes('document_shared_across_same_day_clusters')
    )
  );
  assert.deepEqual(
    result.visitSegments.map((segment) => segment.documents.map((doc) => doc.assetId)),
    [['doc-1'], ['doc-1']]
  );
  assert.ok(result.visitSegments.every((segment) => segment.confidence === 'medium'));
});

test('buildVisitSegments puts undated files in Datum/tid saknas', () => {
  const result = buildVisitSegments({
    driveFiles: [
      {
        id: 'unknown',
        fileType: 'document_pdf',
        fileName: 'Okänd.pdf',
        relativePath: 'Hair TP Clinic 2024/Okänd.pdf',
      },
    ],
  });

  assert.equal(result.visitSegments.length, 1);
  assert.equal(result.visitSegments[0].label, 'Datum/tid saknas');
  assert.equal(result.visitSegments[0].date, null);
  assert.equal(result.visitSegments[0].confidence, 'low');
  assert.ok(result.visitSegments[0].reasons.includes('missing_visit_date'));
});

test('buildVisitSegments flags low-confidence path dates for review bucket', () => {
  const result = buildVisitSegments({
    driveFiles: [
      {
        id: 'weak',
        fileType: 'document_pdf',
        fileName: '1713770400-export.pdf',
        relativePath: 'Hair TP Clinic 2024/1713770400-export.pdf',
      },
    ],
  });

  assert.equal(result.visitSegments.length, 1);
  assert.equal(result.visitSegments[0].label, 'Behöver granskning');
  assert.equal(result.visitSegments[0].confidence, 'low');
  assert.ok(result.visitSegments[0].reasons.includes('inferred_from_path_or_filename'));
});

test('buildVisitSegments: prod docs-only medium segment always has at least one reason', () => {
  const result = buildVisitSegments({
    customerId: '1ce8b444-3526-4604-ab25-c1888db635ae',
    driveFiles: [
      {
        id: '2dea24fc-e073-42f4-927f-4623d9d5f2da',
        assetId: '2dea24fc-e073-42f4-927f-4623d9d5f2da',
        source: 'patient_asset',
        fileType: 'journal_pdf',
        fileName: 'okänt datum · Dokument',
        documentDate: '2026-05-31',
        timelineDateSource: 'patient_asset.documentDate',
        occasionContext: {
          timelineKey: '2026-05-31',
          date: '2026-05-31',
          source: 'patient_asset.timeline',
        },
        relativePath: 'Hair TP Clinic 2026/FUE Operation 1/journal.pdf',
        viewUrl: '/api/v1/cco/assets/2dea24fc-e073-42f4-927f-4623d9d5f2da/download?inline=1',
      },
      {
        id: '72da68c3-1f65-4d85-ba1a-f932afdde010',
        assetId: '72da68c3-1f65-4d85-ba1a-f932afdde010',
        source: 'patient_asset',
        fileType: 'journal_pdf',
        fileName: 'okänt datum · FUE Operation 1 · Journal · journal',
        documentDate: '2026-05-31',
        occasionContext: {
          timelineKey: '2026-05-31',
          date: '2026-05-31',
          source: 'patient_asset.timeline',
        },
        relativePath: 'Hair TP Clinic 2026/FUE Operation 1/Journal.pdf',
        viewUrl: '/api/v1/cco/assets/72da68c3-1f65-4d85-ba1a-f932afdde010/download?inline=1',
      },
    ],
  });

  const segment = result.visitSegments.find((row) => row.date === '2026-05-31');
  assert.ok(segment, 'daterat docs-only segment ska finnas');
  assert.equal(segment.confidence, 'medium');
  assert.ok(segment.reasons.length >= 1, 'medium får inte ha tom reasons[]');
  assert.ok(
    segment.reasons.some((reason) =>
      ['date_without_time_metadata', 'occasion_context_only'].includes(reason)
    )
  );
  assert.equal(segment.images.length, 0);
  assert.equal(segment.documents.length, 2);
  assert.equal(segment.timeRange, '');
});

test('buildVisitSegments: all medium/low segments include at least one reason', () => {
  const fixtures = [
    {
      driveFiles: [
        {
          id: 'weak',
          fileType: 'document_pdf',
          fileName: '1713770400-export.pdf',
          relativePath: 'Hair TP Clinic 2024/1713770400-export.pdf',
        },
      ],
    },
    {
      driveFiles: [
        {
          id: 'unknown',
          fileType: 'document_pdf',
          fileName: 'Okänd.pdf',
          relativePath: 'Hair TP Clinic 2024/Okänd.pdf',
        },
      ],
    },
    {
      driveFiles: [
        {
          id: 'mismatch',
          fileType: 'image',
          fileName: 'Mismatch.jpg',
          captureDateTime: '2024-04-22T09:14:00',
          documentDate: '2024-04-21',
          captureDateMismatch: true,
          relativePath: 'Hair TP Clinic 2024/PRP 1/Mismatch.jpg',
        },
      ],
    },
  ];

  for (const fixture of fixtures) {
    const result = buildVisitSegments(fixture);
    for (const segment of result.visitSegments) {
      if (segment.confidence === 'medium' || segment.confidence === 'low') {
        assert.ok(
          segment.reasons.length >= 1,
          `${segment.label} (${segment.confidence}) saknar reason`
        );
      }
    }
  }
});

test('buildVisitSegments keeps capture/document date mismatches on resolved visit date', () => {
  const result = buildVisitSegments({
    driveFiles: [
      {
        id: 'mismatch',
        fileType: 'image',
        fileName: 'Mismatch.jpg',
        captureDateTime: '2024-04-22T09:14:00',
        documentDate: '2024-04-21',
        captureDateMismatch: true,
        relativePath: 'Hair TP Clinic 2024/PRP 1/Mismatch.jpg',
      },
    ],
  });

  assert.equal(result.visitSegments.length, 1);
  assert.equal(result.visitSegments[0].date, '2024-04-22');
  assert.equal(result.visitSegments[0].label, '22 april 2024');
  assert.equal(result.visitSegments[0].confidence, 'medium');
  assert.ok(result.visitSegments[0].reasons.includes('capture_document_date_mismatch'));
});

test('GET /patient/visit-segments returns grouped payload', async (t) => {
  const patientMasterStore = {
    getPatient: async () => ({
      id: 'patient-abc',
      tenantId: 'hair-tp-clinic',
      displayName: 'Test Patient',
      personnummer: '19900101-1234',
    }),
    buildPatientCardReadout: (patient) => ({ patientId: patient.id }),
  };

  const migrationIndexStore = {
    getFilesForPersonnummer: async () => [],
  };

  const assetStore = {
    listAssetsForPatient: () => [
      {
        id: 'asset-1',
        patientId: 'patient-abc',
        status: 'VISIBLE_ON_PATIENT_CARD',
        category: 'photo_before',
        mimeType: 'image/jpeg',
        originalFileName: 'Front.jpg',
        captureDateTime: '2024-04-22T09:14:00',
        documentDate: '2024-04-22',
        originalDrivePath: 'Hair TP Clinic 2024/PRP 1/Front.jpg',
      },
    ],
    listItemsForEnrichment: () => [],
  };

  const authStore = {
    addAuditEvent: async () => {},
    resolveActor: async () => ({
      tenantId: 'hair-tp-clinic',
      userId: 'u-1',
      role: 'OWNER',
    }),
  };

  const app = express();
  app.use((req, _res, next) => {
    req.auth = { tenantId: 'hair-tp-clinic', userId: 'u-1', role: 'OWNER' };
    req.currentUser = { id: 'u-1', displayName: 'Owner' };
    req.currentMembership = { tenantId: 'hair-tp-clinic', role: 'OWNER' };
    next();
  });
  app.use(
    '/api/v1',
    createCcoPatientMasterRouter({
      patientMasterStore,
      migrationIndexStore,
      resolvePatientAssetStore: async () => assetStore,
      authStore,
      config: { defaultTenant: 'hair-tp-clinic' },
      requireAuth: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
    })
  );

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(
    () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  );

  const { port } = server.address();
  const res = await fetch(
    `http://127.0.0.1:${port}/api/v1/cco-patient-master/patient/visit-segments?patientId=patient-abc`
  );
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.patientId, 'patient-abc');
  assert.equal(body.customerId, 'patient-abc');
  assert.equal(body.visitSegments.length, 1);
  assert.equal(body.visitSegments[0].visitType, 'prp');
});

test('inferVisitTypeFromFiles maps operation and consultation tokens', () => {
  assert.equal(
    inferVisitTypeFromFiles([{ relativePath: 'Hair TP Clinic 2024/FUE Operation 1/Front.jpg' }]),
    'operation'
  );
  assert.equal(
    inferVisitTypeFromFiles([{ relativePath: 'Hair TP Clinic 2024/Konsultation/anteckning.pdf' }]),
    'consultation'
  );
});

test('resolveVisitDate prefers timeline metadata over path heuristics', () => {
  assert.equal(
    resolveVisitDate({
      timelineDate: '2024-05-01',
      relativePath: 'Hair TP Clinic 2023/file.jpg',
    }),
    '2024-05-01'
  );
});

test('resolveTakenAt returns captureDateTime when present', () => {
  assert.equal(
    resolveTakenAt({
      captureDateTime: '2024-04-22T09:14:00',
      documentDate: '2024-04-22',
    }),
    '2024-04-22T09:14:00'
  );
});
