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
const { bookingMondayWindow, nextBookableWeekday } = require('../helpers/bookingTestDates');

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

async function createFixture(options = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-engine-route-'));
  const bookingStore = await createCcoBookingStore({
    filePath: path.join(tempDir, 'bookings.json'),
  });
  const bookingEngineStore = await createCcoBookingEngineStore({
    filePath: path.join(tempDir, 'booking-engine.json'),
  });
  const historyStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'history.json'),
  });
  const patientSystemStore = await createCcoPatientSystemStore({
    filePath: path.join(tempDir, 'patient-system.json'),
  });
  const treatmentAgreementStore =
    options.treatmentAgreementStore ||
    (await createCcoTreatmentAgreementStore({
      filePath: path.join(tempDir, 'agreements.json'),
    }));
  const patientMasterStore =
    options.patientMasterStore ||
    (await createCcoPatientMasterStore({
      filePath: path.join(tempDir, 'patients.json'),
    }));
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
  const auditLog = options.auditLog || { appendStrict: () => {} };
  app.use(
    '/api/v1',
    createCcoBookingEngineRouter({
      bookingEngineStore,
      bookingStore,
      historyStore,
      patientSystemStore,
      treatmentAgreementStore,
      patientMasterStore,
      journalStore: options.journalStore || null,
      treatmentEncounterStore: options.treatmentEncounterStore || null,
      aftercareStore: options.aftercareStore || null,
      authStore,
      config: {
        defaultTenantId: options.tenantId || 'tenant-a',
      },
      auditLog,
    })
  );
  return {
    app,
    tempDir,
    bookingStore,
    bookingEngineStore,
    historyStore,
    treatmentAgreementStore,
    patientMasterStore,
  };
}

test('cco booking engine route reserverar, bekräftar och avbokar mot samma booking truth', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const { fromDate, toDate } = bookingMondayWindow();
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-route&customerEmail=engine%40example.com&customerName=Engine';
      const availabilityResponse = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`
      );
      assert.equal(availabilityResponse.status, 200);
      const availabilityPayload = await availabilityResponse.json();
      assert.equal(availabilityPayload.provider, 'cco_engine');
      assert.ok(availabilityPayload.slots.length >= 1);
      const slot = availabilityPayload.slots[0];

      const reserveResponse = await fetch(`${baseUrl}/cco-booking-engine/reservations?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selectedSlots: [slot] }),
      });
      assert.equal(reserveResponse.status, 200);
      const reservePayload = await reserveResponse.json();
      assert.equal(reservePayload.provider, 'cco_engine');
      assert.equal(reservePayload.reservations.length, 1);
      assert.equal(reservePayload.bookingCase.status, 'slots_ready');
      assert.equal(reservePayload.bookingCase.events.at(-1).type, 'engine_slots_reserved');
      assert.equal(reservePayload.bookingEngine.reservations.length, 1);
      assert.equal(reservePayload.bookingEngine.state, 'reserved');
      assert.equal(reservePayload.bookingEngine.recommendedAction, 'insert_studio');
      assert.equal(reservePayload.bookingEngine.blocker.action, 'insert_studio');
      assert.equal(reservePayload.bookingEngine.primarySlot.slotId, slot.slotId);
      assert.equal(typeof reservePayload.bookingEngine.expiresSoon, 'boolean');
      assert.match(reservePayload.bookingEngine.stateReason, /Reservationen|Valda tider hålls/i);

      const confirmResponse = await fetch(`${baseUrl}/cco-booking-engine/confirm?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot }),
      });
      assert.equal(confirmResponse.status, 200);
      const confirmPayload = await confirmResponse.json();
      assert.equal(confirmPayload.provider, 'cco_engine');
      assert.equal(confirmPayload.booking.status, 'confirmed');
      assert.equal(confirmPayload.bookingCase.status, 'confirmed_external');
      assert.equal(confirmPayload.bookingCase.events.at(-1).type, 'engine_booking_confirmed');
      assert.equal(confirmPayload.bookingEngine.booking.status, 'confirmed');
      assert.equal(confirmPayload.bookingEngine.state, 'confirmed');
      assert.equal(confirmPayload.bookingEngine.recommendedAction, 'set_status:closed');
      assert.equal(confirmPayload.bookingEngine.blocker.action, 'set_status:closed');
      assert.equal(
        confirmPayload.patient360.modules.booking.metadata.bookingStatus,
        'confirmed_external'
      );
      assert.equal(confirmPayload.patient360.modules.aftercare.status, 'ready');
      assert.equal(confirmPayload.patient360.attention.where, 'Eftervård');
      assert.match(confirmPayload.patient360.attention.what, /slutlogg|eftervård/i);

      const cancelResponse = await fetch(`${baseUrl}/cco-booking-engine/cancel?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Kunden bokade om' }),
      });
      assert.equal(cancelResponse.status, 200);
      const cancelPayload = await cancelResponse.json();
      assert.equal(cancelPayload.provider, 'cco_engine');
      assert.equal(cancelPayload.result.status, 'cancelled');
      assert.equal(cancelPayload.bookingCase.status, 'cancelled');
      assert.equal(cancelPayload.bookingCase.events.at(-1).type, 'engine_booking_cancelled');
      assert.equal(cancelPayload.bookingEngine.booking, null);
      assert.equal(cancelPayload.bookingEngine.reservations.length, 0);
      assert.equal(cancelPayload.bookingEngine.state, 'idle');
      assert.equal(cancelPayload.bookingEngine.recommendedAction, '');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

async function bookThenCancel(baseUrl, { conversationId, customerEmail }) {
  const { fromDate, toDate } = bookingMondayWindow();
  const qs = `workspaceId=major-arcana-preview&conversationId=${conversationId}&customerEmail=${customerEmail}&customerName=Test`;
  const availabilityResponse = await fetch(
    `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`
  );
  const availabilityPayload = await availabilityResponse.json();
  assert.ok(availabilityPayload.slots.length >= 1, 'behöver lediga tider');
  const slot = availabilityPayload.slots[0];
  await fetch(`${baseUrl}/cco-booking-engine/reservations?${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ selectedSlots: [slot] }),
  });
  await fetch(`${baseUrl}/cco-booking-engine/confirm?${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slot }),
  });
  const cancelResponse = await fetch(`${baseUrl}/cco-booking-engine/cancel?${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'Test-avbokning' }),
  });
  assert.equal(cancelResponse.status, 200);
  return cancelResponse.json();
}

// ORD-140 lämnade öppet om en avbokad behandling ska stänga uppföljningen.
// ORD-148 (2026-08-30) svarade: "uppföljningen ligger kvar. Systemet stänger
// ingenting av sig självt. Men personalen ska få en fråga." Koden följde det
// direkt — det här testet gjorde inte det, och har varit rött sedan det landade
// 2026-08-29 med ett påstående ORD-148 redan hade upphävt.
//
// Bekräftat av Fazli 2026-09-01: patienten kan boka om nästa vecka, och då
// gäller uppföljningen fortfarande. Testet uppfyller nu ORD-148 godkänt-krav 5.
//
// Fall B stänger alltså INGENTING. Det är fall A (uppföljningstiden själv
// avbokas) som stänger. Fall C (signerad behandlingsjournal) rör ingenting.
test('ORD-140 §7 · fall B: kopplingen kör, men flaggar för människa — stänger inte', async () => {
  const fixture = await createFixture({
    journalStore: {
      async getEntry() {
        return null;
      },
    },
    treatmentEncounterStore: {
      async findByBooking() {
        return {
          encounterId: 'enc-treatment',
          patientId: 'mut@example.com',
          encounterType: 'transplant_fue',
          journalEntryIds: [],
        };
      },
    },
    aftercareStore: {
      async cancelFollowUpsForEncounter() {
        return { cancelled: 3, skipped: 0, closedDrafts: 3 };
      },
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const payload = await bookThenCancel(baseUrl, {
        conversationId: 'conv-mutation-b',
        customerEmail: 'mut%40example.com',
      });
      // Kopplingen SKA ha körts — annars vet vi inte att den är inkopplad.
      // Beviset är att den fattat ett beslut, inte att den stängt något.
      assert.equal(
        payload.followUpCancellation.case,
        'B',
        'kopplingen ska ha körts och sett fall B'
      );
      assert.equal(payload.followUpCancellation.encounterId, 'enc-treatment');
      // Ägarbeslutet: flagga, stäng inte.
      assert.equal(payload.followUpCancellation.action, 'flag_for_human');
      assert.equal(payload.followUpCancellation.flagForHuman, true);
      assert.equal(payload.followUpCancellation.handled, false, 'fall B stänger ingenting');
      // reason ska säga varför, så personalen som får flaggan förstår den.
      assert.match(payload.followUpCancellation.reason, /flagga för personal/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// Testet låg tidigare på fall B med en kastande aftercare-store. Efter
// ägarbeslutet 2026-09-01 rör fall B aldrig den storen — den kunde alltså inte
// gå sönder, och testet mätte ingenting. Scenariot flyttat till fall A
// (encounterType 'follow_up'), som är det enda fall som faktiskt stänger något
// och därmed det enda som kan fallera. Poängen är oförändrad: en trasig
// koppling får inte fälla avbokningen, men den får inte heller bli tyst.
test('ORD-140 §7 · fall A: trasig koppling loggar felet — inte tyst handled:false', async () => {
  const fixture = await createFixture({
    // Fall A stänger via journalStore.closeEntry och kräver en LÄNKAD post —
    // utan journalEntryIds bailar kopplingen på "stäng aldrig ett okopplat
    // utkast" och når aldrig fram till något som kan gå sönder.
    journalStore: {
      async getEntry() {
        return { entryId: 'j-1', status: 'draft' };
      },
      async closeEntry() {
        throw new Error('journal store broken');
      },
    },
    treatmentEncounterStore: {
      async findByBooking() {
        return {
          encounterId: 'enc-followup',
          patientId: 'mut@example.com',
          encounterType: 'follow_up',
          journalEntryIds: ['j-1'],
        };
      },
    },
    aftercareStore: {
      async cancelFollowUpsForEncounter() {
        return { cancelled: 0, skipped: 0, closedDrafts: 0 };
      },
    },
  });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const payload = await bookThenCancel(baseUrl, {
        conversationId: 'conv-mutation-err',
        customerEmail: 'mut%40example.com',
      });
      assert.equal(payload.followUpCancellation.handled, false);
    });
    assert.ok(
      warnings.some((w) => /uppföljningsstängning misslyckades/.test(w)),
      'felet ska synas i loggen, inte bara i fältet followUpCancellation.error'
    );
  } finally {
    console.warn = originalWarn;
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine legacy-catalog is staff-only and supports details toggle', async () => {
  const fixture = await createFixture({
    authStore: {
      async getSessionContextByToken(token) {
        if (token === 'owner-token') {
          return {
            session: { id: 'sess-owner' },
            membership: { tenantId: 'tenant-a', role: 'OWNER' },
            user: { id: 'owner-1' },
          };
        }
        if (token === 'patient-token') {
          return {
            session: { id: 'sess-patient' },
            membership: { tenantId: 'tenant-a', role: 'PATIENT' },
            user: { id: 'patient-1' },
          };
        }
        return null;
      },
      async touchSession() {
        return true;
      },
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const forbidden = await fetch(`${baseUrl}/cco-booking-engine/legacy-catalog`, {
        headers: { authorization: 'Bearer patient-token' },
      });
      assert.equal(forbidden.status, 403);

      const ok = await fetch(`${baseUrl}/cco-booking-engine/legacy-catalog?details=1`, {
        headers: { authorization: 'Bearer owner-token' },
      });
      assert.equal(ok.status, 200);
      const payload = await ok.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.provider, 'legacy_migration_catalogs');
      assert.ok(payload.counts && typeof payload.counts.clientoServices === 'number');
      assert.ok(payload.catalogs && typeof payload.catalogs === 'object');
      assert.match(String(payload.policyNote || ''), /ARCANA_PUBLIC_WEB_BOOKING_ENABLED/);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine runtime-catalog is staff-only and merges legacy mapping', async () => {
  const fixture = await createFixture({
    authStore: {
      async getSessionContextByToken(token) {
        if (token === 'owner-token') {
          return {
            session: { id: 'sess-owner' },
            membership: { tenantId: 'tenant-a', role: 'OWNER' },
            user: { id: 'owner-1' },
          };
        }
        if (token === 'patient-token') {
          return {
            session: { id: 'sess-patient' },
            membership: { tenantId: 'tenant-a', role: 'PATIENT' },
            user: { id: 'patient-1' },
          };
        }
        return null;
      },
      async touchSession() {
        return true;
      },
    },
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const forbidden = await fetch(`${baseUrl}/cco-booking-engine/runtime-catalog`, {
        headers: { authorization: 'Bearer patient-token' },
      });
      assert.equal(forbidden.status, 403);

      const ok = await fetch(`${baseUrl}/cco-booking-engine/runtime-catalog`, {
        headers: { authorization: 'Bearer owner-token' },
      });
      assert.equal(ok.status, 200);
      const payload = await ok.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.provider, 'cco_engine_runtime_catalog');
      assert.equal(payload.policy.publicWebBookingEnabled, false);
      assert.ok(Array.isArray(payload.services));
      assert.ok(payload.summary.totalServices >= 1);
      assert.ok(
        payload.services.some((item) => item.legacyMapping && item.legacyMapping.cliento) ||
          payload.summary.legacyMappedServices >= 1
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine route sparar gammal och ny tid i ombokningshändelsen', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const fromDate = nextBookableWeekday(1);
      const toDate = nextBookableWeekday(2, { minDaysAhead: 3 });
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-rebook&customerEmail=rebook%40example.com&customerName=Rebook';
      const availabilityResponse = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`
      );
      assert.equal(availabilityResponse.status, 200);
      const availabilityPayload = await availabilityResponse.json();
      assert.ok(availabilityPayload.slots.length >= 2);
      const firstSlot = availabilityPayload.slots[0];
      const secondSlot = availabilityPayload.slots[1];

      const confirmResponse = await fetch(`${baseUrl}/cco-booking-engine/confirm?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot: firstSlot }),
      });
      assert.equal(confirmResponse.status, 200);

      const rebookResponse = await fetch(`${baseUrl}/cco-booking-engine/rebook?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot: secondSlot, reason: 'Kunden vill byta tid' }),
      });
      assert.equal(rebookResponse.status, 200);
      const rebookPayload = await rebookResponse.json();
      assert.equal(rebookPayload.provider, 'cco_engine');
      assert.equal(rebookPayload.booking.slot.slotId, secondSlot.slotId);
      assert.equal(rebookPayload.booking.previousSlot.slotId, firstSlot.slotId);
      assert.equal(rebookPayload.bookingCase.events.at(-1).type, 'engine_booking_rebooked');
      assert.equal(
        rebookPayload.bookingCase.events.at(-1).metadata.previousSlot.slotId,
        firstSlot.slotId
      );
      assert.equal(
        rebookPayload.bookingCase.events.at(-1).metadata.nextSlot.slotId,
        secondSlot.slotId
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine route kräver rebook när annan tid redan är bekräftad', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const fromDate = nextBookableWeekday(1);
      const toDate = nextBookableWeekday(2, { minDaysAhead: 3 });
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-rebook-guard&customerEmail=guard%40example.com&customerName=Guard';
      const availabilityResponse = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`
      );
      assert.equal(availabilityResponse.status, 200);
      const availabilityPayload = await availabilityResponse.json();
      assert.ok(availabilityPayload.slots.length >= 2);
      const firstSlot = availabilityPayload.slots[0];
      const secondSlot = availabilityPayload.slots[1];

      const firstConfirm = await fetch(`${baseUrl}/cco-booking-engine/confirm?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot: firstSlot }),
      });
      assert.equal(firstConfirm.status, 200);

      const secondConfirm = await fetch(`${baseUrl}/cco-booking-engine/confirm?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot: secondSlot }),
      });
      assert.equal(secondConfirm.status, 409);
      const secondPayload = await secondConfirm.json();
      assert.equal(secondPayload.metadata.code, 'booking_rebook_required');
      assert.equal(secondPayload.metadata.confirmedSlotId, firstSlot.slotId);
      assert.equal(secondPayload.metadata.selectedSlotId, secondSlot.slotId);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine route kan förnya reservationer', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const { fromDate, toDate } = bookingMondayWindow();
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-renew-route&customerEmail=renew-route%40example.com&customerName=Renew';
      const availabilityResponse = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`
      );
      assert.equal(availabilityResponse.status, 200);
      const availabilityPayload = await availabilityResponse.json();
      const slot = availabilityPayload.slots[0];

      const reserveResponse = await fetch(`${baseUrl}/cco-booking-engine/reservations?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selectedSlots: [slot] }),
      });
      assert.equal(reserveResponse.status, 200);

      const renewResponse = await fetch(`${baseUrl}/cco-booking-engine/reservations/renew?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ extensionMinutes: 180 }),
      });
      assert.equal(renewResponse.status, 200);
      const renewPayload = await renewResponse.json();
      assert.equal(renewPayload.provider, 'cco_engine');
      assert.equal(renewPayload.reservations.length, 1);
      assert.equal(renewPayload.bookingCase.events.at(-1).type, 'engine_reservations_renewed');
      assert.equal(renewPayload.bookingEngine.state, 'reserved');
      assert.equal(renewPayload.bookingEngine.recommendedAction, 'insert_studio');
      assert.equal(renewPayload.bookingEngine.blocker.action, 'insert_studio');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine case-summary prioriterar uppdaterad Svarstudio efter ombokning som gjort tidigare förslag gammalt', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-summary-stale-offer',
      customerEmail: 'stale-offer@example.com',
      customerName: 'Stale Offer',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    const availability = await fixture.bookingEngineStore.listAvailability({
      tenantId: context.tenantId,
      fromDate: nextBookableWeekday(1),
      toDate: nextBookableWeekday(2, { minDaysAhead: 3 }),
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    const slot = availability[0];
    await fixture.bookingEngineStore.reserveSlots({
      ...context,
      selectedSlots: [slot],
    });
    await fixture.bookingStore.setCandidateSlots({
      ...context,
      selectedSlots: [slot],
    });
    await fixture.bookingStore.updateStatus({
      ...context,
      status: 'offered',
      statusSource: 'cco_engine',
    });
    await fixture.bookingStore.updateStatus({
      ...context,
      status: 'waiting_customer',
      statusSource: 'cco_engine',
    });
    await fixture.bookingStore.addEvent({
      ...context,
      type: 'engine_booking_rebooked',
      label: 'Bokning ombokad i CCO',
      detail: 'Tidigare bokning ersattes med en ny bekräftad tid i CCO:s bokningsmotor.',
      createdAt: new Date(Date.now() + 1000).toISOString(),
      metadata: {
        previousSlot: { slotId: 'old-slot' },
        nextSlot: slot,
      },
    });

    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-summary-stale-offer&customerEmail=stale-offer%40example.com&customerName=Stale%20Offer';
      const response = await fetch(`${baseUrl}/cco-booking-engine/case-summary?${qs}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.provider, 'cco_engine');
      assert.equal(payload.blocker.action, 'insert_studio');
      assert.equal(payload.recommendedAction, 'insert_studio');
      assert.equal(payload.blocker.nextActionLabel, 'uppdatera Svarstudio');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine case-summary visar när uppföljning redan pågår i waiting_customer', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-summary-followup-active',
      customerEmail: 'followup-active@example.com',
      customerName: 'Followup Active',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    const availability = await fixture.bookingEngineStore.listAvailability({
      tenantId: context.tenantId,
      fromDate: nextBookableWeekday(1),
      toDate: nextBookableWeekday(2, { minDaysAhead: 3 }),
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    const slot = availability[0];
    await fixture.bookingEngineStore.reserveSlots({
      ...context,
      selectedSlots: [slot],
    });
    await fixture.bookingStore.setCandidateSlots({
      ...context,
      selectedSlots: [slot],
    });
    await fixture.bookingStore.updateStatus({
      ...context,
      status: 'offered',
      statusSource: 'cco_engine',
    });
    await fixture.bookingStore.updateStatus({
      ...context,
      status: 'waiting_customer',
      statusSource: 'cco_engine',
    });
    await fixture.bookingStore.addEvent({
      ...context,
      type: 'follow_up_opened',
      label: 'Uppföljning öppnad',
      detail: 'Operatören öppnade uppföljningsspåret.',
      createdAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      metadata: {
        bookingFollowUpReason: 'Kund väntar på nytt svar',
      },
    });

    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-summary-followup-active&customerEmail=followup-active%40example.com&customerName=Followup%20Active';
      const response = await fetch(`${baseUrl}/cco-booking-engine/case-summary?${qs}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.blocker.label, 'Uppföljning pågår');
      assert.equal(payload.blocker.action, 'confirm_external');
      assert.equal(payload.blocker.nextActionLabel, 'invänta kundsvar');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine case-summary visar kundsvar inkommet före gammal follow-up', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-summary-customer-reply',
      customerEmail: 'engine-customer-reply@example.com',
      customerName: 'Engine Customer Reply',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    const availability = await fixture.bookingEngineStore.listAvailability({
      tenantId: context.tenantId,
      fromDate: nextBookableWeekday(1),
      toDate: nextBookableWeekday(2, { minDaysAhead: 3 }),
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    const slot = availability[0];
    await fixture.bookingEngineStore.reserveSlots({
      ...context,
      selectedSlots: [slot],
    });
    await fixture.bookingStore.setCandidateSlots({
      ...context,
      selectedSlots: [slot],
    });
    await fixture.bookingStore.updateStatus({
      ...context,
      status: 'offered',
      statusSource: 'cco_engine',
    });
    await fixture.bookingStore.updateStatus({
      ...context,
      status: 'waiting_customer',
      statusSource: 'cco_engine',
    });
    await fixture.bookingStore.addEvent({
      ...context,
      type: 'follow_up_opened',
      label: 'Uppföljning öppnad',
      detail: 'Operatören öppnade uppföljning.',
      createdAt: new Date(Date.now() - 26 * 36e5).toISOString(),
    });
    await fixture.bookingStore.addEvent({
      ...context,
      type: 'customer_replied',
      label: 'Kunden svarade',
      detail: 'Kunden återkom i samma tråd.',
      createdAt: new Date(Date.now() - 1 * 36e5).toISOString(),
    });

    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-summary-customer-reply&customerEmail=engine-customer-reply%40example.com&customerName=Engine%20Customer%20Reply';
      const response = await fetch(`${baseUrl}/cco-booking-engine/case-summary?${qs}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.blocker.label, 'Kundsvar inkommet');
      assert.equal(payload.blocker.action, 'insert_studio');
      assert.equal(payload.blocker.nextActionLabel, 'uppdatera Svarstudio');
      assert.equal(payload.waitingCustomer.mode, 'customer_reply');
      assert.equal(payload.waitingCustomer.action, 'insert_studio');
      assert.equal(payload.waitingCustomer.urgencyLevel, 'normal');
      assert.match(String(payload.waitingCustomer.urgencyReason || ''), /svarat nyligen/i);
      assert.equal(payload.recommendedActionState, 'act_now');
      assert.match(String(payload.recommendedActionReason || ''), /uppdaterat operatörssvar/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine case-summary kan läsa kundsvar från historik även utan booking-event', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-history-customer-reply',
      customerEmail: 'engine-history-reply@example.com',
      customerName: 'Engine History Customer Reply',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      selectedSlots: [{ id: 'slot-engine-history-reply', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
        {
          type: 'follow_up_opened',
          label: 'Uppföljning öppnad',
          detail: 'Operatören öppnade uppföljning.',
          createdAt: new Date(Date.now() - 26 * 36e5).toISOString(),
        },
      ],
    });
    await fixture.historyStore.recordAction({
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: context.customerEmail,
      actionType: 'customer_replied',
      actionLabel: 'Kunden svarade',
      recordedAt: new Date(Date.now() - 1 * 36e5).toISOString(),
      source: 'test',
      waitingOn: 'owner',
      nextActionLabel: 'Återuppta tråden',
      nextActionSummary: 'Kunden har svarat och tråden bör öppnas igen.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-history-customer-reply&customerEmail=engine-history-reply%40example.com&customerName=Engine%20History%20Customer%20Reply';
      const response = await fetch(`${baseUrl}/cco-booking-engine/case-summary?${qs}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.blocker.label, 'Kundsvar inkommet');
      assert.equal(payload.blocker.action, 'insert_studio');
      assert.equal(payload.blocker.nextActionLabel, 'uppdatera Svarstudio');
      assert.equal(payload.waitingCustomer.mode, 'customer_reply');
      assert.equal(payload.waitingCustomer.action, 'insert_studio');
      assert.equal(payload.waitingCustomer.urgencyLevel, 'normal');
      assert.match(String(payload.waitingCustomer.urgencyReason || ''), /svarat nyligen/i);
      assert.equal(payload.recommendedActionState, 'act_now');
      assert.match(String(payload.recommendedActionReason || ''), /uppdaterat operatörssvar/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine case-summary markerar äldre kundsvar från historik som bearbetningskrävande', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-history-customer-reply-stale',
      customerEmail: 'engine-history-reply-stale@example.com',
      customerName: 'Engine History Customer Reply Stale',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 60 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      selectedSlots: [
        { id: 'slot-engine-history-reply-stale', startsAt: '2026-05-12T10:00:00.000Z' },
      ],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: new Date(Date.now() - 60 * 36e5).toISOString(),
        },
      ],
    });
    await fixture.historyStore.recordAction({
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: context.customerEmail,
      actionType: 'customer_replied',
      actionLabel: 'Kunden svarade',
      recordedAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      source: 'test',
      waitingOn: 'owner',
      nextActionLabel: 'Återuppta tråden',
      nextActionSummary: 'Kunden har svarat och tråden bör öppnas igen.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-history-customer-reply-stale&customerEmail=engine-history-reply-stale%40example.com&customerName=Engine%20History%20Customer%20Reply%20Stale';
      const response = await fetch(`${baseUrl}/cco-booking-engine/case-summary?${qs}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.blocker.label, 'Bearbeta kundsvar');
      assert.equal(payload.blocker.action, 'insert_studio');
      assert.equal(payload.blocker.nextActionLabel, 'öppna Svarstudio');
      assert.equal(payload.waitingCustomer.mode, 'customer_reply');
      assert.equal(payload.waitingCustomer.customerReplyStale, true);
      assert.equal(payload.waitingCustomer.urgencyLevel, 'high');
      assert.match(String(payload.waitingCustomer.urgencyReason || ''), /utan bearbetning/i);
      assert.equal(payload.recommendedActionState, 'act_now_overdue');
      assert.match(String(payload.recommendedActionReason || ''), /Svarstudio/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine case-summary återöppnar confirmed_external när kunden svarar efter bekräftelsen', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-confirmed-history-reply',
      customerEmail: 'engine-confirmed-history-reply@example.com',
      customerName: 'Engine Confirmed History Reply',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'confirmed_external',
      confirmedExternalAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      selectedSlots: [
        { id: 'slot-engine-confirmed-history-reply', startsAt: '2026-05-12T10:00:00.000Z' },
      ],
      events: [
        {
          type: 'engine_booking_confirmed',
          label: 'Bokningen bekräftades i CCO',
          detail: 'Tiden låstes i CCO.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
      ],
    });
    await fixture.historyStore.recordAction({
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: context.customerEmail,
      actionType: 'customer_replied',
      actionLabel: 'Kunden svarade',
      recordedAt: new Date(Date.now() - 1 * 36e5).toISOString(),
      source: 'test',
      waitingOn: 'owner',
      nextActionLabel: 'Återuppta tråden',
      nextActionSummary: 'Kunden har svarat efter bekräftelsen och tråden bör öppnas igen.',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-confirmed-history-reply&customerEmail=engine-confirmed-history-reply%40example.com&customerName=Engine%20Confirmed%20History%20Reply';
      const response = await fetch(`${baseUrl}/cco-booking-engine/case-summary?${qs}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.blocker.label, 'Kundsvar efter bekräftelse');
      assert.equal(payload.blocker.action, 'insert_studio');
      assert.equal(payload.blocker.nextActionLabel, 'uppdatera Svarstudio');
      assert.equal(payload.recommendedActionState, 'act_now');
      assert.match(String(payload.recommendedActionReason || ''), /efter bekräftelsen/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine case-summary håller confirmed_external levande när uppföljning efter bekräftelsen förfaller', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-confirmed-followup-due',
      customerEmail: 'engine-confirmed-followup-due@example.com',
      customerName: 'Engine Confirmed Followup Due',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'confirmed_external',
      confirmedExternalAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      selectedSlots: [
        { id: 'slot-engine-confirmed-followup-due', startsAt: '2026-05-12T10:00:00.000Z' },
      ],
      events: [
        {
          type: 'engine_booking_confirmed',
          label: 'Bokningen bekräftades i CCO',
          detail: 'Tiden låstes i CCO.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
      ],
    });
    await fixture.historyStore.recordAction({
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: context.customerEmail,
      actionType: 'reply_later',
      actionLabel: 'Svara senare',
      recordedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      source: 'test',
      waitingOn: 'customer',
      nextActionLabel: 'Invänta kundens svar',
      nextActionSummary: 'Återuppta tråden om kunden inte svarar efter bekräftelsen.',
      followUpDueAt: new Date(Date.now() - 1 * 36e5).toISOString(),
    });

    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-confirmed-followup-due&customerEmail=engine-confirmed-followup-due%40example.com&customerName=Engine%20Confirmed%20Followup%20Due';
      const response = await fetch(`${baseUrl}/cco-booking-engine/case-summary?${qs}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.blocker.label, 'Följ upp efter bekräftelse');
      assert.equal(payload.blocker.action, 'schedule_followup');
      assert.equal(payload.blocker.nextActionLabel, 'påminn kunden igen');
      assert.equal(payload.postConfirmation.mode, 'post_confirmation_follow_up_due');
      assert.equal(payload.postConfirmation.urgencyLevel, 'high');
      assert.equal(payload.recommendedActionState, 'reengage_now');
      assert.match(String(payload.recommendedActionReason || ''), /efter bekräftelsen/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine case-summary kan läsa reply_later från historik som aktiv uppföljning', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-history-followup-active',
      customerEmail: 'engine-history-followup@example.com',
      customerName: 'Engine History Followup',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      selectedSlots: [{ id: 'slot-engine-history-followup', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
      ],
    });
    await fixture.historyStore.recordAction({
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: context.customerEmail,
      actionType: 'reply_later',
      actionLabel: 'Svara senare',
      recordedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      source: 'test',
      waitingOn: 'customer',
      nextActionLabel: 'Invänta kundens svar',
      nextActionSummary: 'Vänta och återuppta tråden senare.',
      followUpDueAt: new Date(Date.now() + 6 * 36e5).toISOString(),
    });

    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-history-followup-active&customerEmail=engine-history-followup%40example.com&customerName=Engine%20History%20Followup';
      const response = await fetch(`${baseUrl}/cco-booking-engine/case-summary?${qs}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.blocker.label, 'Uppföljning pågår');
      assert.equal(payload.blocker.action, 'confirm_external');
      assert.equal(payload.blocker.nextActionLabel, 'invänta kundsvar');
      assert.equal(payload.waitingCustomer.mode, 'follow_up_active');
      assert.equal(payload.waitingCustomer.urgencyLevel, 'normal');
      assert.match(String(payload.waitingCustomer.urgencyReason || ''), /väntas återkomma/i);
      assert.match(String(payload.waitingCustomer.latestFollowUpDueAt || ''), /T/);
      assert.equal(payload.recommendedActionState, 'monitor');
      assert.match(String(payload.recommendedActionReason || ''), /bevakas/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco booking engine route spärrar behandlingsbokning utan signerat avtal', async () => {
  const fixture = await createFixture({ tenantId: 'tenant-a' });
  try {
    await fixture.patientMasterStore.upsertPatient({
      tenantId: 'tenant-a',
      id: 'patient-gate',
      displayName: 'Gate Test',
      personnummer: '19920202-1234',
      primaryEmail: 'gate@example.com',
      emails: ['gate@example.com'],
    });

    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-gate-block&customerEmail=gate%40example.com&customerName=Gate';
      const slot = {
        slotId: 'egzona::fue::2026-05-11T06:00:00.000Z',
        resourceId: 'egzona',
        serviceId: 'fue',
        startsAt: '2026-05-11T06:00:00.000Z',
        endsAt: '2026-05-11T14:00:00.000Z',
      };

      const blockedResponse = await fetch(`${baseUrl}/cco-booking-engine/reservations?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selectedSlots: [slot] }),
      });
      assert.equal(blockedResponse.status, 409);
      const blockedPayload = await blockedResponse.json();
      assert.equal(blockedPayload.metadata.code, 'treatment_agreement_not_bookable');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('create/preflight behåller conversationId från body', async () => {
  const fixture = await createFixture();
  try {
    await fixture.patientMasterStore.upsertPatient({
      tenantId: 'tenant-a',
      id: 'patient-create-preflight',
      displayName: 'Preflight Patient',
      primaryEmail: 'preflight@example.com',
    });
    await withServer(fixture.app, async (baseUrl) => {
      const { fromDate, toDate } = bookingMondayWindow();
      const availabilityResponse = await fetch(
        `${baseUrl}/cco-booking-engine/availability?workspaceId=major-arcana-preview&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`
      );
      assert.equal(availabilityResponse.status, 200);
      const availabilityPayload = await availabilityResponse.json();
      const slot = availabilityPayload.slots[0];

      const preflightResponse = await fetch(`${baseUrl}/cco-booking-engine/create/preflight`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'preflight-key-conv-001',
        },
        body: JSON.stringify({
          patientId: 'patient-create-preflight',
          serviceId: 'consultation-physical',
          resourceId: 'egzona',
          practitionerId: 'egzona',
          startsAt: slot.startsAt,
          timeZone: 'Europe/Stockholm',
          conversationId: 'conversation-keep-me',
        }),
      });
      assert.equal(preflightResponse.status, 200);
      const payload = await preflightResponse.json();
      assert.equal(payload.preflight.operationContext.conversationId, 'conversation-keep-me');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('create/preflight genererar syntetiskt conversationId när inget anges', async () => {
  const fixture = await createFixture();
  try {
    await fixture.patientMasterStore.upsertPatient({
      tenantId: 'tenant-a',
      id: 'patient-create-preflight-synth',
      displayName: 'Preflight Synth Patient',
      primaryEmail: 'preflight-synth@example.com',
    });
    await withServer(fixture.app, async (baseUrl) => {
      const { fromDate, toDate } = bookingMondayWindow();
      const availabilityResponse = await fetch(
        `${baseUrl}/cco-booking-engine/availability?workspaceId=major-arcana-preview&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`
      );
      assert.equal(availabilityResponse.status, 200);
      const availabilityPayload = await availabilityResponse.json();
      const slot = availabilityPayload.slots[0];

      const preflightResponse = await fetch(`${baseUrl}/cco-booking-engine/create/preflight`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'preflight-key-synth-001',
        },
        body: JSON.stringify({
          patientId: 'patient-create-preflight-synth',
          serviceId: 'consultation-physical',
          resourceId: 'egzona',
          practitionerId: 'egzona',
          startsAt: slot.startsAt,
          timeZone: 'Europe/Stockholm',
        }),
      });
      assert.equal(preflightResponse.status, 200);
      const payload = await preflightResponse.json();
      assert.match(
        payload.preflight.operationContext.conversationId,
        /^calendar-create:patient-create-preflight-synth:/
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('create/confirm resulterar i bokning med conversationKey', async () => {
  const fixture = await createFixture();
  try {
    await fixture.patientMasterStore.upsertPatient({
      tenantId: 'tenant-a',
      id: 'patient-create-confirm',
      displayName: 'Confirm Patient',
      primaryEmail: 'confirm@example.com',
    });
    await withServer(fixture.app, async (baseUrl) => {
      const { fromDate, toDate } = bookingMondayWindow();
      const availabilityResponse = await fetch(
        `${baseUrl}/cco-booking-engine/availability?workspaceId=major-arcana-preview&fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`
      );
      assert.equal(availabilityResponse.status, 200);
      const availabilityPayload = await availabilityResponse.json();
      const slot = availabilityPayload.slots[0];
      const idempotencyKey = 'confirm-key-conv-001';

      const preflightResponse = await fetch(`${baseUrl}/cco-booking-engine/create/preflight`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          patientId: 'patient-create-confirm',
          serviceId: 'consultation-physical',
          resourceId: 'egzona',
          practitionerId: 'egzona',
          startsAt: slot.startsAt,
          timeZone: 'Europe/Stockholm',
          conversationId: 'conversation-confirm-key',
        }),
      });
      assert.equal(preflightResponse.status, 200);

      const confirmResponse = await fetch(`${baseUrl}/cco-booking-engine/create/confirm`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          patientId: 'patient-create-confirm',
          serviceId: 'consultation-physical',
          resourceId: 'egzona',
          practitionerId: 'egzona',
          startsAt: slot.startsAt,
          timeZone: 'Europe/Stockholm',
          conversationId: 'conversation-confirm-key',
          confirmText: 'SKAPA BOKNING',
        }),
      });
      assert.equal(confirmResponse.status, 200);
      const payload = await confirmResponse.json();
      assert.equal(payload.booking.conversationKey, 'conversation-confirm-key');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
