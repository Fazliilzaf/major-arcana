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
  return { app, tempDir };
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
