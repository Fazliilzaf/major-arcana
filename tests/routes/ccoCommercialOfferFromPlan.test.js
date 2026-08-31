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
const {
  buildOfferDocumentHtml,
  buildOfferPlanData,
  buildPlanSnapshot,
} = require('../../src/ops/ccoOfferFromPlan');
const { buildOfferSignPageHtml } = require('../../src/ops/ccoOfferEsign');

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

function readInjectedPortalValue(html, globalName) {
  const pattern = new RegExp(`window\\.${globalName}=([^;]+);`);
  const match = html.match(pattern);
  assert.ok(match, `${globalName} ska injiceras i kundportalen`);
  return JSON.parse(match[1]);
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
  const photoReads = [];
  const journalPhotoStore = {
    photoReads,
    async readAnnotatedPreview({ photoId }) {
      photoReads.push({ variant: 'annotated', photoId });
      if (photoId !== 'photo-1') return null;
      return { buffer: Buffer.from('annotated-photo'), mimeType: 'image/jpeg' };
    },
    async readPhoto({ photoId }) {
      photoReads.push({ variant: 'original', photoId });
      if (photoId !== 'photo-1') return null;
      return { buffer: Buffer.from('original-photo'), mimeType: 'image/jpeg' };
    },
  };
  const treatmentAgreementStore = {
    async getPatientAgreement({ patientId }) {
      if (patientId !== 'patient-1') return null;
      return {
        tenantId: 'tenant-a',
        patientId: 'patient-1',
        agreementStatus: 'bookable',
        deliveryMode: 'distans',
        signedAt: '2026-07-01T08:00:00.000Z',
        customerSignedName: 'Kund',
        consent: {
          signed: true,
          signedAt: '2026-07-01T08:00:00.000Z',
          signedBy: 'Kund',
        },
      };
    },
  };
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(
    '/api/v1',
    createCcoCommercialRouter({
      commercialStore,
      journalStore,
      journalPhotoStore,
      offerDocumentStore,
      treatmentAgreementStore,
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
      renderHtmlToPdfBuffer: async () => Buffer.from(`%PDF-1.4\n${'mock offer pdf '.repeat(80)}\n`),
    })
  );
  return {
    app,
    tempDir,
    commercialStore,
    journalStore,
    journalPhotoStore,
    treatmentAgreementStore,
  };
}

test('buildOfferDocumentHtml includes plan fields and patient name', () => {
  const planSnapshot = buildPlanSnapshot(
    {
      entryId: 'entry-1',
      journalType: 'consultation_plan',
      patientId: 'patient-1',
      personnummer: '19960830-4698',
      fields: {
        method: 'FUE',
        graftsTotal: '2800',
        zones: [
          { label: 'Hårlinje', grafts: '500' },
          { label: 'Krona', grafts: '2300' },
        ],
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
  );
  const offerPlan = buildOfferPlanData(planSnapshot, {
    offerType: 'FUE — Hårlinje, krona',
    quotedAmount: '75 000 kr',
    depositAmount: '15 000 kr',
  });
  const html = buildOfferDocumentHtml({
    origin: 'http://127.0.0.1:3100',
    commercialCase: {
      commercialCaseId: 'case-1',
      offerType: 'FUE — Front, vertex',
      quotedAmount: '75 000 kr',
      depositAmount: '15 000 kr',
      notes: 'Plan enligt konsultation',
      offerPlan,
    },
    planSnapshot,
  });
  assert.match(html, /Abbe Holmlund/);
  assert.match(html, /2800/);
  assert.match(html, /Hårlinje/);
  assert.match(html, /500 hårsäckar/);
  assert.match(html, /Krona/);
  assert.match(html, /2300 hårsäckar/);
  assert.match(html, /75 000 kr/);
  assert.match(html, /photo-1/);
});

test('ORD-149: offerten visar tre rader — exkl / moms / att betala (bakåt)', () => {
  const html = buildOfferDocumentHtml({
    commercialCase: {
      commercialCaseId: 'case-vat',
      offerType: 'DHI',
      serviceId: '7097',
      quotedAmount: '52 000 kr',
      offerPlan: { price: { quotedAmount: '52 000 kr' } },
    },
    planSnapshot: { displayName: 'Anna', personnummer: '19960830-4698' },
  });
  // Momsen räknas BAKÅT: 52 000 / 1.25 = 41 600 exkl, moms 10 400.
  assert.match(html, /Pris exkl\. moms/);
  assert.match(html, /41 600 kr/);
  assert.match(html, /Moms 25 %/);
  assert.match(html, /10 400 kr/);
  assert.match(html, /Att betala/);
  assert.match(html, /52 000 kr/);
  // Inte framåt — 13 000 vore pris × 25 %, fel riktning.
  assert.doesNotMatch(html, /13 000 kr/);
  // Tjänstespecifikationens version bärs av offerten — ur kopplad spec (spec_tp).
  assert.match(html, /Version 1/);
});

test('buildOfferSignPageHtml renders secure annotated consultation photo panel', () => {
  const html = buildOfferSignPageHtml({
    origin: 'http://127.0.0.1:3100',
    token: 'tok-1',
    commercialCase: {
      customerName: 'Abbe Holmlund',
      quoteStatus: 'sent',
      serviceId: '7097',
      offerPlan: {
        schemaVersion: 'offer-plan.v1',
        attachments: [
          {
            photoId: 'photo-1',
            label: 'Hårlinje ritad framifrån',
            hasAnnotation: true,
            annotatedPreviewAvailable: true,
          },
        ],
      },
    },
  });
  assert.match(html, /Ritade konsultationsbilder/);
  assert.match(html, /Hårlinje ritad framifrån/);
  assert.match(html, /Ritad plan/);
  assert.match(
    html,
    /\/api\/v1\/cco-commercial\/offer-photo\?token=tok-1&amp;photoId=photo-1&amp;variant=annotated/
  );
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
    const planEntry = await fixture.journalStore.upsertEntry(
      {
        ...entry,
        fields: {
          ...entry.fields,
          method: 'DHI',
          graftsTotal: '3500',
          zones: [
            { label: 'Hårlinje', grafts: '500' },
            { label: 'Mitt', grafts: '1000' },
            { label: 'Krona', grafts: '2000' },
          ],
          notes: 'Hårlinje först, därefter mitt och krona enligt ritade bilder.',
        },
      },
      { actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' } }
    );
    await fixture.journalStore.addConsultationPhotoAttachment({
      tenantId: 'tenant-a',
      patientId: 'patient-1',
      entryId: planEntry.entryId,
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
          entryId: planEntry.entryId,
          serviceId: '7097',
          quotedAmount: '75 000 kr',
          depositAmount: '15 000 kr',
        }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.commercialCase.linkedJournalEntryId, planEntry.entryId);
      assert.equal(payload.commercialCase.quoteStatus, 'draft');
      assert.ok(payload.commercialCase.offerDocumentId);
      assert.ok(payload.offerDocumentUrl);
      assert.ok(payload.offerDocumentPdfUrl);
      assert.equal(payload.offerPlan.schemaVersion, 'offer-plan.v1');
      assert.equal(payload.offerPlan.method, 'DHI');
      assert.equal(payload.offerPlan.grafts.total, '3500');
      assert.deepEqual(
        payload.offerPlan.grafts.zones.map((zone) => [zone.label, zone.grafts]),
        [
          ['Hårlinje', '500'],
          ['Mitt', '1000'],
          ['Krona', '2000'],
        ]
      );
      assert.equal(payload.offerPlan.price.quotedAmount, '75 000 kr');

      const docResponse = await fetch(
        `${baseUrl}/cco-commercial/offer-document?patientId=patient-1&documentId=${encodeURIComponent(payload.commercialCase.offerDocumentId)}`
      );
      assert.equal(docResponse.status, 200);
      const html = await docResponse.text();
      assert.match(html, /Hair TP Clinic/);
      assert.match(html, /75 000 kr/);
      assert.match(html, /Hårlinje/);
      assert.match(html, /Krona/);

      const sendResponse = await fetch(`${baseUrl}/cco-commercial/offer-send-for-sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patientId: 'patient-1' }),
      });
      assert.equal(sendResponse.status, 200);
      const sentPayload = await sendResponse.json();
      assert.equal(sentPayload.commercialCase.quoteStatus, 'sent');
      assert.ok(sentPayload.offerSignUrl);
      assert.ok(sentPayload.customerPortalUrl);
      assert.equal(
        sentPayload.commercialCase.offerPlan.informationDeliveredAt,
        sentPayload.commercialCase.quoteSentAt
      );

      // ORD-153 §2: token är ingången till legitimering, inte nyckeln. Länken
      // kunden får pekar på BankID-grinden — aldrig på en innehållsyta.
      assert.match(sentPayload.offerSignUrl, /\/api\/v1\/cco-portal\/bankid\/login\?token=/);
      assert.match(sentPayload.customerPortalUrl, /\/api\/v1\/cco-portal\/bankid\/login\?token=/);

      const signUrl = new URL(sentPayload.offerSignUrl);
      const token = signUrl.searchParams.get('token');
      assert.equal(token, sentPayload.commercialCase.esignToken);

      // ORD-153 §1: alla kundvända innehållsvägar kräver L2-session. Utan den är
      // de 401 (fail-closed) — signeringssidan, offertdokumentet, PDF:en, fotona.
      const signPageResponse = await fetch(
        `${baseUrl}/cco-commercial/offer-sign-page?token=${encodeURIComponent(token)}`
      );
      assert.equal(signPageResponse.status, 401);

      const portalResponse = await fetch(
        `${baseUrl}/cco-commercial/customer-offer-portal?token=${encodeURIComponent(token)}`
      );
      assert.equal(portalResponse.status, 401);

      // ORD-153 §1/§2: en ogiltig token utan session ger SAMMA 401 som en giltig
      // — grinden (requireL2Session) löper före token-uppslaget, så token-giltighet
      // läcker aldrig (ingen 404/401-skillnad mot dummy).
      const dummyPortalResponse = await fetch(
        `${baseUrl}/cco-commercial/customer-offer-portal?token=dummy-invalid-token`
      );
      assert.equal(dummyPortalResponse.status, 401);
      const customerDocResponse = await fetch(
        `${baseUrl}/cco-commercial/customer-offer-document?token=${encodeURIComponent(token)}`
      );
      assert.equal(customerDocResponse.status, 401);

      const customerPdfResponse = await fetch(
        `${baseUrl}/cco-commercial/customer-offer-document.pdf?token=${encodeURIComponent(token)}`
      );
      assert.equal(customerPdfResponse.status, 401);

      const photoResponse = await fetch(
        `${baseUrl}/cco-commercial/offer-photo?token=${encodeURIComponent(token)}&photoId=photo-1&variant=annotated`
      );
      assert.equal(photoResponse.status, 401);

      const forbiddenPhotoResponse = await fetch(
        `${baseUrl}/cco-commercial/offer-photo?token=${encodeURIComponent(token)}&photoId=photo-outside-offer`
      );
      assert.equal(forbiddenPhotoResponse.status, 401);

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

test('ORD-154 §4: ny offertversion ger ny token (gammal slutar lösa upp)', async () => {
  const fixture = await createFixture();
  try {
    // Försådda ett ärende med en utfärdad token.
    await fixture.commercialStore.upsertCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'patient-register',
      customerId: 'patient-1',
      customerName: 'Anna',
      esignToken: 'tok-old-version',
      esignStatus: 'sent',
      quoteStatus: 'sent',
    });

    const entry = await fixture.journalStore.ensureConsultationPlan({
      tenantId: 'tenant-a',
      patientId: 'patient-1',
      personnummer: '19960830-4698',
      actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' },
    });
    const planEntry = await fixture.journalStore.upsertEntry(
      {
        ...entry,
        fields: { ...entry.fields, method: 'DHI', graftsTotal: '3500' },
      },
      { actor: { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' } }
    );

    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cco-commercial/offer-from-plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patientId: 'patient-1',
          entryId: planEntry.entryId,
          serviceId: '7097',
        }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.ok(payload.commercialCase.esignToken, 'ny token ska finnas');
      assert.notEqual(
        payload.commercialCase.esignToken,
        'tok-old-version',
        'ny offertversion ska rotera token — gammal länk dör'
      );
      // Den gamla token ska inte längre lösa upp caset.
      assert.equal(await fixture.commercialStore.findCaseByEsignToken('tok-old-version'), null);
      const byNew = await fixture.commercialStore.findCaseByEsignToken(
        payload.commercialCase.esignToken
      );
      assert.ok(byNew, 'nya token ska lösa upp caset');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
