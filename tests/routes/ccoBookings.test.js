const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoBookingsRouter } = require('../../src/routes/ccoBookings');
const { createCcoBookingStore } = require('../../src/ops/ccoBookingStore');
const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { createCcoHistoryStore } = require('../../src/ops/ccoHistoryStore');
const { createCcoPatientSystemStore } = require('../../src/ops/ccoPatientSystemStore');
const { bookingMondayWindow, nextBookableWeekday } = require('../helpers/bookingTestDates');

async function withClientoIntegrationEnabled(run) {
  const previous = process.env.ARCANA_CLIENTO_INTEGRATION_ENABLED;
  process.env.ARCANA_CLIENTO_INTEGRATION_ENABLED = 'true';
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.ARCANA_CLIENTO_INTEGRATION_ENABLED;
    else process.env.ARCANA_CLIENTO_INTEGRATION_ENABLED = previous;
  }
}

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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-bookings-route-'));
  const bookingStore = await createCcoBookingStore({
    filePath: path.join(tempDir, 'bookings.json'),
  });
  const historyStore = await createCcoHistoryStore({
    filePath: path.join(tempDir, 'history.json'),
  });
  const patientSystemStore = await createCcoPatientSystemStore({
    filePath: path.join(tempDir, 'patient-system.json'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoBookingsRouter({
      bookingStore,
      historyStore,
      patientSystemStore,
      authStore: {
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
      },
      config: {
        defaultTenantId: 'tenant-a',
        brand: 'hair-tp-clinic',
        brandByHost: {},
        clientoPartnerId: '1650',
        clientoApiBaseUrl: 'https://cliento.com/api/v2/partner/cliento',
      },
    })
  );
  return { app, tempDir, bookingStore, historyStore };
}

async function createEngineFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-bookings-engine-route-'));
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
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoBookingsRouter({
      bookingStore,
      bookingEngineStore,
      historyStore,
      patientSystemStore,
      authStore: {
        async getSessionContextByToken() {
          return null;
        },
        async touchSession() {
          return true;
        },
      },
      config: {
        defaultTenantId: 'tenant-a',
        brand: 'hair-tp-clinic',
        brandByHost: {},
        clientoPartnerId: '1650',
        clientoApiBaseUrl: 'https://cliento.com/api/v2/partner/cliento',
      },
    })
  );
  return { app, tempDir, bookingStore, bookingEngineStore, historyStore };
}

test('cco bookings route sparar kandidater och genererar offer-draft utan direktbokning', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-booking-1&customerEmail=anna%40example.com&customerName=Anna';
      const caseResponse = await fetch(`${baseUrl}/cco-bookings/case?${qs}`);
      assert.equal(caseResponse.status, 200);
      const casePayload = await caseResponse.json();
      assert.equal(casePayload.bookingCase.status, 'needs_triage');
      assert.equal(casePayload.patient360.attention.where, 'Bokning');

      const candidatesResponse = await fetch(`${baseUrl}/cco-bookings/candidates?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selectedSlots: [
            { id: 'slot-1', startsAt: '2026-05-08T09:30:00.000Z', resourceLabel: 'Dr. Eriksson' },
            { id: 'slot-2', startsAt: '2026-05-08T13:30:00.000Z', resourceLabel: 'Dr. Sara' },
          ],
        }),
      });
      assert.equal(candidatesResponse.status, 200);
      const candidatesPayload = await candidatesResponse.json();
      assert.equal(candidatesPayload.bookingCase.status, 'slots_ready');
      assert.equal(candidatesPayload.bookingCase.selectedSlots.length, 2);
      assert.equal(candidatesPayload.bookingCase.events.at(-1).type, 'candidate_slots_selected');
      assert.equal(candidatesPayload.patient360.modules.booking.status, 'needs_validation');

      const offerResponse = await fetch(`${baseUrl}/cco-bookings/offer-draft?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(offerResponse.status, 200);
      const offerPayload = await offerResponse.json();
      assert.equal(offerPayload.bookingCase.status, 'offered');
      assert.equal(offerPayload.bookingCase.events.at(-1).type, 'offer_draft_inserted');
      assert.equal(offerPayload.patient360.modules.booking.status, 'waiting_customer');
      assert.match(offerPayload.draft, /Här är tiderna jag kan erbjuda/);
      assert.match(offerPayload.draft, /Dr\. Eriksson/);
      assert.match(offerPayload.draft, /fre 8 maj kl\. \d{2}:\d{2}/);
      assert.doesNotMatch(offerPayload.draft, /2026-05-08T09:30:00\.000Z/);
      assert.doesNotMatch(offerPayload.draft, /cliento\.com/i);
      assert.doesNotMatch(offerPayload.draft, /boka själv/i);

      const eventResponse = await fetch(`${baseUrl}/cco-bookings/event?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'follow_up_opened',
          label: 'Uppföljning öppnad',
          detail: 'Operatören öppnade schemaläggning.',
          metadata: {
            bookingFollowUpReason: 'Kundväntan över 24h',
            bookingFollowUpSource: 'booking_surface',
          },
        }),
      });
      assert.equal(eventResponse.status, 200);
      const eventPayload = await eventResponse.json();
      assert.equal(eventPayload.bookingCase.events.at(-1).type, 'follow_up_opened');
      assert.equal(
        eventPayload.bookingCase.events.at(-1).metadata.bookingFollowUpReason,
        'Kundväntan över 24h'
      );

      const handoffResponse = await fetch(`${baseUrl}/cco-bookings/event?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'handoff_copied',
          label: 'Överlämning kopierad',
          detail: 'Status: Erbjudet · 2 valda tider · Text kopierad för intern överlämning.',
        }),
      });
      assert.equal(handoffResponse.status, 200);
      const handoffPayload = await handoffResponse.json();
      assert.equal(handoffPayload.bookingCase.events.at(-1).type, 'handoff_copied');
      assert.match(handoffPayload.bookingCase.events.at(-1).detail, /intern överlämning/);

      const statusResponse = await fetch(`${baseUrl}/cco-bookings/status?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'waiting_customer' }),
      });
      assert.equal(statusResponse.status, 200);
      const statusPayload = await statusResponse.json();
      assert.equal(statusPayload.bookingCase.status, 'waiting_customer');
      assert.equal(statusPayload.bookingCase.events.at(-1).type, 'status_changed');
      assert.equal(statusPayload.bookingCase.events.at(-1).previousStatus, 'offered');
      assert.equal(statusPayload.bookingCase.events.at(-1).nextStatus, 'waiting_customer');
      assert.equal(statusPayload.patient360.attention.what, 'Invänta kundsvar på föreslagna tider');

      const listResponse = await fetch(`${baseUrl}/cco-bookings/cases?status=waiting_customer`);
      assert.equal(listResponse.status, 200);
      const listPayload = await listResponse.json();
      assert.equal(listPayload.cases.length, 1);
      assert.equal(listPayload.cases[0].status, 'waiting_customer');
      assert.equal(listPayload.cases[0].customerEmail, 'anna@example.com');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route hämtar och normaliserar Cliento-slots utan booking-write', async () => {
  const fixture = await createFixture();
  const originalFetch = global.fetch;
  let capturedUrl = '';
  await withClientoIntegrationEnabled(async () => {
    try {
      global.fetch = async (url, options) => {
        capturedUrl = String(url);
        if (!capturedUrl.includes('cliento.com')) {
          return originalFetch(url, options);
        }
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              resources: [
                {
                  id: 'res-1',
                  name: 'Dr. Eriksson',
                  slots: [
                    {
                      id: 'slot-1',
                      start: '2026-05-08T09:30:00.000Z',
                      end: '2026-05-08T10:30:00.000Z',
                      serviceId: 'srv-1',
                      serviceName: 'Konsultation',
                    },
                  ],
                },
              ],
            }),
        };
      };
      await withServer(fixture.app, async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/cco-bookings/slots?provider=external&fromDate=2026-05-08&toDate=2026-05-22&resIds=res-1&srvIds=srv-1`
        );
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.slots.length, 1);
        assert.equal(payload.slots[0].slotId, 'slot-1');
        assert.equal(payload.slots[0].resourceLabel, 'Dr. Eriksson');
        assert.equal(payload.slots[0].serviceLabel, 'Konsultation');
        assert.match(capturedUrl, /resources\/slots/);
        assert.match(capturedUrl, /resIds=res-1/);
        assert.match(capturedUrl, /srvIds=srv-1/);
      });
    } finally {
      global.fetch = originalFetch;
      await fs.rm(fixture.tempDir, { recursive: true, force: true });
    }
  });
});

test('cco bookings route hämtar normaliserad Cliento ref-data', async () => {
  const fixture = await createFixture();
  const originalFetch = global.fetch;
  await withClientoIntegrationEnabled(async () => {
    try {
      global.fetch = async (url, options) => {
        const capturedUrl = String(url);
        if (!capturedUrl.includes('cliento.com')) {
          return originalFetch(url, options);
        }
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              resources: [{ id: 'res-1', name: 'Dr. Eriksson' }],
              services: [{ id: 'srv-1', title: 'Konsultation' }],
            }),
        };
      };
      await withServer(fixture.app, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/cco-bookings/ref-data?provider=external`);
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.deepEqual(
          payload.resources.map((item) => item.id),
          ['res-1']
        );
        assert.deepEqual(
          payload.services.map((item) => item.id),
          ['srv-1']
        );
        assert.equal(payload.resources[0].label, 'Dr. Eriksson');
        assert.equal(payload.services[0].label, 'Konsultation');
      });
    } finally {
      global.fetch = originalFetch;
      await fs.rm(fixture.tempDir, { recursive: true, force: true });
    }
  });
});

test('cco bookings route uppdaterar handoff-statusar', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-booking-status&customerEmail=status%40example.com&customerName=Status';
      const waitingResponse = await fetch(`${baseUrl}/cco-bookings/status?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'waiting_customer' }),
      });
      assert.equal(waitingResponse.status, 200);
      const waitingPayload = await waitingResponse.json();
      assert.equal(waitingPayload.bookingCase.status, 'waiting_customer');

      const confirmedResponse = await fetch(`${baseUrl}/cco-bookings/status?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed_external' }),
      });
      assert.equal(confirmedResponse.status, 200);
      const confirmedPayload = await confirmedResponse.json();
      assert.equal(confirmedPayload.bookingCase.status, 'confirmed_external');
      assert.ok(confirmedPayload.bookingCase.confirmedExternalAt);
      assert.equal(confirmedPayload.bookingCase.events.at(-1).type, 'external_confirmation_marked');
      assert.match(
        confirmedPayload.bookingCase.events.at(-1).detail,
        /Ingen direkt kalenderskrivning/
      );
      assert.doesNotMatch(confirmedPayload.bookingCase.events.at(-1).detail, /Cliento/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route sorterar ärendelistan med mest blockerade först', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const createCase = async (conversationId, customerEmail, body = {}) => {
        const qs = `workspaceId=major-arcana-preview&conversationId=${encodeURIComponent(conversationId)}&customerEmail=${encodeURIComponent(customerEmail)}`;
        const response = await fetch(`${baseUrl}/cco-bookings/case?${qs}`);
        assert.equal(response.status, 200);
        if (body.selectedSlots) {
          const slotsResponse = await fetch(`${baseUrl}/cco-bookings/candidates?${qs}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ selectedSlots: body.selectedSlots }),
          });
          assert.equal(slotsResponse.status, 200);
        }
        if (body.status) {
          const statusResponse = await fetch(`${baseUrl}/cco-bookings/status?${qs}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: body.status }),
          });
          assert.equal(statusResponse.status, 200);
        }
      };

      await createCase('conv-offered-route', 'offered-route@example.com', {
        selectedSlots: [{ id: 'slot-offered-route', startsAt: '2026-05-10T10:00:00.000Z' }],
        status: 'offered',
      });
      await createCase('conv-slots-route', 'slots-route@example.com', {
        selectedSlots: [{ id: 'slot-ready-route', startsAt: '2026-05-09T10:00:00.000Z' }],
      });
      await createCase('conv-empty-route', 'empty-route@example.com');
      await fixture.bookingStore.upsertCase({
        tenantId: 'tenant-a',
        workspaceId: 'major-arcana-preview',
        conversationId: 'conv-stale-reply-route',
        customerEmail: 'stale-reply-route@example.com',
        status: 'waiting_customer',
        offeredAt: new Date(Date.now() - 60 * 36e5).toISOString(),
        updatedAt: new Date().toISOString(),
        selectedSlots: [{ id: 'slot-stale-reply-route', startsAt: '2026-05-12T10:00:00.000Z' }],
        events: [
          {
            type: 'offer_draft_inserted',
            label: 'Erbjudande infogat',
            detail: 'Förslag skickat till kund.',
            createdAt: new Date(Date.now() - 60 * 36e5).toISOString(),
          },
          {
            type: 'customer_reply_received',
            label: 'Kundsvar mottaget',
            detail: 'Kunden svarade i samma tråd.',
            createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
          },
        ],
      });
      await fixture.bookingStore.upsertCase({
        tenantId: 'tenant-a',
        workspaceId: 'major-arcana-preview',
        conversationId: 'conv-followup-due-route',
        customerEmail: 'followup-due-route@example.com',
        status: 'waiting_customer',
        offeredAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        updatedAt: new Date().toISOString(),
        selectedSlots: [{ id: 'slot-followup-due-route', startsAt: '2026-05-12T11:00:00.000Z' }],
        events: [
          {
            type: 'offer_draft_inserted',
            label: 'Erbjudande infogat',
            detail: 'Förslag skickat till kund.',
            createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
          },
          {
            type: 'follow_up_scheduled',
            label: 'Uppföljning schemalagd',
            detail: 'Återuppta tråden senare.',
            createdAt: new Date(Date.now() - 2 * 36e5).toISOString(),
            metadata: {
              followUpDueAt: new Date(Date.now() - 1 * 36e5).toISOString(),
            },
          },
        ],
      });

      const listResponse = await fetch(`${baseUrl}/cco-bookings/cases?sort=blocked&limit=5`);
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.deepEqual(
        payload.cases.map((bookingCase) => bookingCase.conversationId),
        [
          'conv-empty-route',
          'conv-stale-reply-route',
          'conv-followup-due-route',
          'conv-slots-route',
          'conv-offered-route',
        ]
      );
      assert.deepEqual(
        payload.cases.map((bookingCase) => bookingCase.blocker),
        [
          {
            key: 'candidate_slots',
            label: 'Saknar tider',
            score: 30,
            action: 'candidate_slots',
            nextActionLabel: 'välj kandidat-tider',
            tone: 'attention',
          },
          {
            key: 'customer_state',
            label: 'Bearbeta kundsvar',
            score: 23,
            action: 'insert_studio',
            nextActionLabel: 'öppna Svarstudio',
            tone: 'attention',
          },
          {
            key: 'customer_state',
            label: 'Följ upp igen',
            score: 22,
            action: 'schedule_followup',
            nextActionLabel: 'påminn kunden',
            tone: 'attention',
          },
          {
            key: 'insert_studio',
            label: 'Saknar Svarstudio',
            score: 20,
            action: 'insert_studio',
            nextActionLabel: 'infoga i Svarstudio',
            tone: 'attention',
          },
          {
            key: 'customer_state',
            label: 'Saknar kundläge',
            score: 10,
            action: 'waiting_customer',
            nextActionLabel: 'markera kundläge',
            tone: 'stable',
          },
        ]
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route bryter blocker-likaläge med arbetsläge före updatedAt', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      await fixture.bookingStore.upsertCase({
        tenantId: 'tenant-a',
        workspaceId: 'major-arcana-preview',
        conversationId: 'conv-followup-due-route-tie',
        customerEmail: 'followup-due-route-tie@example.com',
        status: 'waiting_customer',
        offeredAt: new Date(Date.now() - 60 * 36e5).toISOString(),
        updatedAt: new Date().toISOString(),
        selectedSlots: [
          { id: 'slot-followup-due-route-tie', startsAt: '2026-05-12T10:00:00.000Z' },
        ],
        events: [
          {
            type: 'offer_draft_inserted',
            label: 'Erbjudande infogat',
            detail: 'Förslag skickat till kund.',
            createdAt: new Date(Date.now() - 60 * 36e5).toISOString(),
          },
          {
            type: 'follow_up_scheduled',
            label: 'Uppföljning schemalagd',
            detail: 'Återuppta tråden senare.',
            createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
            metadata: {
              followUpDueAt: new Date(Date.now() - 25 * 36e5).toISOString(),
            },
          },
        ],
      });
      await fixture.bookingStore.upsertCase({
        tenantId: 'tenant-a',
        workspaceId: 'major-arcana-preview',
        conversationId: 'conv-customer-reply-route-tie',
        customerEmail: 'customer-reply-route-tie@example.com',
        status: 'waiting_customer',
        offeredAt: new Date(Date.now() - 60 * 36e5).toISOString(),
        updatedAt: new Date(Date.now() - 5 * 36e5).toISOString(),
        selectedSlots: [
          { id: 'slot-customer-reply-route-tie', startsAt: '2026-05-12T11:00:00.000Z' },
        ],
        events: [
          {
            type: 'offer_draft_inserted',
            label: 'Erbjudande infogat',
            detail: 'Förslag skickat till kund.',
            createdAt: new Date(Date.now() - 60 * 36e5).toISOString(),
          },
          {
            type: 'customer_reply_received',
            label: 'Kundsvar mottaget',
            detail: 'Kunden svarade i samma tråd.',
            createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
          },
        ],
      });

      const listResponse = await fetch(`${baseUrl}/cco-bookings/cases?sort=blocked&limit=2`);
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.deepEqual(
        payload.cases.map((bookingCase) => bookingCase.conversationId),
        ['conv-customer-reply-route-tie', 'conv-followup-due-route-tie']
      );
      assert.deepEqual(
        payload.cases.map((bookingCase) => bookingCase.recommendedActionState),
        ['act_now_overdue', 'reengage_now']
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route låter case-listan följa engine-blocker när tider är reserverade men ännu inte erbjudna', async () => {
  const fixture = await createEngineFixture();
  try {
    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await fixture.bookingEngineStore.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    const slot = availability[0];
    assert.ok(slot);

    await withServer(fixture.app, async (baseUrl) => {
      const qs =
        'workspaceId=major-arcana-preview&conversationId=conv-engine-backed-list&customerEmail=engine-list%40example.com&customerName=Engine%20List';
      const candidatesResponse = await fetch(`${baseUrl}/cco-bookings/candidates?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selectedSlots: [slot],
        }),
      });
      assert.equal(candidatesResponse.status, 200);

      const listResponse = await fetch(`${baseUrl}/cco-bookings/cases?status=slots_ready`);
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.equal(payload.cases.length, 1);
      assert.equal(payload.cases[0].blocker.action, 'insert_studio');
      assert.equal(payload.cases[0].recommendedAction, 'insert_studio');
      assert.equal(payload.cases[0].recommendedActionState, 'act_now');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route visar när uppföljning redan pågår i waiting_customer-listan', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-route-followup-active',
      customerEmail: 'route-followup@example.com',
      customerName: 'Route Followup',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'waiting_customer',
      offeredAt: '2026-05-09T09:00:00.000Z',
      updatedAt: '2026-05-10T09:00:00.000Z',
      selectedSlots: [{ id: 'slot-route-followup', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: '2026-05-09T09:00:00.000Z',
        },
        {
          type: 'follow_up_opened',
          label: 'Uppföljning öppnad',
          detail: 'Operatören öppnade uppföljningsspåret.',
          createdAt: new Date(Date.now() - 2 * 36e5).toISOString(),
          metadata: {
            bookingFollowUpReason: 'Kund väntar på nytt svar',
          },
        },
      ],
    });

    await withServer(fixture.app, async (baseUrl) => {
      const listResponse = await fetch(
        `${baseUrl}/cco-bookings/cases?customerEmail=${encodeURIComponent(context.customerEmail)}`
      );
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.equal(payload.cases.length, 1);
      assert.equal(payload.cases[0].blocker.label, 'Uppföljning pågår');
      assert.equal(payload.cases[0].blocker.action, 'confirm_external');
      assert.equal(payload.cases[0].blocker.nextActionLabel, 'invänta kundsvar');
      assert.equal(payload.cases[0].recommendedActionState, 'monitor');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route låter inte intern handoff dölja att waiting_customer behöver följas upp', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-route-wait-anchor',
      customerEmail: 'route-wait-anchor@example.com',
      customerName: 'Route Wait Anchor',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date().toISOString(),
      selectedSlots: [{ id: 'slot-route-anchor', startsAt: '2026-05-12T10:00:00.000Z' }],
      events: [
        {
          type: 'offer_draft_inserted',
          label: 'Erbjudande infogat',
          detail: 'Förslag skickat till kund.',
          createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
        },
        {
          type: 'handoff_copied',
          label: 'Överlämning kopierad',
          detail: 'Intern överlämning kopierades.',
          createdAt: new Date(Date.now() - 1 * 36e5).toISOString(),
        },
      ],
    });

    await withServer(fixture.app, async (baseUrl) => {
      const listResponse = await fetch(
        `${baseUrl}/cco-bookings/cases?customerEmail=${encodeURIComponent(context.customerEmail)}`
      );
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.equal(payload.cases.length, 1);
      assert.equal(payload.cases[0].blocker.label, 'Saknar uppföljning');
      assert.equal(payload.cases[0].blocker.action, 'schedule_followup');
      assert.equal(payload.cases[0].blocker.nextActionLabel, 'schemalägg uppföljning');
      assert.equal(payload.cases[0].recommendedActionState, 'reengage_now');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route visar kundsvar inkommet före gammal follow-up i waiting_customer-listan', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-route-customer-reply',
      customerEmail: 'route-customer-reply@example.com',
      customerName: 'Route Customer Reply',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date().toISOString(),
      selectedSlots: [{ id: 'slot-route-reply', startsAt: '2026-05-12T10:00:00.000Z' }],
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
        {
          type: 'customer_reply_received',
          label: 'Kundsvar mottaget',
          detail: 'Kunden svarade i samma tråd.',
          createdAt: new Date(Date.now() - 1 * 36e5).toISOString(),
        },
      ],
    });

    await withServer(fixture.app, async (baseUrl) => {
      const listResponse = await fetch(
        `${baseUrl}/cco-bookings/cases?customerEmail=${encodeURIComponent(context.customerEmail)}`
      );
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.equal(payload.cases.length, 1);
      assert.equal(payload.cases[0].blocker.label, 'Kundsvar inkommet');
      assert.equal(payload.cases[0].blocker.action, 'insert_studio');
      assert.equal(payload.cases[0].blocker.nextActionLabel, 'uppdatera Svarstudio');
      assert.equal(payload.cases[0].waitingCustomer.mode, 'customer_reply');
      assert.equal(payload.cases[0].waitingCustomer.action, 'insert_studio');
      assert.equal(payload.cases[0].waitingCustomer.urgencyLevel, 'normal');
      assert.match(String(payload.cases[0].waitingCustomer.urgencyReason || ''), /svarat nyligen/i);
      assert.equal(payload.cases[0].recommendedActionState, 'act_now');
      assert.match(
        String(payload.cases[0].recommendedActionReason || ''),
        /uppdaterat operatörssvar/i
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route kan läsa kundsvar från historik även utan booking-event i waiting_customer-listan', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-route-history-customer-reply',
      customerEmail: 'route-history-customer-reply@example.com',
      customerName: 'Route History Customer Reply',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      selectedSlots: [{ id: 'slot-route-history-reply', startsAt: '2026-05-12T10:00:00.000Z' }],
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
      const listResponse = await fetch(
        `${baseUrl}/cco-bookings/cases?customerEmail=${encodeURIComponent(context.customerEmail)}`
      );
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.equal(payload.cases.length, 1);
      assert.equal(payload.cases[0].blocker.label, 'Kundsvar inkommet');
      assert.equal(payload.cases[0].blocker.action, 'insert_studio');
      assert.equal(payload.cases[0].blocker.nextActionLabel, 'uppdatera Svarstudio');
      assert.equal(payload.cases[0].waitingCustomer.mode, 'customer_reply');
      assert.equal(payload.cases[0].waitingCustomer.action, 'insert_studio');
      assert.equal(payload.cases[0].waitingCustomer.urgencyLevel, 'normal');
      assert.match(String(payload.cases[0].waitingCustomer.urgencyReason || ''), /svarat nyligen/i);
      assert.equal(payload.cases[0].recommendedActionState, 'act_now');
      assert.match(
        String(payload.cases[0].recommendedActionReason || ''),
        /uppdaterat operatörssvar/i
      );
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route markerar äldre kundsvar från historik som bearbetningskrävande i waiting_customer-listan', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-route-history-customer-reply-stale',
      customerEmail: 'route-history-customer-reply-stale@example.com',
      customerName: 'Route History Customer Reply Stale',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 60 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      selectedSlots: [
        { id: 'slot-route-history-reply-stale', startsAt: '2026-05-12T10:00:00.000Z' },
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
      const listResponse = await fetch(
        `${baseUrl}/cco-bookings/cases?customerEmail=${encodeURIComponent(context.customerEmail)}`
      );
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.equal(payload.cases.length, 1);
      assert.equal(payload.cases[0].blocker.label, 'Bearbeta kundsvar');
      assert.equal(payload.cases[0].blocker.action, 'insert_studio');
      assert.equal(payload.cases[0].blocker.nextActionLabel, 'öppna Svarstudio');
      assert.equal(payload.cases[0].waitingCustomer.mode, 'customer_reply');
      assert.equal(payload.cases[0].waitingCustomer.customerReplyStale, true);
      assert.equal(payload.cases[0].waitingCustomer.urgencyLevel, 'high');
      assert.match(
        String(payload.cases[0].waitingCustomer.urgencyReason || ''),
        /utan bearbetning/i
      );
      assert.equal(payload.cases[0].recommendedActionState, 'act_now_overdue');
      assert.match(String(payload.cases[0].recommendedActionReason || ''), /Svarstudio/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route återöppnar confirmed_external i listan när kunden svarar efter bekräftelsen', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-route-confirmed-history-reply',
      customerEmail: 'route-confirmed-history-reply@example.com',
      customerName: 'Route Confirmed History Reply',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'confirmed_external',
      confirmedExternalAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      selectedSlots: [
        { id: 'slot-route-confirmed-history-reply', startsAt: '2026-05-12T10:00:00.000Z' },
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
      const listResponse = await fetch(
        `${baseUrl}/cco-bookings/cases?customerEmail=${encodeURIComponent(context.customerEmail)}`
      );
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.equal(payload.cases.length, 1);
      assert.equal(payload.cases[0].blocker.label, 'Kundsvar efter bekräftelse');
      assert.equal(payload.cases[0].blocker.action, 'insert_studio');
      assert.equal(payload.cases[0].blocker.nextActionLabel, 'uppdatera Svarstudio');
      assert.equal(payload.cases[0].recommendedActionState, 'act_now');
      assert.match(String(payload.cases[0].recommendedActionReason || ''), /efter bekräftelsen/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route håller confirmed_external levande i listan när uppföljning efter bekräftelsen förfaller', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-route-confirmed-followup-due',
      customerEmail: 'route-confirmed-followup-due@example.com',
      customerName: 'Route Confirmed Followup Due',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'confirmed_external',
      confirmedExternalAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      selectedSlots: [
        { id: 'slot-route-confirmed-followup-due', startsAt: '2026-05-12T10:00:00.000Z' },
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
      const listResponse = await fetch(
        `${baseUrl}/cco-bookings/cases?customerEmail=${encodeURIComponent(context.customerEmail)}`
      );
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.equal(payload.cases.length, 1);
      assert.equal(payload.cases[0].blocker.label, 'Följ upp efter bekräftelse');
      assert.equal(payload.cases[0].blocker.action, 'schedule_followup');
      assert.equal(payload.cases[0].blocker.nextActionLabel, 'påminn kunden igen');
      assert.equal(payload.cases[0].postConfirmation.mode, 'post_confirmation_follow_up_due');
      assert.equal(payload.cases[0].recommendedActionState, 'reengage_now');
      assert.match(String(payload.cases[0].recommendedActionReason || ''), /efter bekräftelsen/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route kan läsa reply_later från historik som förfallen uppföljning i waiting_customer-listan', async () => {
  const fixture = await createFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-route-history-followup-due',
      customerEmail: 'route-history-followup@example.com',
      customerName: 'Route History Followup',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    await fixture.bookingStore.upsertCase({
      ...context,
      status: 'waiting_customer',
      offeredAt: new Date(Date.now() - 30 * 36e5).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
      selectedSlots: [{ id: 'slot-route-history-followup', startsAt: '2026-05-12T10:00:00.000Z' }],
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
      nextActionSummary: 'Återuppta tråden om kunden inte svarar.',
      followUpDueAt: new Date(Date.now() - 1 * 36e5).toISOString(),
    });

    await withServer(fixture.app, async (baseUrl) => {
      const listResponse = await fetch(
        `${baseUrl}/cco-bookings/cases?customerEmail=${encodeURIComponent(context.customerEmail)}`
      );
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.equal(payload.cases.length, 1);
      assert.equal(payload.cases[0].blocker.label, 'Följ upp igen');
      assert.equal(payload.cases[0].blocker.action, 'schedule_followup');
      assert.equal(payload.cases[0].blocker.nextActionLabel, 'påminn kunden');
      assert.equal(payload.cases[0].waitingCustomer.mode, 'follow_up_due');
      assert.equal(payload.cases[0].waitingCustomer.urgencyLevel, 'high');
      assert.match(String(payload.cases[0].waitingCustomer.urgencyReason || ''), /passerat/i);
      assert.match(String(payload.cases[0].waitingCustomer.latestFollowUpDueAt || ''), /T/);
      assert.equal(payload.cases[0].recommendedActionState, 'reengage_now');
      assert.match(String(payload.cases[0].recommendedActionReason || ''), /återupptas nu/i);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route låter case-listan visa confirm_external när CCO redan har bokningen men caset inte är syncat', async () => {
  const fixture = await createEngineFixture();
  try {
    const context = {
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-backed-confirm',
      customerEmail: 'engine-confirm@example.com',
      customerName: 'Engine Confirm',
      ownerUserId: 'preview-local',
      ownerName: 'Preview',
    };
    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await fixture.bookingEngineStore.listAvailability({
      tenantId: context.tenantId,
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    const slot = availability[0];
    await fixture.bookingStore.setCandidateSlots({
      ...context,
      selectedSlots: [slot],
    });
    await fixture.bookingEngineStore.confirmBooking({
      ...context,
      slot,
    });

    await withServer(fixture.app, async (baseUrl) => {
      const listResponse = await fetch(
        `${baseUrl}/cco-bookings/cases?customerEmail=${encodeURIComponent(context.customerEmail)}`
      );
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.equal(payload.cases.length, 1);
      assert.equal(payload.cases[0].blocker.action, 'confirm_external');
      assert.equal(payload.cases[0].recommendedAction, 'confirm_external');
      assert.equal(payload.cases[0].recommendedActionState, 'act_now');
      assert.equal(payload.cases[0].bookingEngineState, 'confirmed');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('cco bookings route kan läsa egen booking engine som source of truth för tider och referensdata', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-bookings-engine-route-'));
  try {
    const bookingStore = await createCcoBookingStore({
      filePath: path.join(tempDir, 'bookings.json'),
    });
    const bookingEngineStore = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });
    const patientSystemStore = await createCcoPatientSystemStore({
      filePath: path.join(tempDir, 'patient-system.json'),
    });
    const app = express();
    app.use(express.json());
    app.use(
      '/api/v1',
      createCcoBookingsRouter({
        bookingStore,
        bookingEngineStore,
        patientSystemStore,
        authStore: {
          async getSessionContextByToken() {
            return null;
          },
          async touchSession() {
            return true;
          },
        },
        config: {
          defaultTenantId: 'tenant-a',
          brand: 'hair-tp-clinic',
          brandByHost: {},
        },
      })
    );
    await withServer(app, async (baseUrl) => {
      const { fromDate, toDate } = bookingMondayWindow();
      const refResponse = await fetch(`${baseUrl}/cco-bookings/ref-data`);
      assert.equal(refResponse.status, 200);
      const refPayload = await refResponse.json();
      assert.equal(refPayload.provider, 'cco_engine');
      assert.ok(refPayload.resources.length >= 1);
      assert.ok(refPayload.services.length >= 1);

      const slotsResponse = await fetch(
        `${baseUrl}/cco-bookings/slots?fromDate=${fromDate}&toDate=${toDate}&resIds=egzona&srvIds=consultation-physical`
      );
      assert.equal(slotsResponse.status, 200);
      const slotsPayload = await slotsResponse.json();
      assert.equal(slotsPayload.provider, 'cco_engine');
      assert.ok(slotsPayload.slots.length >= 1);
      assert.equal(slotsPayload.slots[0].source, 'cco_engine');
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
