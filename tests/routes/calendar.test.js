const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCalendarRouter } = require('../../src/routes/calendar');

const TOKEN = 'calendar-test-token';

function createRequireAuth({ tenantId = 'tenant-a', role = 'owner' } = {}) {
  return (req, res, next) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    req.auth = { tenantId, role, userId: 'calendar-test-user' };
    return next();
  };
}

function createStores() {
  const engineBookings = [
    {
      bookingId: 'engine-a',
      tenantId: 'tenant-a',
      customerEmail: 'anna@example.com',
      customerName: 'Anna Andersson',
      status: 'confirmed',
      slot: {
        startsAt: '2026-06-24T07:00:00.000Z',
        endsAt: '2026-06-24T07:45:00.000Z',
        durationMinutes: 45,
        resourceId: 'egzona',
        resourceLabel: 'Egzona Krasniqi',
        serviceId: 'prp-hair',
        serviceLabel: 'PRP för hår',
      },
    },
    {
      bookingId: 'engine-other-tenant',
      tenantId: 'tenant-b',
      customerEmail: 'secret@example.com',
      customerName: 'Annan tenant',
      status: 'confirmed',
      slot: {
        startsAt: '2026-06-24T08:00:00.000Z',
        endsAt: '2026-06-24T08:30:00.000Z',
        resourceId: 'fazli',
        resourceLabel: 'Fazli Krasniqi',
        serviceLabel: 'Konsultation',
      },
    },
  ];

  const bookingEngineStore = {
    _state: {
      resources: [
        { id: 'fazli', label: 'Fazli Krasniqi', active: true },
        { id: 'egzona', label: 'Egzona Krasniqi', active: true },
      ],
      bookings: engineBookings,
      reservations: [
        {
          reservationId: 'reservation-a',
          tenantId: 'tenant-a',
          customerEmail: 'reserve@example.com',
          customerName: 'Reserverad Patient',
          status: 'active',
          slot: {
            startsAt: '2026-06-24T10:00:00.000Z',
            endsAt: '2026-06-24T10:30:00.000Z',
            resourceId: 'fazli',
            resourceLabel: 'Fazli Krasniqi',
            serviceLabel: 'Konsultation',
          },
        },
        {
          reservationId: 'confirmed-reservation-a',
          tenantId: 'tenant-a',
          customerEmail: 'anna@example.com',
          customerName: 'Anna Andersson',
          status: 'confirmed',
          slot: {
            startsAt: '2026-06-24T07:00:00.000Z',
            resourceId: 'egzona',
            resourceLabel: 'Egzona Krasniqi',
            serviceLabel: 'PRP för hår',
          },
        },
      ],
    },
    listBookingsForEnrichment(tenantId) {
      return engineBookings.filter((booking) => booking.tenantId === tenantId);
    },
  };

  const clientoRows = [
    {
      bookingId: 'cliento-a',
      customerEmail: 'bo@example.com',
      customerName: 'Bo Berg',
      startsAt: '2026-06-24T12:00:00.000Z',
      endsAt: '2026-06-24T13:00:00.000Z',
      serviceLabel: 'Konsultation',
      staffName: 'Fazli Krasniqi',
      status: 'upcoming',
      source: 'cliento',
    },
    {
      bookingId: 'engine-a',
      customerEmail: 'anna@example.com',
      customerName: 'Anna Andersson',
      startsAt: '2026-06-24T07:00:00.000Z',
      endsAt: '2026-06-24T07:45:00.000Z',
      serviceLabel: 'PRP för hår',
      staffName: 'Egzona Krasniqi',
      status: 'upcoming',
      source: 'cliento',
    },
  ];
  const clientoBookingStore = {
    listAllBookings({ tenantId }) {
      return tenantId === 'tenant-a' ? clientoRows : [];
    },
  };

  return { bookingEngineStore, clientoBookingStore };
}

async function withServer(
  run,
  {
    auth = createRequireAuth(),
    bookingEngineStore = createStores().bookingEngineStore,
    clientoBookingStore = createStores().clientoBookingStore,
  } = {}
) {
  const app = express();
  app.use(
    '/api/v1',
    createCalendarRouter({
      requireAuth: auth,
      getBookingEngineStore: () => bookingEngineStore,
      getClientoBookingStore: () => clientoBookingStore,
    })
  );
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function authHeaders() {
  return { Authorization: `Bearer ${TOKEN}` };
}

test('calendar routes require a verified bearer session', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/calendar/day?date=2026-06-24`);
    assert.equal(res.status, 401);
  });
});

test('GET /calendar/day reads modern engine + Cliento data in clinic local time', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/calendar/day?date=2026-06-24`, {
      headers: authHeaders(),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.totalSlots, 3);
    assert.equal(body.confirmedBookings, 2);
    assert.equal(body.pendingReservations, 1);
    assert.deepEqual(body.sourceCounts, { bookingEngine: 2, cliento: 1 });

    const egzona = body.resources.find((resource) => resource.resourceId === 'egzona');
    assert.equal(egzona.slots.length, 1, 'Cliento duplicate must not render twice');
    assert.equal(egzona.slots[0].time, '09:00');
    assert.equal(egzona.slots[0].endTime, '09:45');

    const fazli = body.resources.find((resource) => resource.resourceId === 'fazli');
    assert.deepEqual(
      fazli.slots.map((slot) => slot.patientName),
      ['Reserverad Patient', 'Bo Berg']
    );
  });
});

test('query tenant cannot override authenticated tenant scope', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/calendar/day?date=2026-06-24&tenantId=tenant-b`,
      { headers: authHeaders() }
    );
    const body = await res.json();
    const names = body.resources.flatMap((resource) =>
      resource.slots.map((slot) => slot.patientName)
    );
    assert.equal(names.includes('Annan tenant'), false);
    assert.equal(names.includes('Anna Andersson'), true);
  });
});

test('GET /calendar/week reuses the scoped live read model', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/calendar/week?startDate=2026-06-22`, {
      headers: authHeaders(),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.days.length, 7);
    assert.equal(body.totalSlots, 3);
    assert.equal(body.days.find((day) => day.date === '2026-06-24').totalSlots, 3);
  });
});

test('bookings.read rejects roles without calendar permission', async () => {
  await withServer(
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/calendar/day?date=2026-06-24`, {
        headers: authHeaders(),
      });
      assert.equal(res.status, 403);
    },
    { auth: createRequireAuth({ role: 'revisor' }) }
  );
});

test('calendar fails closed while both booking stores are unavailable', async () => {
  await withServer(
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/calendar/day?date=2026-06-24`, {
        headers: authHeaders(),
      });
      assert.equal(res.status, 503);
      assert.equal((await res.json()).error, 'calendar_store_not_ready');
    },
    { bookingEngineStore: null, clientoBookingStore: null }
  );
});

test('GET /calendar/ical/:resourceId.ics is authenticated and store-backed', async () => {
  const futureStart = new Date(Date.now() + 2 * 86400000).toISOString();
  const futureEnd = new Date(Date.now() + 2 * 86400000 + 45 * 60000).toISOString();
  const bookingEngineStore = {
    _state: { resources: [], bookings: [], reservations: [] },
    listBookingsForEnrichment(tenantId) {
      return tenantId === 'tenant-a'
        ? [
            {
              bookingId: 'ical-live',
              tenantId,
              customerEmail: 'live@example.com',
              customerName: 'Live Patient',
              status: 'confirmed',
              slot: {
                startsAt: futureStart,
                endsAt: futureEnd,
                resourceId: 'fazli',
                resourceLabel: 'Fazli Krasniqi',
                serviceLabel: 'Konsultation',
              },
            },
          ]
        : [];
    },
  };
  const clientoBookingStore = {
    listAllBookings({ tenantId }) {
      return tenantId === 'tenant-a'
        ? [
            {
              bookingId: 'ical-live-cliento-copy',
              customerEmail: 'live@example.com',
              customerName: 'Live Patient',
              startsAt: futureStart,
              endsAt: futureEnd,
              staffName: 'Fazli Krasniqi',
              serviceLabel: 'Konsultation',
              status: 'upcoming',
            },
          ]
        : [];
    },
  };

  await withServer(
    async (baseUrl) => {
      const unauthenticated = await fetch(`${baseUrl}/calendar/ical/all.ics`);
      assert.equal(unauthenticated.status, 401);

      const res = await fetch(`${baseUrl}/calendar/ical/all.ics`, {
        headers: authHeaders(),
      });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /text\/calendar/);
      const text = await res.text();
      assert.match(text, /BEGIN:VCALENDAR/);
      assert.match(text, /Live Patient/);
      assert.match(text, /Konsultation/);
      assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 1);
    },
    { bookingEngineStore, clientoBookingStore }
  );
});
