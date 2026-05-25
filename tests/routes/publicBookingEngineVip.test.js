'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createPublicBookingEngineRouter } = require('../../src/routes/publicBookingEngine');
const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { bookingMondayWindow } = require('../helpers/bookingTestDates');

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function validReservationBody(slot) {
  return {
    consent: { gdpr: true },
    contact: {
      name: 'VIP Patient',
      email: 'vip.patient@example.com',
      phone: '0701234567',
    },
    slot: {
      slotId: slot.slotId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      resourceId: slot.resourceId,
      serviceId: slot.serviceId,
    },
  };
}

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-public-vip-route-'));
  const bookingEngineStore = await createCcoBookingEngineStore({
    filePath: path.join(tempDir, 'booking-engine.json'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createPublicBookingEngineRouter({
      bookingEngineStore,
      bookingStore: null,
      config: { brand: 'hair-tp-clinic', brandByHost: {} },
    })
  );
  return { app, tempDir, bookingEngineStore };
}

test('VIP POST reservations works when public web booking is disabled', async () => {
  const prevEnabled = process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
  const prevTokens = process.env.ARCANA_BOOKING_VIP_TOKENS_JSON;
  process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED = 'false';
  process.env.ARCANA_BOOKING_VIP_TOKENS_JSON = JSON.stringify({
    tokens: [
      {
        tokenId: 'test-vip-reservation',
        label: 'Test VIP reservation',
        serviceIds: ['followup-transplant'],
        resourceIds: ['fazli'],
      },
    ],
  });

  const fixture = await createFixture();
  try {
    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await fixture.bookingEngineStore.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate,
      toDate,
      resIds: 'fazli',
      srvIds: 'followup-transplant',
      publicOnly: false,
    });
    assert.ok(availability.length >= 1);
    const slot = availability[0];

    await withServer(fixture.app, async (baseUrl) => {
      const postRes = await fetch(
        `${baseUrl}/api/public/booking-engine/vip/test-vip-reservation/reservations`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validReservationBody(slot)),
        }
      );
      assert.equal(postRes.status, 200);
      const body = await postRes.json();
      assert.equal(body.ok, true);
      assert.equal(body.provider, 'cco_engine_vip');
      assert.match(body.caseId, /^vip-/);
      assert.equal(body.vip.tokenId, 'test-vip-reservation');
    });
  } finally {
    if (prevEnabled === undefined) delete process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
    else process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED = prevEnabled;
    if (prevTokens === undefined) delete process.env.ARCANA_BOOKING_VIP_TOKENS_JSON;
    else process.env.ARCANA_BOOKING_VIP_TOKENS_JSON = prevTokens;
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('VIP POST reservations rejects invalid token and disallowed service', async () => {
  const prevEnabled = process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
  const prevTokens = process.env.ARCANA_BOOKING_VIP_TOKENS_JSON;
  process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED = 'false';
  process.env.ARCANA_BOOKING_VIP_TOKENS_JSON = JSON.stringify({
    tokens: [
      {
        tokenId: 'test-vip-reservation',
        label: 'Test VIP reservation',
        serviceIds: ['followup-transplant'],
        resourceIds: ['fazli'],
      },
    ],
  });

  const fixture = await createFixture();
  try {
    const slot = {
      slotId: 'fazli::consultation-online::2026-06-01T09:00:00.000Z',
      startsAt: '2026-06-01T09:00:00.000Z',
      endsAt: '2026-06-01T09:30:00.000Z',
      resourceId: 'fazli',
      serviceId: 'consultation-online',
    };

    await withServer(fixture.app, async (baseUrl) => {
      const invalidTokenRes = await fetch(
        `${baseUrl}/api/public/booking-engine/vip/not-a-real-token/reservations`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validReservationBody(slot)),
        }
      );
      assert.equal(invalidTokenRes.status, 404);
      assert.equal((await invalidTokenRes.json()).error, 'vip_token_invalid');

      const wrongServiceRes = await fetch(
        `${baseUrl}/api/public/booking-engine/vip/test-vip-reservation/reservations`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(validReservationBody(slot)),
        }
      );
      assert.equal(wrongServiceRes.status, 403);
      assert.equal((await wrongServiceRes.json()).error, 'vip_service_not_allowed');
    });
  } finally {
    if (prevEnabled === undefined) delete process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
    else process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED = prevEnabled;
    if (prevTokens === undefined) delete process.env.ARCANA_BOOKING_VIP_TOKENS_JSON;
    else process.env.ARCANA_BOOKING_VIP_TOKENS_JSON = prevTokens;
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
