'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoCommercialRouter } = require('../../src/routes/ccoCommercial');
const { createCcoCommercialStore } = require('../../src/ops/ccoCommercialStore');
const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const { createCcoOfferDocumentStore } = require('../../src/ops/ccoOfferDocumentStore');
const { buildOfferDocumentHtml, buildPlanSnapshot } = require('../../src/ops/ccoOfferFromPlan');

function mockAuth() {
  return (_req, _res, next) => next();
}

function mockRole() {
  return (_req, _res, next) => next();
}

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-commercial-route-'));
  const commercialStore = await createCcoCommercialStore({
    filePath: path.join(tempDir, 'commercial.json'),
  });
  const journalStore = await createCcoJournalStore({
    filePath: path.join(tempDir, 'journal.json'),
  });
  const offerDocumentStore = await createCcoOfferDocumentStore({
    baseDir: path.join(tempDir, 'offer-documents'),
  });
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(
    '/api/v1',
    createCcoCommercialRouter({
      commercialStore,
      journalStore,
      offerDocumentStore,
      authStore: {
        async addAuditEvent() {
          return true;
        },
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
      },
      config: {
        defaultTenantId: 'tenant-a',
      },
      requireAuth: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
    })
  );
  return { app, tempDir, journalStore };
}

test('buildOfferDocumentHtml includes plan fields and patient name', () => {
  const html = buildOfferDocumentHtml({
    origin: 'http://127.0.0.1:3100',
    commercialCase: {
      commercialCaseId: 'case-1',
      offerType: 'FUE — Front, vertex',
      quotedAmount: '75 000 kr',
      depositAmount: '15 000 kr',
      notes: 'Plan enligt konsultation',
    },
    planSnapshot: buildPlanSnapshot(
      {
        entryId: 'entry-1',
        journalType: 'consultation_plan',
        patientId: 'patient-1',
        personnummer: '19960830-4698',
        fields: {
          method: 'FUE',
          graftsTotal: '2800',
          zones: ['Front', 'Vertex'],
          notes: 'Plan A',
        },
        attachments: [
          {
            type: 'consultation_photo',
            photoId: 'photo-1',
            fileName: 'front.jpg',
            hasAnnotation: true,
            annotatedPreviewAvailable: true,
          },
        ],
      },
      { displayName: 'Abbe Holmlund' }
    ),
  });
  assert.match(html, /Abbe Holmlund/);
  assert.match(html, /2800/);
  assert.match(html, /75 000 kr/);
  assert.match(html, /photo-1/);
});

test('offer-from-plan creates commercial case and html document', async () => {
  const fixture = await createFixture();
  try {
    const entry = await fixture.journalStore.ensureConsultationPlan({
      tenantId: 'tenant-a',
      patientId: 'patient-1',
      personnummer: '19960830-4698',
      actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
    });
    await fixture.journalStore.addConsultationPhotoAttachment({
      tenantId: 'tenant-a',
      patientId: 'patient-1',
      entryId: entry.entryId,
      photo: {
        photoId: 'photo-1',
        fileName: 'front.jpg',
        mimeType: 'image/jpeg',
        label: 'Front',
      },
      actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
    });

    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cco-commercial/offer-from-plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patientId: 'patient-1',
          entryId: entry.entryId,
          quotedAmount: '75 000 kr',
          depositAmount: '15 000 kr',
        }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.commercialCase.linkedJournalEntryId, entry.entryId);
      assert.equal(payload.commercialCase.quoteStatus, 'draft');
      assert.ok(payload.commercialCase.offerDocumentId);
      assert.ok(payload.offerDocumentUrl);
      assert.ok(payload.offerDocumentPdfUrl);

      const docResponse = await fetch(
        `${baseUrl}/cco-commercial/offer-document?patientId=patient-1&documentId=${encodeURIComponent(payload.commercialCase.offerDocumentId)}`
      );
      assert.equal(docResponse.status, 200);
      const html = await docResponse.text();
      assert.match(html, /Hair TP Clinic/);
      assert.match(html, /75 000 kr/);

      const pdfResponse = await fetch(
        `${baseUrl}/cco-commercial/offer-document.pdf?patientId=patient-1&documentId=${encodeURIComponent(payload.commercialCase.offerDocumentId)}`
      );
      assert.equal(pdfResponse.status, 200);
      assert.match(pdfResponse.headers.get('content-type') || '', /pdf/i);
      const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
      assert.ok(pdfBytes.length > 500);
      assert.match(String(pdfBytes.slice(0, 8)), /^%PDF-/);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
