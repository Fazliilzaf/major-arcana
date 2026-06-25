'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoPaymentsRouter } = require('../../src/routes/ccoPayments');
const { CONFIRM_TEXT } = require('../../src/ops/ccoPaymentEndpointContracts');

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

function createFixture() {
  const auditEvents = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = {
      tenantId: 'hair-tp-clinic',
      userId: 'staff-1',
      role: 'STAFF',
      authMode: 'test',
    };
    next();
  });
  app.use(
    '/api/v1',
    createCcoPaymentsRouter({
      swishStore: {},
      authStore: {
        async addAuditEvent(event) {
          auditEvents.push(event);
        },
      },
      config: { defaultTenantId: 'hair-tp-clinic' },
      requireAuth: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
    })
  );
  return { app, auditEvents };
}

test('payment contracts endpoint exponerar confirmText och prepare-only policy', async () => {
  const fixture = createFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-payments/contracts`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.confirmText.swish, CONFIRM_TEXT.swish);
    assert.match(payload.moneySafety, /Ingen endpoint auto-drar/);
  });
});

test('card-link kräver confirmText och returnerar draft-only utan debitering', async () => {
  const fixture = createFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const blocked = await fetch(`${baseUrl}/cco-payments/card-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patientId: 'patient-1', amount: 1000 }),
    });
    assert.equal(blocked.status, 400);

    const prepared = await fetch(`${baseUrl}/cco-payments/card-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        confirmText: CONFIRM_TEXT.card,
        patientId: 'patient-1',
        amount: 1000,
      }),
    });
    assert.equal(prepared.status, 202);
    const payload = await prepared.json();
    assert.equal(payload.provider, 'stripe');
    assert.equal(payload.status, 'draft_only');
    assert.equal(payload.paymentLink, null);
    assert.equal(payload.requiresHumanSend, true);
    assert.equal(fixture.auditEvents.at(-1).action, 'cco.payment.card_link_prepared');
  });
});

test('invoice och medical finance är prepare-only med confirm-gate', async () => {
  const fixture = createFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const invoice = await fetch(`${baseUrl}/cco-payments/invoice-draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        confirmText: CONFIRM_TEXT.invoice,
        patientId: 'patient-1',
        amount: 75000,
        fortnoxCustomerNumber: '1001',
      }),
    });
    assert.equal(invoice.status, 202);
    const invoicePayload = await invoice.json();
    assert.equal(invoicePayload.provider, 'fortnox');
    assert.equal(invoicePayload.invoiceNumber, null);
    assert.match(invoicePayload.moneySafety, /Ingen faktura bokförs/);

    const mf = await fetch(`${baseUrl}/cco-payments/medical-finance-info`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        confirmText: CONFIRM_TEXT.medicalFinance,
        patientId: 'patient-1',
        amount: '75 000 kr',
      }),
    });
    assert.equal(mf.status, 202);
    const mfPayload = await mf.json();
    assert.equal(mfPayload.provider, 'medical_finance');
    assert.equal(mfPayload.requiresHumanSend, true);
    assert.match(mfPayload.moneySafety, /Ingen finansieringsansökan/);
  });
});

test('swish endpoint vägrar innan confirmText även om Swish-store finns', async () => {
  const fixture = createFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-payments/swish/payment-request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patientId: 'patient-1', amount: 100 }),
    });
    assert.equal(res.status, 400);
    const payload = await res.json();
    assert.equal(payload.metadata.expectedConfirmText, CONFIRM_TEXT.swish);
  });
});
