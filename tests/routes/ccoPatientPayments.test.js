'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoPatientPaymentsRouter } = require('../../src/routes/ccoPatientPayments');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { getMedicalFinanceInfo } = require('../../src/ops/ccoPatientPaymentPrepare');

const TENANT = 'hair-tp-clinic';

function fakeAuthStore() {
  return {
    requireAuth(req, _res, next) {
      req.auth = { tenantId: TENANT, userId: 'u1', role: 'OWNER' };
      req.currentUser = { id: 'u1' };
      next();
    },
    async addAuditEvent(event) {
      return event;
    },
  };
}

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

test('prepare endpoints require confirmText (ORD-35 money-safety)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ord35-pay-'));
  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: path.join(tmp, 'pm.json'),
  });
  const patient = await patientMasterStore.upsertPatient({
    tenantId: TENANT,
    personnummer: '19900101-1234',
    displayName: 'Test Patient',
  });
  const authStore = fakeAuthStore();
  const app = express();
  app.use(express.json());
  app.use(
    createCcoPatientPaymentsRouter({
      patientMasterStore,
      swishStore: {
        async getConnection() {
          return { payeeAlias: '1234567890' };
        },
        async savePayment({ payment }) {
          return payment;
        },
        async saveConnection({ connection }) {
          return connection;
        },
      },
      authStore,
      config: {},
      requireAuth: authStore.requireAuth.bind(authStore),
      requireRole: () => (_req, _res, next) => next(),
    })
  );

  await withServer(app, async (base) => {
    const blocked = await fetch(`${base}/cco-patient-master/payment/prepare-invoice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patientId: patient.id, amount: 1000 }),
    });
    assert.equal(blocked.status, 400);
  });
  await fs.rm(tmp, { recursive: true, force: true });
});

test('medical finance info is external-only guidance', () => {
  const info = getMedicalFinanceInfo();
  assert.equal(info.autoExecuted, false);
  assert.equal(info.mode, 'external_financing');
});
