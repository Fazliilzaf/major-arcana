const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoBookingsRouter } = require('../../src/routes/ccoBookings');
const { createCcoBookingStore } = require('../../src/ops/ccoBookingStore');

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
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoBookingsRouter({
      bookingStore,
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
  return { app, tempDir };
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

      const offerResponse = await fetch(`${baseUrl}/cco-bookings/offer-draft?${qs}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(offerResponse.status, 200);
      const offerPayload = await offerResponse.json();
      assert.equal(offerPayload.bookingCase.status, 'offered');
      assert.equal(offerPayload.bookingCase.events.at(-1).type, 'offer_draft_inserted');
      assert.match(offerPayload.draft, /Här är tiderna jag kan erbjuda/);
      assert.match(offerPayload.draft, /Dr\. Eriksson/);
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
        `${baseUrl}/cco-bookings/slots?fromDate=2026-05-08&toDate=2026-05-22&resIds=res-1&srvIds=srv-1`
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

test('cco bookings route hämtar normaliserad Cliento ref-data', async () => {
  const fixture = await createFixture();
  const originalFetch = global.fetch;
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
      const response = await fetch(`${baseUrl}/cco-bookings/ref-data`);
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

      const listResponse = await fetch(`${baseUrl}/cco-bookings/cases?sort=blocked&limit=3`);
      assert.equal(listResponse.status, 200);
      const payload = await listResponse.json();
      assert.deepEqual(
        payload.cases.map((bookingCase) => bookingCase.conversationId),
        ['conv-empty-route', 'conv-slots-route', 'conv-offered-route']
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
