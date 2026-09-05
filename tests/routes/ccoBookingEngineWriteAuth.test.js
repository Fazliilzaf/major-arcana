'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
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

// Map token → { tenantId, role }. A token absent from the map returns null
// (no session → unauthenticated).
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

async function createFixture(options = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-engine-writeauth-'));
  const bookingStore = await createCcoBookingStore({ filePath: path.join(tempDir, 'bookings.json') });
  const bookingEngineStore = await createCcoBookingEngineStore({
    filePath: path.join(tempDir, 'booking-engine.json'),
  });
  const historyStore = await createCcoHistoryStore({ filePath: path.join(tempDir, 'history.json') });
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
  const authStore = options.authStore || {
    async getSessionContextByToken() {
      return null;
    },
    async touchSession() {
      return true;
    },
  };
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
      authStore,
      config: {
        defaultTenantId: options.tenantId || 'tenant-a',
        ...(options.config || {}),
      },
      auditLog: { appendStrict: () => {} },
    })
  );
  return { app, tempDir, bookingStore, bookingEngineStore };
}

function postJson(baseUrl, relPath, { token, body } = {}) {
  return fetch(`${baseUrl}${relPath}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
}

function deleteJson(baseUrl, relPath, { token } = {}) {
  return fetch(`${baseUrl}${relPath}`, {
    method: 'DELETE',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const WRITE_OPS = [
  ['reservations (create)', '/cco-booking-engine/reservations'],
  ['renew', '/cco-booking-engine/reservations/renew'],
  ['confirm', '/cco-booking-engine/confirm'],
  ['cancel', '/cco-booking-engine/cancel'],
  ['rebook', '/cco-booking-engine/rebook'],
];

// T-001: unauthenticated internal booking write → DENY.
test('T-001: unauthenticated booking write is denied', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({}),
    config: { isProduction: true }, // loopback preview får inte auto-ge OWNER
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const noToken = await postJson(baseUrl, '/cco-booking-engine/reservations', {});
      assert.equal(noToken.status, 401, 'no token must be denied');

      const invalidToken = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'bogus-token',
      });
      assert.equal(invalidToken.status, 401, 'invalid token must be denied');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// T-002: valid session without bookings.write → DENY (create).
test('T-002: valid session without bookings.write is denied on create reservation', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({ 'patient-token': { role: 'PATIENT' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'patient-token',
        body: { conversationId: 'conv-x', selectedSlots: [] },
      });
      assert.equal(res.status, 403, 'PATIENT (no bookings.write) must be denied');
      const payload = await res.json();
      assert.equal(payload.metadata?.requiredPermission, 'bookings.write');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// T-003: valid authorized staff (OWNER) → ALLOW create.
test('T-003: authorized staff with bookings.write is allowed to create reservation', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({ 'owner-token': { role: 'OWNER' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const { fromDate, toDate } = bookingMondayWindow();
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-auth-ok&customerEmail=ok%40example.com&customerName=Ok';
      const avail = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`,
        { headers: { authorization: 'Bearer owner-token' } }
      );
      assert.equal(avail.status, 200);
      const slot = (await avail.json()).slots[0];
      assert.ok(slot, 'expected an available slot');

      const res = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-token',
        body: {
          conversationId: 'conv-auth-ok',
          customerEmail: 'ok@example.com',
          selectedSlots: [slot],
        },
      });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal(payload.reservations.length, 1);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// T-004..T-007: unauthorized confirm/cancel/rebook/renew → DENY.
test('T-004..T-007: confirm, cancel, rebook, renew are denied without bookings.write', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({ 'patient-token': { role: 'PATIENT' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const cases = [
        ['confirm', '/cco-booking-engine/confirm'],
        ['cancel', '/cco-booking-engine/cancel'],
        ['rebook', '/cco-booking-engine/rebook'],
        ['renew', '/cco-booking-engine/reservations/renew'],
      ];
      for (const [name, relPath] of cases) {
        const res = await postJson(baseUrl, relPath, {
          token: 'patient-token',
          body: { conversationId: 'conv-x' },
        });
        assert.equal(res.status, 403, `${name} must deny PATIENT (no bookings.write)`);
      }
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// T-008 / T-009: guessed identifiers never grant write access.
test('T-008/T-009: guessed conversationId / reservationId do not grant write access', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({ 'patient-token': { role: 'PATIENT' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const guessedConversation = await postJson(baseUrl, '/cco-booking-engine/confirm', {
        token: 'patient-token',
        body: { conversationId: 'guessed-conversation-123', customerEmail: 'x@example.com' },
      });
      assert.equal(guessedConversation.status, 403);

      const guessedReservation = await postJson(baseUrl, '/cco-booking-engine/cancel', {
        token: 'patient-token',
        body: { conversationId: 'conv-x', reservationId: 'guessed-reservation-999' },
      });
      assert.equal(guessedReservation.status, 403);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// T-010: client-supplied tenant does not override the session tenant.
test('T-010: client-supplied tenant is ignored — booking scopes to the session tenant', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({ 'owner-a': { tenantId: 'tenant-a', role: 'OWNER' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const { fromDate, toDate } = bookingMondayWindow();
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-cross&customerEmail=cross%40example.com&customerName=Cross';
      const avail = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`,
        { headers: { authorization: 'Bearer owner-a' } }
      );
      assert.equal(avail.status, 200);
      const slot = (await avail.json()).slots[0];

      const res = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-a',
        body: {
          tenantId: 'tenant-b', // client-supplied tenant must be ignored
          conversationId: 'conv-cross',
          customerEmail: 'cross@example.com',
          selectedSlots: [slot],
        },
      });
      assert.equal(res.status, 200);

      const summaryA = await fixture.bookingEngineStore.getCaseSummary({
        tenantId: 'tenant-a',
        workspaceId: 'major-arcana-preview',
        conversationId: 'conv-cross',
        customerEmail: 'cross@example.com',
        actor: { tenantId: 'tenant-a', userId: 'user-owner-a', role: 'OWNER' },
      });
      assert.ok(
        summaryA && Array.isArray(summaryA.reservations) && summaryA.reservations.length >= 1,
        'reservation must live under the session tenant (tenant-a)'
      );

      const summaryB = await fixture.bookingEngineStore.getCaseSummary({
        tenantId: 'tenant-b',
        workspaceId: 'major-arcana-preview',
        conversationId: 'conv-cross',
        customerEmail: 'cross@example.com',
        actor: { tenantId: 'tenant-b', userId: 'user-owner-a', role: 'OWNER' },
      });
      assert.ok(
        !summaryB || !(Array.isArray(summaryB.reservations) && summaryB.reservations.length),
        'client-supplied tenant (tenant-b) must not own the reservation'
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// T-011: missing permission context → FAIL CLOSED.
test('T-011: missing actor/permission context fails closed', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({ 'norole-token': { role: '' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'norole-token',
        body: { conversationId: 'conv-x', selectedSlots: [] },
      });
      assert.equal(res.status, 403, 'missing role must fail closed');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// T-012: legitimate authorized booking workflow still works.
test('T-012: legitimate authorized booking workflow (reserve + confirm) still works', async () => {
  const fixture = await createFixture({
    authStore: authStoreFor({ 'owner-token': { role: 'OWNER' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const { fromDate, toDate } = bookingMondayWindow();
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-legit&customerEmail=legit%40example.com&customerName=Legit';
      const avail = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`,
        { headers: { authorization: 'Bearer owner-token' } }
      );
      assert.equal(avail.status, 200);
      const slot = (await avail.json()).slots[0];

      const reserve = await postJson(baseUrl, '/cco-booking-engine/reservations', {
        token: 'owner-token',
        body: {
          conversationId: 'conv-legit',
          customerEmail: 'legit@example.com',
          selectedSlots: [slot],
        },
      });
      assert.equal(reserve.status, 200);

      const confirm = await postJson(baseUrl, '/cco-booking-engine/confirm', {
        token: 'owner-token',
        body: { conversationId: 'conv-legit', customerEmail: 'legit@example.com', slot },
      });
      assert.equal(confirm.status, 200);
      const payload = await confirm.json();
      assert.equal(payload.booking.status, 'confirmed');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// T-013: static audit — all in-scope write endpoints enforce canonical booking-write.
test('T-013: static audit — every in-scope write endpoint enforces requireBookingWrite', () => {
  const srcPath = path.join(__dirname, '../../src/routes/ccoBookingEngine.js');
  const src = fsSync.readFileSync(srcPath, 'utf8');
  const writeRoutes = [
    '/cco-booking-engine/reservations',
    '/cco-booking-engine/reservations/renew',
    '/cco-booking-engine/confirm',
    '/cco-booking-engine/cancel',
    '/cco-booking-engine/rebook',
  ];
  for (const route of writeRoutes) {
    const idx = src.indexOf(`router.post('${route}'`);
    assert.ok(idx !== -1, `write route ${route} not found`);
    const end = src.indexOf('router.', idx + 10);
    const segment = src.slice(idx, end === -1 ? src.length : end);
    assert.ok(
      segment.includes('requireBookingWrite(context)'),
      `${route} does not enforce requireBookingWrite`
    );
  }
});
