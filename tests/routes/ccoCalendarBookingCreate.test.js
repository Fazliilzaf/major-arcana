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
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoAuditLog } = require('../../src/security/ccoAuditLog');
const { bookingMondayWindow } = require('../helpers/bookingTestDates');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/v1`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function fixture(options = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-calendar-create-'));
  const bookingEngineStore = await createCcoBookingEngineStore({
    filePath: path.join(tempDir, 'engine.json'),
  });
  const bookingStore = await createCcoBookingStore({ filePath: path.join(tempDir, 'cases.json') });
  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: path.join(tempDir, 'patients.json'),
  });
  await patientMasterStore.upsertPatient({
    tenantId: 'tenant-a',
    id: 'patient-create-1',
    displayName: 'Canonical Patient',
    primaryEmail: 'canonical-create@example.com',
  });
  const auditLog =
    options.auditLog || createCcoAuditLog({ filePath: path.join(tempDir, 'audit.jsonl') });
  const app = express();
  if (options.productionLikeRequest === true) {
    app.use((req, _res, next) => {
      Object.defineProperty(req, 'hostname', {
        configurable: true,
        value: 'arcana.hairtpclinic.com',
      });
      Object.defineProperty(req, 'ip', {
        configurable: true,
        value: '203.0.113.10',
      });
      Object.defineProperty(req.socket, 'remoteAddress', {
        configurable: true,
        value: '203.0.113.10',
      });
      next();
    });
  }
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoBookingEngineRouter({
      bookingEngineStore,
      bookingStore,
      patientMasterStore,
      auditLog,
      authStore: options.authStore || {
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
      },
      config: { defaultTenantId: 'tenant-a' },
    })
  );
  return { app, tempDir, bookingEngineStore, auditLog };
}

function authStoreForCatalogRbac() {
  return {
    async getSessionContextByToken(token) {
      const rolesByToken = {
        'staff-read-token': 'STAFF',
        'patient-token': 'PATIENT',
        'revisor-token': 'REVISOR',
      };
      const role = rolesByToken[token];
      if (!role) return null;
      return {
        session: { id: `session-${token}` },
        membership: { tenantId: 'tenant-a', role },
        user: { id: `user-${token}` },
      };
    },
    async touchSession() {
      return true;
    },
  };
}

async function firstSlot(baseUrl) {
  const { fromDate, toDate } = bookingMondayWindow();
  const response = await fetch(
    `${baseUrl}/cco-booking-engine/availability?fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`
  );
  assert.equal(response.status, 200);
  return (await response.json()).slots[0];
}

function body(slot, extra = {}) {
  return {
    patientId: 'patient-create-1',
    serviceId: slot.serviceId,
    resourceId: slot.resourceId,
    practitionerId: slot.resourceId,
    startsAt: slot.startsAt,
    timeZone: 'Europe/Stockholm',
    confirmText: 'SKAPA BOKNING',
    ...extra,
  };
}

test('calendar create runs read-only preflight then reserve→confirm with strict audit', async () => {
  const fx = await fixture();
  try {
    await withServer(fx.app, async (baseUrl) => {
      const slot = await firstSlot(baseUrl);
      const headers = {
        'content-type': 'application/json',
        'x-idempotency-key': 'calendar-create-contract-1',
      };
      const preflightResponse = await fetch(`${baseUrl}/cco-booking-engine/create/preflight`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body(slot)),
      });
      assert.equal(preflightResponse.status, 200);
      const preflight = (await preflightResponse.json()).preflight;
      assert.equal(preflight.readOnly, true);
      assert.equal(preflight.actionAllowed, true);
      assert.equal(fx.bookingEngineStore._state.bookings.length, 0);
      assert.equal(fx.bookingEngineStore._state.reservations.length, 0);

      const confirmResponse = await fetch(`${baseUrl}/cco-booking-engine/create/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body(slot)),
      });
      assert.equal(confirmResponse.status, 200);
      const confirmed = await confirmResponse.json();
      assert.equal(confirmed.booking.canonicalPatientId, 'patient-create-1');
      assert.equal(confirmed.booking.idempotencyKey, 'calendar-create-contract-1');
      assert.equal(confirmed.idempotency.replayed, false);
      assert.equal(fx.bookingEngineStore._state.bookings.length, 1);
      assert.ok(
        fx.bookingEngineStore._state.reservations.some((item) => item.status === 'confirmed')
      );
      const actions = fx.auditLog.query({ limit: 20 }).map((item) => item.action);
      assert.ok(actions.includes('bookings.create_requested'));
      assert.ok(actions.includes('bookings.create_committed'));
    });
  } finally {
    await fs.rm(fx.tempDir, { recursive: true, force: true });
  }
});

test('calendar admin catalog requires staff and bookings.read for internal service variants', async () => {
  const local = await fixture({ authStore: authStoreForCatalogRbac() });
  try {
    await withServer(local.app, async (baseUrl) => {
      const localPreview = await fetch(`${baseUrl}/cco-booking-engine/catalog`);
      assert.equal(localPreview.status, 200);
      const payload = await localPreview.json();
      assert.equal(payload.serviceVariants.length, 82);
    });
  } finally {
    await fs.rm(local.tempDir, { recursive: true, force: true });
  }

  const fx = await fixture({
    authStore: authStoreForCatalogRbac(),
    productionLikeRequest: true,
  });
  try {
    await withServer(fx.app, async (baseUrl) => {
      const unauthenticated = await fetch(`${baseUrl}/cco-booking-engine/catalog`, {
        headers: { host: 'arcana.hairtpclinic.com' },
      });
      assert.equal(unauthenticated.status, 401);

      const patient = await fetch(`${baseUrl}/cco-booking-engine/catalog`, {
        headers: { authorization: 'Bearer patient-token', host: 'arcana.hairtpclinic.com' },
      });
      assert.equal(patient.status, 403);

      const revisor = await fetch(`${baseUrl}/cco-booking-engine/catalog`, {
        headers: { authorization: 'Bearer revisor-token', host: 'arcana.hairtpclinic.com' },
      });
      assert.equal(revisor.status, 403);

      const response = await fetch(`${baseUrl}/cco-booking-engine/catalog`, {
        headers: { authorization: 'Bearer staff-read-token', host: 'arcana.hairtpclinic.com' },
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.provider, 'cco_engine');
      assert.equal(payload.serviceVariants.length, 82);

      const variant = payload.serviceVariants.find(
        (item) => item.variantId === 'dhi-7097-dhi-hartransplantation-1000-grafts'
      );
      assert.ok(variant);
      assert.equal(variant.label, 'DHI Hårtransplantation: 1000 grafts');
      assert.equal(variant.parentServiceId, 'dhi');
      assert.equal(variant.clinicalParentServiceId, 'dhi');
      assert.equal(variant.meridiqApiId, 7097);
      assert.equal(variant.price.amountSek, 52000);
      assert.equal(variant.price.priceType, 'fast');
      assert.equal(variant.internalBookable, true);
      assert.equal(variant.publicBookable, false);
      assert.match(variant.publicBookableDecision, /^fail_closed_/);

      assert.ok(payload.services.every((service) => !service.variantId));
    });
  } finally {
    await fs.rm(fx.tempDir, { recursive: true, force: true });
  }
});

test('calendar create preflight resolves exact service variant to clinical parent and price', async () => {
  const fx = await fixture();
  try {
    await withServer(fx.app, async (baseUrl) => {
      const slot = await firstSlot(baseUrl);
      const variantId = 'consultation-physical-7078-mote-pa-kliniken';
      const response = await fetch(`${baseUrl}/cco-booking-engine/create/preflight`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'calendar-create-dhi-variant-1',
        },
        body: JSON.stringify(body(slot, { serviceId: variantId })),
      });
      assert.equal(response.status, 200);
      const preflight = (await response.json()).preflight;
      assert.equal(preflight.readOnly, true);
      assert.equal(preflight.actionAllowed, true);
      assert.equal(preflight.service.requestedServiceId, variantId);
      assert.equal(preflight.service.serviceId, 'consultation-physical');
      assert.equal(preflight.service.parentServiceId, 'consultation-physical');
      assert.equal(preflight.service.variantId, variantId);
      assert.equal(preflight.service.label, 'Möte på kliniken');
      assert.equal(preflight.service.meridiqApiId, 7078);
      assert.equal(preflight.service.price.amountSek, 0);
      assert.equal(preflight.service.priceLabel, '0 kr (paket)');
      assert.equal(preflight.service.priceType, 'konsultation');
      assert.equal(preflight.service.clinicalParentServiceId, 'consultation-physical');
      assert.equal(preflight.selectedSlot.serviceId, 'consultation-physical');
      assert.equal(preflight.selectedSlot.serviceVariantId, variantId);
      assert.equal(preflight.selectedSlot.clinicalParentServiceId, 'consultation-physical');
      assert.equal(fx.bookingEngineStore._state.bookings.length, 0);
      assert.equal(fx.bookingEngineStore._state.reservations.length, 0);
    });
  } finally {
    await fs.rm(fx.tempDir, { recursive: true, force: true });
  }
});

test('calendar create preflight rejects unmapped variant text without fuzzy matching', async () => {
  const fx = await fixture();
  try {
    await withServer(fx.app, async (baseUrl) => {
      const slot = await firstSlot(baseUrl);
      const response = await fetch(`${baseUrl}/cco-booking-engine/create/preflight`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'calendar-create-dhi-variant-bad-1',
        },
        body: JSON.stringify(body(slot, { serviceId: 'DHI Hårtransplantation 1000 grafts' })),
      });
      assert.equal(response.status, 409);
      const preflight = (await response.json()).preflight;
      assert.ok(preflight.blockers.some((gate) => gate.key === 'treatment'));
      assert.equal(fx.bookingEngineStore._state.bookings.length, 0);
      assert.equal(fx.bookingEngineStore._state.reservations.length, 0);
    });
  } finally {
    await fs.rm(fx.tempDir, { recursive: true, force: true });
  }
});

test('calendar create is idempotent and rejects key reuse with another payload', async () => {
  const fx = await fixture();
  try {
    await withServer(fx.app, async (baseUrl) => {
      const slot = await firstSlot(baseUrl);
      const headers = {
        'content-type': 'application/json',
        'x-idempotency-key': 'calendar-create-idempotent-1',
      };
      const first = await fetch(`${baseUrl}/cco-booking-engine/create/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body(slot)),
      });
      assert.equal(first.status, 200);
      const firstPayload = await first.json();
      const replay = await fetch(`${baseUrl}/cco-booking-engine/create/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body(slot)),
      });
      assert.equal(replay.status, 200);
      const replayPayload = await replay.json();
      assert.equal(replayPayload.idempotency.replayed, true);
      assert.equal(replayPayload.booking.bookingId, firstPayload.booking.bookingId);
      assert.equal(fx.bookingEngineStore._state.bookings.length, 1);

      const mismatch = await fetch(`${baseUrl}/cco-booking-engine/create/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body(slot, { encounterId: 'different-encounter' })),
      });
      assert.equal(mismatch.status, 409);
      assert.equal((await mismatch.json()).metadata.code, 'idempotency_payload_mismatch');
      assert.equal(fx.bookingEngineStore._state.bookings.length, 1);
    });
  } finally {
    await fs.rm(fx.tempDir, { recursive: true, force: true });
  }
});

test('calendar create fails closed for ambiguous identity, missing permission and conflict', async () => {
  const fx = await fixture();
  try {
    await withServer(fx.app, async (baseUrl) => {
      const slot = await firstSlot(baseUrl);
      const headers = {
        'content-type': 'application/json',
        'x-idempotency-key': 'calendar-create-blocked-1',
      };
      const ambiguous = await fetch(`${baseUrl}/cco-booking-engine/create/preflight`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body(slot, { identityAmbiguous: true })),
      });
      assert.equal(ambiguous.status, 409);
      assert.ok(
        (await ambiguous.json()).preflight.blockers.some((gate) => gate.key === 'canonical_patient')
      );
      assert.equal(fx.bookingEngineStore._state.bookings.length, 0);

      const mismatchedPractitioner = await fetch(`${baseUrl}/cco-booking-engine/create/preflight`, {
        method: 'POST',
        headers: { ...headers, 'x-idempotency-key': 'calendar-create-provider-mismatch-1' },
        body: JSON.stringify(body(slot, { practitionerId: 'fazli' })),
      });
      assert.equal(mismatchedPractitioner.status, 409);
      assert.ok(
        (await mismatchedPractitioner.json()).preflight.blockers.some(
          (gate) => gate.key === 'practitioner'
        )
      );
      assert.equal(fx.bookingEngineStore._state.bookings.length, 0);

      await fx.bookingEngineStore.reserveSlots({
        tenantId: 'tenant-a',
        conversationId: 'conflict-owner',
        customerEmail: 'other@example.com',
        selectedSlots: [slot],
      });
      const conflict = await fetch(`${baseUrl}/cco-booking-engine/create/preflight`, {
        method: 'POST',
        headers: { ...headers, 'x-idempotency-key': 'calendar-create-conflict-1' },
        body: JSON.stringify(body(slot)),
      });
      assert.equal(conflict.status, 409);
      assert.ok(
        (await conflict.json()).preflight.blockers.some((gate) => gate.key === 'availability')
      );
    });
  } finally {
    await fs.rm(fx.tempDir, { recursive: true, force: true });
  }

  const denied = await fixture({
    authStore: {
      async getSessionContextByToken() {
        return {
          session: { id: 's' },
          user: { id: 'patient-user' },
          membership: { tenantId: 'tenant-a', role: 'PATIENT' },
        };
      },
      async touchSession() {
        return true;
      },
    },
  });
  try {
    await withServer(denied.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/cco-booking-engine/create/preflight`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer denied',
          'content-type': 'application/json',
          'x-idempotency-key': 'calendar-create-denied-1',
        },
        body: JSON.stringify({ patientId: 'patient-create-1' }),
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).metadata.requiredPermission, 'bookings.write');
    });
  } finally {
    await fs.rm(denied.tempDir, { recursive: true, force: true });
  }
});

test('calendar create compensates reserve and confirm when strict audit fails', async () => {
  const events = [];
  const fx = await fixture({
    auditLog: {
      appendStrict(event) {
        events.push(event);
        if (event.action === 'bookings.create_committed') throw new Error('audit disk unavailable');
        return event;
      },
    },
  });
  try {
    await withServer(fx.app, async (baseUrl) => {
      const slot = await firstSlot(baseUrl);
      const response = await fetch(`${baseUrl}/cco-booking-engine/create/confirm`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'calendar-create-rollback-1',
        },
        body: JSON.stringify(body(slot)),
      });
      assert.equal(response.status, 500);
      assert.equal(fx.bookingEngineStore._state.bookings.length, 0);
      assert.equal(fx.bookingEngineStore._state.reservations.length, 0);
      assert.ok(events.some((event) => event.action === 'bookings.create_requested'));
      assert.ok(events.some((event) => event.action === 'bookings.create_compensated'));
    });
  } finally {
    await fs.rm(fx.tempDir, { recursive: true, force: true });
  }
});

test('create-preflight varnar när explicit valt rum redan är upptaget', async () => {
  const fx = await fixture();
  try {
    const { fromDate, toDate } = bookingMondayWindow();
    const egzonaSlots = await fx.bookingEngineStore.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(egzonaSlots.length >= 1);
    const anchor = egzonaSlots[0];

    // Ta rum 1 via en bekräftad bokning för egzona.
    await fx.bookingEngineStore.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-take-room-1',
      customerEmail: 'taken@example.com',
      customerName: 'Upptagen',
      slot: { ...anchor, roomId: '1', roomLabel: '1' },
    });

    // Preflight för en ANNAN resurs (fazli) på samma tid, med explicit rum 1.
    const fazliSlots = await fx.bookingEngineStore.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'fazli',
      srvIds: 'consultation-physical',
    });
    const sameTime = fazliSlots.find((s) => s.startsAt === anchor.startsAt) || fazliSlots[0];
    assert.ok(sameTime);

    await withServer(fx.app, async (baseUrl) => {
      const headers = {
        'content-type': 'application/json',
        'x-idempotency-key': 'calendar-create-room-warning-1',
      };
      const preflightResponse = await fetch(`${baseUrl}/cco-booking-engine/create/preflight`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body(sameTime, { roomId: '1', roomLabel: '1' })),
      });
      assert.equal(preflightResponse.status, 200);
      const preflight = (await preflightResponse.json()).preflight;
      assert.equal(preflight.actionAllowed, true, 'varningen ska inte blockera');
      assert.ok(
        Array.isArray(preflight.warnings) &&
          preflight.warnings.some((w) => String(w).includes('Rum 1')),
        `varning saknas för upptaget rum: ${JSON.stringify(preflight.warnings)}`
      );
    });
  } finally {
    await fs.rm(fx.tempDir, { recursive: true, force: true });
  }
});
