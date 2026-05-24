'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createPublicBookingEngineRouter } = require('../../src/routes/publicBookingEngine');

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

function minimalStore() {
  return {
    listPublicResources: async () => [],
    listPublicServices: async () => [],
    listPublicAvailability: async () => [],
  };
}

test('public booking-engine endpoints return 503 when ARCANA_PUBLIC_WEB_BOOKING_ENABLED is false', async () => {
  const prev = process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
  process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED = 'false';
  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createPublicBookingEngineRouter({
      bookingEngineStore: minimalStore(),
      bookingStore: null,
      config: { brand: 'hair-tp-clinic', brandByHost: {} },
    })
  );

  try {
    await withServer(app, async (baseUrl) => {
      for (const path of [
        '/api/public/booking-engine/catalog?host=hairtpclinic.com',
        '/api/public/booking-engine/availability?host=hairtpclinic.com&fromDate=2026-06-01&toDate=2026-06-07',
      ]) {
        const res = await fetch(`${baseUrl}${path}`);
        assert.equal(res.status, 503);
        const body = await res.json();
        assert.equal(body.error, 'public_web_booking_disabled');
      }

      const postRes = await fetch(`${baseUrl}/api/public/booking-engine/reservations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ consent: { gdpr: true } }),
      });
      assert.equal(postRes.status, 503);
      const postBody = await postRes.json();
      assert.equal(postBody.error, 'public_web_booking_disabled');
    });
  } finally {
    if (prev === undefined) delete process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
    else process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED = prev;
  }
});
