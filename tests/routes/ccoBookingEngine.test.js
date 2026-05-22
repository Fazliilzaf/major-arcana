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
  app.use(
    '/api/v1',
    createCcoBookingEngineRouter({
      bookingEngineStore,
      bookingStore,
      historyStore,
      patientSystemStore,
      treatmentAgreementStore,
      patientMasterStore,
      authStore: {
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
      },
      config: {
        defaultTenantId: options.tenantId || 'tenant-a',
      },
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
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-route&customerEmail=engine%40example.com&customerName=Engine';
      const availabilityResponse = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=2026-05-11&toDate=2026-05-11&resIds=egzona&srvIds=consultation-physical`
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

test('cco booking engine route sparar gammal och ny tid i ombokningshändelsen', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-rebook&customerEmail=rebook%40example.com&customerName=Rebook';
      const availabilityResponse = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=2026-05-11&toDate=2026-05-12&resIds=egzona&srvIds=consultation-physical`
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
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-rebook-guard&customerEmail=guard%40example.com&customerName=Guard';
      const availabilityResponse = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=2026-05-11&toDate=2026-05-12&resIds=egzona&srvIds=consultation-physical`
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
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-renew-route&customerEmail=renew-route%40example.com&customerName=Renew';
      const availabilityResponse = await fetch(
        `${baseUrl}/cco-booking-engine/availability?${qs}&fromDate=2026-05-11&toDate=2026-05-11&resIds=egzona&srvIds=consultation-physical`
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
      fromDate: '2026-05-11',
      toDate: '2026-05-12',
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
      fromDate: '2026-05-11',
      toDate: '2026-05-12',
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
      fromDate: '2026-05-11',
      toDate: '2026-05-12',
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
