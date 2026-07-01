const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoCommercialRouter } = require('../../src/routes/ccoCommercial');
const { createCcoCommercialStore } = require('../../src/ops/ccoCommercialStore');
const { createCcoPatientSystemStore } = require('../../src/ops/ccoPatientSystemStore');

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
  const patientSystemStore = await createCcoPatientSystemStore({
    filePath: path.join(tempDir, 'patient-system.json'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoCommercialRouter({
      commercialStore,
      offerDocumentStore: {
        async readHtml() {
          return { html: '<html><body>Offert</body></html>' };
        },
      },
      patientSystemStore,
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
  return { app, commercialStore, tempDir };
}

test('cco commercial route uppdaterar offert och betalning i samma Patient 360-kort', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-commercial-1&customerId=anna%40example.com&customerName=Anna';
      const caseResponse = await fetch(`${baseUrl}/cco-commercial/case?${qs}`);
      assert.equal(caseResponse.status, 200);
      const casePayload = await caseResponse.json();
      assert.equal(casePayload.commercialCase.commercialStatus, 'needs_review');

      const updateResponse = await fetch(`${baseUrl}/cco-commercial/case?${qs}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          offerType: 'PRP paket',
          commercialStatus: 'deposit_pending',
          quoteStatus: 'sent',
          paymentStatus: 'blocked',
          quotedAmount: '75 000 kr',
          depositAmount: '15 000 kr',
          dueDateIso: '2026-03-26T12:00:00.000Z',
          notes: 'Depositionen behöver lösas innan nästa steg kan bokas.',
          requiredActions: ['Lös deposition eller betalningsblockerare'],
        }),
      });
      assert.equal(updateResponse.status, 200);
      const updatePayload = await updateResponse.json();
      assert.equal(updatePayload.commercialCase.commercialStatus, 'deposit_pending');
      assert.equal(updatePayload.commercialReadout.phase, 'payment_blocked');
      assert.equal(updatePayload.commercialReadout.queueBucket, 'critical');
      assert.equal(updatePayload.commercialReadout.waitingOn, 'operator');
      assert.equal(
        updatePayload.commercialReadout.operatorActions[0]?.key,
        'resolve_payment_blocker'
      );
      assert.equal(updatePayload.patient360.modules.commercial.status, 'blocked');
      assert.equal(updatePayload.patient360.attention.where, 'Offert & betalning');
      assert.equal(
        updatePayload.patient360.attention.what,
        'Lös deposition eller betalningsblockerare'
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('ORD-42: personal-vy räknas inte men kundens signeringssida registrerar offer_opened', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=patient-register&customerId=patient-1&customerName=Anna';
      const createResponse = await fetch(`${baseUrl}/cco-commercial/case?${qs}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteStatus: 'sent',
          offerDocumentId: 'doc-1',
          esignToken: 'tok-1',
        }),
      });
      assert.equal(createResponse.status, 200);

      const staffView = await fetch(
        `${baseUrl}/cco-commercial/offer-document?patientId=patient-1&documentId=doc-1`
      );
      assert.equal(staffView.status, 200);

      const afterStaff = await fetch(`${baseUrl}/cco-commercial/patient-case?patientId=patient-1`);
      const afterStaffPayload = await afterStaff.json();
      assert.equal(afterStaffPayload.commercialCase.quoteOpenCount, 0);

      const staffPreview = await fetch(
        `${baseUrl}/cco-commercial/customer-offer-portal/preview?token=tok-1`
      );
      assert.equal(staffPreview.status, 200);
      const staffPreviewHtml = await staffPreview.text();
      assert.match(staffPreviewHtml, /"staffPreview":true/);

      const afterStaffPreview = await fetch(
        `${baseUrl}/cco-commercial/patient-case?patientId=patient-1`
      );
      const afterStaffPreviewPayload = await afterStaffPreview.json();
      assert.equal(afterStaffPreviewPayload.commercialCase.quoteOpenCount, 0);

      const publicView = await fetch(`${baseUrl}/cco-commercial/offer-sign-page?token=tok-1`);
      assert.equal(publicView.status, 200);

      const afterCustomer = await fetch(
        `${baseUrl}/cco-commercial/patient-case?patientId=patient-1`
      );
      const afterCustomerPayload = await afterCustomer.json();
      assert.equal(afterCustomerPayload.commercialCase.quoteOpenCount, 1);
      assert.equal(afterCustomerPayload.commercialCase.quoteOpens[0].source, 'offer_sign_page');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
