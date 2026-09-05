'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoBookingEngineRouter } = require('../../src/routes/ccoBookingEngine');
const { createCcoBookingStore } = require('../../src/ops/ccoBookingStore');
const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { createCcoHistoryStore } = require('../../src/ops/ccoHistoryStore');
const { createCcoPatientSystemStore } = require('../../src/ops/ccoPatientSystemStore');
const { createCcoTreatmentAgreementStore } = require('../../src/ops/ccoTreatmentAgreementStore');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { bookingMondayWindow } = require('../helpers/bookingTestDates');

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

function authStoreFor(roleByToken) {
  return {
    async getSessionContextByToken(token) {
      const entry = roleByToken[token];
      if (!entry) return null;
      return {
        session: { id: `sess-${token}` },
        membership: { tenantId: entry.tenantId || 'tenant-a', role: entry.role },
        user: { id: `user-${token}`, email: `${token}@example.com` },
      };
    },
    async touchSession() {
      return true;
    },
  };
}

function capturingAuditLog() {
  const events = [];
  return {
    events,
    appendStrict(e) {
      events.push(e);
      return e;
    },
  };
}

async function createFixture(options = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-nb1-'));
  const bookingStore = await createCcoBookingStore({
    filePath: path.join(tempDir, 'bookings.json'),
  });
  const bookingEngineStore = await createCcoBookingEngineStore({
    filePath: path.join(tempDir, 'engine.json'),
  });
  const historyStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'history.json'),
  });
  const patientSystemStore = await createCcoPatientSystemStore({
    filePath: path.join(tempDir, 'patient-system.json'),
  });
  const treatmentAgreementStore = await createCcoTreatmentAgreementStore({
    filePath: path.join(tempDir, 'agreements.json'),
  });
  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: path.join(tempDir, 'patients.json'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoBookingEngineRouter({
      bookingEngineStore,
      bookingStore,
      historyStore,
      patientSystemStore,
      treatmentAgreementStore,
      patientMasterStore,
      journalStore: null,
      treatmentEncounterStore: null,
      aftercareStore: null,
      authStore: options.authStore || authStoreFor({}),
      config: { defaultTenantId: 'tenant-a' },
      auditLog: options.auditLog || { appendStrict: () => {} },
    })
  );
  return { app, tempDir, bookingStore, bookingEngineStore };
}

function postJson(baseUrl, relPath, { token, qs, body } = {}) {
  const query = qs ? `?${qs}` : '';
  return fetch(`${baseUrl}${relPath}${query}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
}

function reserveQ(conversationId, customerEmail) {
  return `workspaceId=major-arcana-preview&conversationId=${conversationId}&customerEmail=${encodeURIComponent(
    customerEmail
  )}&customerName=T`;
}

async function firstSlot(baseUrl, token, conversationId, customerEmail) {
  const { fromDate, toDate } = bookingMondayWindow();
  const qs = `workspaceId=major-arcana-preview&conversationId=${conversationId}&customerEmail=${encodeURIComponent(
    customerEmail
  )}&customerName=T&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`;
  const res = await fetch(`${baseUrl}/cco-booking-engine/availability?${qs}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const slots = (await res.json()).slots;
  assert.ok(slots.length >= 1, 'expected an available slot');
  return slots[0];
}

test('NB1-T1/T2: foreign conversationId (reused) does not exclude — reserve → CONFLICT', async () => {
  const audit = capturingAuditLog();
  const fixture = await createFixture({
    authStore: authStoreFor({
      'owner-a': { tenantId: 'tenant-a', role: 'OWNER' },
      'owner-b': { tenantId: 'tenant-b', role: 'OWNER' },
    }),
    auditLog: audit,
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      // Tenant B reserves slot X with conversationId conv-b.
      const slot = await firstSlot(baseUrl, 'owner-b', 'conv-b', 'b@example.com');
      const bReserve = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-b',
        qs: reserveQ('conv-b', 'b@example.com'),
        body: { selectedSlots: [slot] },
      });
      assert.equal(bReserve.status, 200);

      // Tenant A reuses B's conversationId (conv-b) + same resource/time, no override.
      const aAttack = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-a',
        qs: reserveQ('conv-b', 'a@example.com'), // reuses foreign conversationId
        body: { selectedSlots: [slot] },
      });
      assert.equal(aAttack.status, 409);
      const payload = await aAttack.json();
      assert.equal(payload.metadata?.code, 'resource_conflict');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('NB1-T3: foreign conversationId + explicit override + authorized → override contract', async () => {
  const audit = capturingAuditLog();
  const fixture = await createFixture({
    authStore: authStoreFor({
      'owner-a': { tenantId: 'tenant-a', role: 'OWNER' },
      'owner-b': { tenantId: 'tenant-b', role: 'OWNER' },
    }),
    auditLog: audit,
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const slot = await firstSlot(baseUrl, 'owner-b', 'conv-b', 'b@example.com');
      await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-b',
        qs: reserveQ('conv-b', 'b@example.com'),
        body: { selectedSlots: [slot] },
      });

      const overridden = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-a',
        qs: reserveQ('conv-b', 'a@example.com'),
        body: { selectedSlots: [slot], override: true },
      });
      assert.equal(overridden.status, 200);
      const overrideEvents = audit.events.filter((e) => e.action === 'bookings.conflict_override');
      assert.equal(overrideEvents.length, 1);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('NB1-T4: foreign conversationId + no bookings.write + override → DENY', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({
      'owner-b': { tenantId: 'tenant-b', role: 'OWNER' },
      'patient-a': { tenantId: 'tenant-a', role: 'PATIENT' },
    }),
    auditLog: capturingAuditLog(),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const slot = await firstSlot(baseUrl, 'owner-b', 'conv-b', 'b@example.com');
      await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-b',
        qs: reserveQ('conv-b', 'b@example.com'),
        body: { selectedSlots: [slot] },
      });
      const res = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'patient-a',
        qs: reserveQ('conv-b', 'a@example.com'),
        body: { selectedSlots: [slot], override: true },
      });
      assert.equal(res.status, 403);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('NB1-T5: same-tenant self-confirm still works', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({ 'owner-a': { tenantId: 'tenant-a', role: 'OWNER' } }),
    auditLog: capturingAuditLog(),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const slot = await firstSlot(baseUrl, 'owner-a', 'conv-a', 'a@example.com');
      const reserve = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-a',
        qs: reserveQ('conv-a', 'a@example.com'),
        body: { selectedSlots: [slot] },
      });
      assert.equal(reserve.status, 200);

      // Same tenant + same conversation confirms its own reservation (self-exclusion).
      const confirm = await postJson(baseUrl, '/cco-booking-engine/confirm', {
        token: 'owner-a',
        qs: reserveQ('conv-a', 'a@example.com'),
        body: { slot },
      });
      assert.equal(confirm.status, 200);
      const payload = await confirm.json();
      assert.equal(payload.booking.status, 'confirmed');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('NB1-T6: same tenant but unrelated conversationId → does not wrongly exclude', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({ 'owner-a': { tenantId: 'tenant-a', role: 'OWNER' } }),
    auditLog: capturingAuditLog(),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const slot = await firstSlot(baseUrl, 'owner-a', 'conv-a', 'a@example.com');
      await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-a',
        qs: reserveQ('conv-a', 'a@example.com'),
        body: { selectedSlots: [slot] },
      });
      // Same tenant, different conversationId → conv-a reservation must NOT be excluded.
      const res = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-a',
        qs: reserveQ('conv-a2', 'a2@example.com'),
        body: { selectedSlots: [slot] },
      });
      assert.equal(res.status, 409);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('NB1-T7/T8: conflict response has no foreign data + store unchanged', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({
      'owner-a': { tenantId: 'tenant-a', role: 'OWNER' },
      'owner-b': { tenantId: 'tenant-b', role: 'OWNER' },
    }),
    auditLog: capturingAuditLog(),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const slot = await firstSlot(baseUrl, 'owner-b', 'conv-b', 'b@example.com');
      await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-b',
        qs: reserveQ('conv-b', 'b@example.com'),
        body: { selectedSlots: [slot] },
      });
      const attack = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-a',
        qs: reserveQ('conv-b', 'a@example.com'),
        body: { selectedSlots: [slot] },
      });
      assert.equal(attack.status, 409);
      const body = await attack.text();
      assert.ok(!body.includes('tenant-b'), 'no foreign tenant');
      assert.ok(!body.includes('b@example.com'), 'no foreign customer');

      const summary = await fixture.bookingEngineStore.getCaseSummary({
        tenantId: 'tenant-a',
        conversationId: 'conv-b',
        customerEmail: 'a@example.com',
      });
      assert.equal(summary.reservations.length, 0, 'tenant-a must not have written a reservation');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
