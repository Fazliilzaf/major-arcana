const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createDiagRouter } = require('../../src/routes/diag');

async function withServer({ config, runtimeState }, run) {
  const app = express();
  app.use('/api/v1', createDiagRouter({ config, runtimeState }));
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

test('GET /_diag/env returnerar ok + env + resolved från config', async () => {
  const config = { stateRoot: '/tmp/state', aiProvider: 'fallback', staffJournalOpenAccess: false };
  await withServer({ config, runtimeState: {} }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/_diag/env`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.resolved.stateRoot, '/tmp/state');
    assert.equal(body.resolved.aiProvider, 'fallback');
    assert.ok('ARCANA_DEFAULT_TENANT' in body.env);
    assert.equal(body.nodeVersion, process.version);
  });
});

test('GET /_diag/version speglar runtimeState.startedAt', async () => {
  const runtimeState = { startedAt: '2026-06-24T00:00:00Z' };
  await withServer({ config: {}, runtimeState }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/_diag/version`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.serverStartedAt, '2026-06-24T00:00:00Z');
    assert.ok(Array.isArray(body.fixes));
  });
});

// ORD-86: bada bas-URL-namnen ska synas, och det effektiva vardet ska rapporteras.
// Utan detta gar det inte att se utifran att PUBLIC_BASE_URL och
// ARCANA_PUBLIC_BASE_URL pekar olika — vilket de gjorde tills 2026-08-06.
test('GET /_diag/env exponerar bada bas-URL-namnen och det effektiva vardet', async () => {
  const config = {
    stateRoot: '/tmp/state',
    aiProvider: 'fallback',
    publicBaseUrl: 'https://arcana.hairtpclinic.com',
  };
  const previous = {
    plain: process.env.PUBLIC_BASE_URL,
    prefixed: process.env.ARCANA_PUBLIC_BASE_URL,
  };
  process.env.PUBLIC_BASE_URL = 'https://arcana.hairtpclinic.com';
  process.env.ARCANA_PUBLIC_BASE_URL = 'https://arcana.hairtpclinic.se';
  try {
    await withServer({ config, runtimeState: {} }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/_diag/env`);
      const body = await res.json();
      assert.equal(body.env.PUBLIC_BASE_URL, 'https://arcana.hairtpclinic.com');
      assert.equal(body.env.ARCANA_PUBLIC_BASE_URL, 'https://arcana.hairtpclinic.se');
      assert.equal(body.resolved.publicBaseUrl, 'https://arcana.hairtpclinic.com');
    });
  } finally {
    if (previous.plain === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previous.plain;
    if (previous.prefixed === undefined) delete process.env.ARCANA_PUBLIC_BASE_URL;
    else process.env.ARCANA_PUBLIC_BASE_URL = previous.prefixed;
  }
});

// .cursor/rules/website-booking-policy.mdc kräver ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false
// på prod tills CCO-bokning är godkänd, men src/config.js defaultar till true —
// en motsägelse som inte gick att se utifrån. Exponera både den satta env-strängen
// och det effektiva booleska värdet så avvikelsen syns utan SSH.
test('GET /_diag/env exponerar ARCANA_PUBLIC_WEB_BOOKING_ENABLED och dess effektiva varde', async () => {
  const config = {
    stateRoot: '/tmp/state',
    aiProvider: 'fallback',
    publicWebBookingEnabled: true,
  };
  const previous = process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
  delete process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
  try {
    await withServer({ config, runtimeState: {} }, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/_diag/env`);
      const body = await res.json();
      assert.equal(body.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED, null);
      assert.equal(body.resolved.publicWebBookingEnabled, true);
    });
  } finally {
    if (previous === undefined) delete process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED;
    else process.env.ARCANA_PUBLIC_WEB_BOOKING_ENABLED = previous;
  }
});
