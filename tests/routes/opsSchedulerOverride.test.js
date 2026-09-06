'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createOpsSchedulerOverrideRouter } = require('../../src/routes/opsSchedulerOverride');

const silent = { warn() {}, error() {} };

function makeApp({ role = 'owner' } = {}) {
  const app = express();
  const passthrough = (req, res, next) => next();
  const requireAnyRole = (roles) => (req, res, next) =>
    roles.includes(role) ? next() : res.status(403).json({ error: 'forbidden' });
  app.use(
    '/api/v1/ops',
    createOpsSchedulerOverrideRouter({
      requireCcoAuthenticated: passthrough,
      attachRole: passthrough,
      requireAnyRole,
      auditLog: null,
      logger: silent,
    })
  );
  return app;
}

async function withServer(app, fn) {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    // ORD-245 — stängningen MÅSTE inväntas. server.close() är asynkront:
    // lyssnaren slutar ta emot nya anslutningar direkt, men släpper inte
    // porten förrän händelseloopen kört klart. Ett test som går vidare utan
    // att vänta lämnar handtaget öppet, och i en svit som kör tvåhundra
    // filer parallellt ackumuleras de.
    const stangd = new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await stangd;
  }
}

function useTmpOverridePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ovr-api-'));
  process.env.ARCANA_SCHEDULER_OVERRIDE_PATH = path.join(dir, 'override.json');
  return process.env.ARCANA_SCHEDULER_OVERRIDE_PATH;
}

test('GET utan fil → exists:false', async () => {
  useTmpOverridePath();
  await withServer(makeApp(), async (base) => {
    const res = await fetch(`${base}/api/v1/ops/scheduler/override`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.exists, false);
  });
});

test('POST skriver validerade nycklar och GET läser tillbaka', async () => {
  const p = useTmpOverridePath();
  await withServer(makeApp(), async (base) => {
    const res = await fetch(`${base}/api/v1/ops/scheduler/override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schedulerEnabled: true, schedulerJobs: '', junk: 'x' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body.override, { schedulerEnabled: true, schedulerJobs: '' });
    assert.deepEqual(JSON.parse(fs.readFileSync(p, 'utf8')), {
      schedulerEnabled: true,
      schedulerJobs: '',
    });
    const get = await (await fetch(`${base}/api/v1/ops/scheduler/override`)).json();
    assert.equal(get.exists, true);
    assert.equal(get.valid, true);
  });
});

test('POST utan giltiga nycklar → 400', async () => {
  useTmpOverridePath();
  await withServer(makeApp(), async (base) => {
    const res = await fetch(`${base}/api/v1/ops/scheduler/override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schedulerEnabled: 'ja' }),
    });
    assert.equal(res.status, 400);
  });
});

test('DELETE tar bort filen', async () => {
  const p = useTmpOverridePath();
  fs.writeFileSync(p, JSON.stringify({ schedulerEnabled: true }));
  await withServer(makeApp(), async (base) => {
    const res = await fetch(`${base}/api/v1/ops/scheduler/override`, { method: 'DELETE' });
    const body = await res.json();
    assert.equal(body.deleted, true);
    assert.equal(fs.existsSync(p), false);
  });
});

test('icke-owner → 403', async () => {
  useTmpOverridePath();
  await withServer(makeApp({ role: 'operator' }), async (base) => {
    const res = await fetch(`${base}/api/v1/ops/scheduler/override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schedulerEnabled: true }),
    });
    assert.equal(res.status, 403);
  });
});
