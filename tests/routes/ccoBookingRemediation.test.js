'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoBookingsRouter } = require('../../src/routes/ccoBookings');
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
    appendStrict(event) {
      events.push(event);
      return event;
    },
  };
}

function baseConfig() {
  return {
    defaultTenantId: 'tenant-a',
    brand: 'hair-tp-clinic',
    brandByHost: {},
    clientoPartnerId: '1650',
    clientoApiBaseUrl: 'https://cliento.example/api/v2/partner/cliento',
  };
}

async function createLegacyFixture(options = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-rem-legacy-'));
  const bookingStore = await createCcoBookingStore({ filePath: path.join(tempDir, 'bookings.json') });
  const bookingEngineStore = await createCcoBookingEngineStore({
    filePath: path.join(tempDir, 'engine.json'),
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
  app.use(
    '/api/v1',
    createCcoBookingsRouter({
      bookingStore,
      bookingEngineStore,
      historyStore,
      patientSystemStore,
      treatmentAgreementStore,
      patientMasterStore,
      authStore: options.authStore || authStoreFor({}),
      config: baseConfig(),
      auditLog: options.auditLog || null,
    })
  );
  // Mount the engine router too, so /cco-booking-engine/availability is available
  // for the legacy /cco-bookings/candidates reserve test.
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

async function createEngineFixture(options = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-rem-engine-'));
  const bookingStore = await createCcoBookingStore({ filePath: path.join(tempDir, 'bookings.json') });
  const bookingEngineStore = await createCcoBookingEngineStore({
    filePath: path.join(tempDir, 'engine.json'),
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
      config: { defaultTenantId: 'tenant-a', ...(options.config || {}) },
      auditLog: options.auditLog || { appendStrict: () => {} },
    })
  );
  return { app, tempDir, bookingStore, bookingEngineStore };
}

function postJson(baseUrl, relPath, { token, body, qs } = {}) {
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

function putJson(baseUrl, relPath, { token, body } = {}) {
  return fetch(`${baseUrl}${relPath}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
}

const LEGACY_QS =
  'workspaceId=major-arcana-preview&conversationId=conv-legacy&customerEmail=legacy%40example.com&customerName=Legacy';

// ───────────────────────────── B-1 ─────────────────────────────

test('T-R1: PATIENT → /cco-bookings/candidates → DENY', async () => {
  const fixture = await createLegacyFixture({
    authStore: authStoreFor({ 'patient-token': { role: 'PATIENT' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await postJson(baseUrl, '/cco-bookings/candidates', {
        token: 'patient-token',
        qs: LEGACY_QS,
        body: { selectedSlots: [] },
      });
      assert.equal(res.status, 403);
      const payload = await res.json();
      assert.equal(payload.metadata?.requiredPermission, 'bookings.write');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R2/T-R4: actor without bookings.write → reserve DENY + store unchanged', async () => {
  const fixture = await createLegacyFixture({
    authStore: authStoreFor({ 'patient-token': { role: 'PATIENT' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await postJson(baseUrl, '/cco-bookings/candidates', {
        token: 'patient-token',
        qs: LEGACY_QS,
        body: { selectedSlots: [] },
      });
      assert.equal(res.status, 403);
      const summary = await fixture.bookingEngineStore.getCaseSummary({
        tenantId: 'tenant-a',
        conversationId: 'conv-legacy',
        customerEmail: 'legacy@example.com',
      });
      assert.equal(summary.reservations.length, 0);
      assert.equal(summary.booking, null);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R3: authorized actor (OWNER) → candidates reserve → ALLOW', async () => {
  const fixture = await createLegacyFixture({
    authStore: authStoreFor({ 'owner-token': { role: 'OWNER' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const { fromDate, toDate } = bookingMondayWindow();
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-legacy-ok&customerEmail=ok%40example.com&customerName=Ok';
      const avail = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`,
        { headers: { authorization: 'Bearer owner-token' } }
      );
      assert.equal(avail.status, 200);
      const slot = (await avail.json()).slots[0];
      assert.ok(slot, 'expected an available slot');

      const res = await postJson(baseUrl, '/cco-bookings/candidates', {
        token: 'owner-token',
        qs,
        body: { selectedSlots: [slot] },
      });
      assert.equal(res.status, 200);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// ───────────────────────────── B-2 ─────────────────────────────

test('T-R5/T-R6: status mutation — unauthorized DENY, authorized ALLOW', async () => {
  const fixture = await createLegacyFixture({
    authStore: authStoreFor({
      'patient-token': { role: 'PATIENT' },
      'owner-token': { role: 'OWNER' },
    }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const denied = await postJson(baseUrl, '/cco-bookings/status', {
        token: 'patient-token',
        qs: LEGACY_QS,
        body: { status: 'confirmed_external' },
      });
      assert.equal(denied.status, 403);

      const allowed = await postJson(baseUrl, '/cco-bookings/status', {
        token: 'owner-token',
        qs: LEGACY_QS,
        body: { status: 'confirmed_external' },
      });
      assert.equal(allowed.status, 200);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R7/T-R8: case upsert — unauthorized DENY, authorized ALLOW', async () => {
  const fixture = await createLegacyFixture({
    authStore: authStoreFor({
      'patient-token': { role: 'PATIENT' },
      'owner-token': { role: 'OWNER' },
    }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const denied = await putJson(baseUrl, '/cco-bookings/case', {
        token: 'patient-token',
        body: {},
      });
      assert.equal(denied.status, 403);

      const allowed = await putJson(baseUrl, '/cco-bookings/case', {
        token: 'owner-token',
        body: {},
      });
      // 200 om context räcker; 403 är det som ska skilja. OWNER får INTE 403.
      assert.notEqual(allowed.status, 403);
      assert.notEqual(allowed.status, 401);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R9/T-R10: event mutation — unauthorized DENY, authorized ALLOW', async () => {
  const fixture = await createLegacyFixture({
    authStore: authStoreFor({
      'patient-token': { role: 'PATIENT' },
      'owner-token': { role: 'OWNER' },
    }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const denied = await postJson(baseUrl, '/cco-bookings/event', {
        token: 'patient-token',
        qs: LEGACY_QS,
        body: { label: 'x', detail: 'y' },
      });
      assert.equal(denied.status, 403);

      const allowed = await postJson(baseUrl, '/cco-bookings/event', {
        token: 'owner-token',
        qs: LEGACY_QS,
        body: { label: 'x', detail: 'y' },
      });
      assert.equal(allowed.status, 200);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R11/T-R12: offer-draft — unauthorized DENY, authorized ALLOW', async () => {
  const fixture = await createLegacyFixture({
    authStore: authStoreFor({
      'patient-token': { role: 'PATIENT' },
      'owner-token': { role: 'OWNER' },
    }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const denied = await postJson(baseUrl, '/cco-bookings/offer-draft', {
        token: 'patient-token',
        qs: LEGACY_QS,
      });
      assert.equal(denied.status, 403);

      const allowed = await postJson(baseUrl, '/cco-bookings/offer-draft', {
        token: 'owner-token',
        qs: LEGACY_QS,
      });
      assert.equal(allowed.status, 200);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R13: denied legacy mutations leave the store unchanged', async () => {
  const fixture = await createLegacyFixture({
    authStore: authStoreFor({ 'patient-token': { role: 'PATIENT' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      await postJson(baseUrl, '/cco-bookings/status', {
        token: 'patient-token',
        qs: LEGACY_QS,
        body: { status: 'confirmed_external' },
      });
      await putJson(baseUrl, '/cco-bookings/case', { token: 'patient-token', body: {} });
      await postJson(baseUrl, '/cco-bookings/event', {
        token: 'patient-token',
        qs: LEGACY_QS,
        body: { label: 'x', detail: 'y' },
      });
      const summary = await fixture.bookingEngineStore.getCaseSummary({
        tenantId: 'tenant-a',
        conversationId: 'conv-legacy',
        customerEmail: 'legacy@example.com',
      });
      assert.equal(summary.reservations.length, 0);
      assert.equal(summary.booking, null);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R14: client-supplied tenant does not grant authorization', async () => {
  const fixture = await createLegacyFixture({
    authStore: authStoreFor({ 'patient-token': { role: 'PATIENT' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await postJson(baseUrl, '/cco-bookings/candidates', {
        token: 'patient-token',
        qs: LEGACY_QS,
        body: { tenantId: 'tenant-b', selectedSlots: [] },
      });
      assert.equal(res.status, 403);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R15: guessed/foreign identifiers do not grant authorization', async () => {
  const fixture = await createLegacyFixture({
    authStore: authStoreFor({ 'patient-token': { role: 'PATIENT' } }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await postJson(baseUrl, '/cco-bookings/status', {
        token: 'patient-token',
        qs: 'workspaceId=major-arcana-preview&conversationId=guessed-conv-999&customerEmail=foreign%40example.com&customerName=X',
        body: { status: 'confirmed_external', reservationId: 'guessed-res-123' },
      });
      assert.equal(res.status, 403);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// ───────────────────────────── B-3 ─────────────────────────────

async function reserveForTenant(baseUrl, token, conversationId, customerEmail, slot, bodyExtra = {}) {
  const qs = `workspaceId=major-arcana-preview&conversationId=${conversationId}&customerEmail=${encodeURIComponent(
    customerEmail
  )}&customerName=T`;
  return postJson(baseUrl, '/cco-booking-engine/reservations', {
    token,
    qs,
    body: { selectedSlots: [slot], ...bodyExtra },
  });
}

async function firstAvailableSlot(baseUrl, token, conversationId, customerEmail) {
  const { fromDate, toDate } = bookingMondayWindow();
  const qs = `workspaceId=major-arcana-preview&conversationId=${conversationId}&customerEmail=${encodeURIComponent(
    customerEmail
  )}&customerName=T&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`;
  const res = await fetch(`${baseUrl}/cco-booking-engine/availability?${qs}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.ok(payload.slots.length >= 1, 'expected an available slot');
  return payload.slots[0];
}

test('T-R16: cross-tenant conflict on shared resource/time → CONFLICT WARNING', async () => {
  const audit = capturingAuditLog();
  const fixture = await createEngineFixture({
    authStore: authStoreFor({
      'owner-a': { tenantId: 'tenant-a', role: 'OWNER' },
      'owner-b': { tenantId: 'tenant-b', role: 'OWNER' },
    }),
    auditLog: audit,
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const slot = await firstAvailableSlot(baseUrl, 'owner-a', 'conv-a', 'a@example.com');
      const first = await reserveForTenant(baseUrl, 'owner-a', 'conv-a', 'a@example.com', slot);
      assert.equal(first.status, 200);

      const second = await reserveForTenant(baseUrl, 'owner-b', 'conv-b', 'b@example.com', slot);
      assert.equal(second.status, 409);
      const payload = await second.json();
      assert.equal(payload.metadata?.code, 'resource_conflict');
      assert.equal(payload.metadata?.overrideRequired, true);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R17/T-R23: conflict response and audit expose no foreign tenant/customer data', async () => {
  const audit = capturingAuditLog();
  const fixture = await createEngineFixture({
    authStore: authStoreFor({
      'owner-a': { tenantId: 'tenant-a', role: 'OWNER' },
      'owner-b': { tenantId: 'tenant-b', role: 'OWNER' },
    }),
    auditLog: audit,
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const slot = await firstAvailableSlot(baseUrl, 'owner-a', 'conv-a', 'a@example.com');
      await reserveForTenant(baseUrl, 'owner-a', 'conv-a', 'a@example.com', slot);
      const second = await reserveForTenant(baseUrl, 'owner-b', 'conv-b', 'b@example.com', slot);
      assert.equal(second.status, 409);
      const body = await second.text();
      assert.ok(!body.includes('tenant-a'), 'must not leak tenant-a');
      assert.ok(!body.includes('conv-a'), 'must not leak conv-a');
      assert.ok(!body.includes('a@example.com'), 'must not leak customer email');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R18: actor without bookings.write cannot override', async () => {
  const fixture = await createEngineFixture({
    authStore: authStoreFor({
      'owner-a': { tenantId: 'tenant-a', role: 'OWNER' },
      'patient-b': { tenantId: 'tenant-b', role: 'PATIENT' },
    }),
    auditLog: capturingAuditLog(),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const slot = await firstAvailableSlot(baseUrl, 'owner-a', 'conv-a', 'a@example.com');
      await reserveForTenant(baseUrl, 'owner-a', 'conv-a', 'a@example.com', slot);
      // PATIENT with override=true is still denied at the permission gate (403).
      const res = await reserveForTenant(baseUrl, 'patient-b', 'conv-b', 'b@example.com', slot, {
        override: true,
      });
      assert.equal(res.status, 403);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R19/T-R20/T-R21: explicit override succeeds and produces audit; no flag → unresolved', async () => {
  const audit = capturingAuditLog();
  const fixture = await createEngineFixture({
    authStore: authStoreFor({
      'owner-a': { tenantId: 'tenant-a', role: 'OWNER' },
      'owner-b': { tenantId: 'tenant-b', role: 'OWNER' },
    }),
    auditLog: audit,
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const slot = await firstAvailableSlot(baseUrl, 'owner-a', 'conv-a', 'a@example.com');
      await reserveForTenant(baseUrl, 'owner-a', 'conv-a', 'a@example.com', slot);

      // no override flag → still conflict (no silent write)
      const noFlag = await reserveForTenant(baseUrl, 'owner-b', 'conv-b', 'b@example.com', slot);
      assert.equal(noFlag.status, 409);

      // explicit override → succeeds
      const overridden = await reserveForTenant(baseUrl, 'owner-b', 'conv-b', 'b@example.com', slot, {
        override: true,
      });
      assert.equal(overridden.status, 200);

      const overrideEvents = audit.events.filter((e) => e.action === 'bookings.conflict_override');
      assert.equal(overrideEvents.length, 1, 'expected one conflict_override audit record');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R22: override audit contains actor/tenant/resource/time/decision', async () => {
  const audit = capturingAuditLog();
  const fixture = await createEngineFixture({
    authStore: authStoreFor({
      'owner-a': { tenantId: 'tenant-a', role: 'OWNER' },
      'owner-b': { tenantId: 'tenant-b', role: 'OWNER' },
    }),
    auditLog: audit,
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const slot = await firstAvailableSlot(baseUrl, 'owner-a', 'conv-a', 'a@example.com');
      await reserveForTenant(baseUrl, 'owner-a', 'conv-a', 'a@example.com', slot);
      await reserveForTenant(baseUrl, 'owner-b', 'conv-b', 'b@example.com', slot, {
        override: true,
      });

      const event = audit.events.find((e) => e.action === 'bookings.conflict_override');
      assert.ok(event, 'override audit event exists');
      assert.equal(event.actor.userId, 'user-owner-b');
      assert.equal(event.target.tenantId, 'tenant-b');
      assert.equal(event.target.id, slot.resourceId);
      assert.ok(event.detail.slotId);
      assert.ok(event.detail.startsAt);
      assert.equal(event.detail.override, true);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R24: different resource/time → unaffected', async () => {
  const fixture = await createEngineFixture({
    authStore: authStoreFor({
      'owner-a': { tenantId: 'tenant-a', role: 'OWNER' },
      'owner-b': { tenantId: 'tenant-b', role: 'OWNER' },
    }),
    auditLog: capturingAuditLog(),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const { fromDate, toDate } = bookingMondayWindow();
      const qs = `workspaceId=major-arcana-preview&conversationId=conv-a&customerEmail=${encodeURIComponent(
        'a@example.com'
      )}&customerName=T&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`;
      const avail = await fetch(`${baseUrl}/cco-booking-engine/availability?${qs}`, {
        headers: { authorization: 'Bearer owner-a' },
      });
      assert.equal(avail.status, 200);
      const slots = (await avail.json()).slots;
      assert.ok(slots.length >= 2, 'expected at least two slots (different times)');

      await reserveForTenant(baseUrl, 'owner-a', 'conv-a', 'a@example.com', slots[0]);
      // A different (non-overlapping) time on the same resource is not a conflict.
      const res = await reserveForTenant(baseUrl, 'owner-b', 'conv-b', 'b@example.com', slots[1]);
      assert.equal(res.status, 200);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('T-R25: normal same-tenant legitimate flow → unaffected', async () => {
  const fixture = await createEngineFixture({
    authStore: authStoreFor({ 'owner-a': { tenantId: 'tenant-a', role: 'OWNER' } }),
    auditLog: capturingAuditLog(),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const slot = await firstAvailableSlot(baseUrl, 'owner-a', 'conv-a', 'a@example.com');
      const res = await reserveForTenant(baseUrl, 'owner-a', 'conv-a', 'a@example.com', slot);
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal(payload.reservations.length, 1);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
