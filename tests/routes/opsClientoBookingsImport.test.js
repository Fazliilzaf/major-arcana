'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createOpsClientoBookingsImportRouter,
} = require('../../src/routes/opsClientoBookingsImport');

const silent = { warn() {}, error() {} };

const CSV =
  '"Boknings-id","Starttid","Pris","Kund-id","Kund e-post","Status","Tjänstens namn","Källa"\n' +
  '"b1","2026-07-01 10:00","2500","c1","test@example.com","Show","PRF Microneedling","Kalender"\n' +
  '"b2","2026-07-02 11:00","0","c2","two@example.com","No show","Fysisk konsultation","Webb"\n';

function makeApp({ role = 'owner' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-imp-'));
  const config = {
    clientoBookingStorePath: path.join(dir, 'cliento-bookings.json'),
    ccoPatientMasterStorePath: path.join(dir, 'cco-patient-master.json'),
  };
  const app = express();
  const passthrough = (req, res, next) => next();
  const requireAnyRole = (roles) => (req, res, next) =>
    roles.includes(role) ? next() : res.status(403).json({ error: 'forbidden' });
  app.use(
    '/api/v1/ops',
    createOpsClientoBookingsImportRouter({
      config,
      requireCcoAuthenticated: passthrough,
      attachRole: passthrough,
      requireAnyRole,
      auditLog: null,
      logger: silent,
    })
  );
  return { app, config };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('dry-run returnerar statistik utan att skriva store', async () => {
  const { app, config } = makeApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/ops/cliento/bookings-import`, {
      method: 'POST',
      headers: { 'content-type': 'text/csv' },
      body: CSV,
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.commit, false);
    assert.equal(body.dryRun, true);
    assert.equal(fs.existsSync(config.clientoBookingStorePath), false);
  });
});

test('commit skriver store', async () => {
  const { app, config } = makeApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/ops/cliento/bookings-import?commit=true`, {
      method: 'POST',
      headers: { 'content-type': 'text/csv' },
      body: CSV,
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.commit, true);
    assert.equal(body.dryRun, false);
    assert.equal(fs.existsSync(config.clientoBookingStorePath), true);
  });
});

test('tom kropp → 400', async () => {
  const { app } = makeApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/ops/cliento/bookings-import`, {
      method: 'POST',
      headers: { 'content-type': 'text/csv' },
      body: '',
    });
    assert.equal(res.status, 400);
  });
});

test('icke-owner → 403', async () => {
  const { app } = makeApp({ role: 'operator' });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/ops/cliento/bookings-import`, {
      method: 'POST',
      headers: { 'content-type': 'text/csv' },
      body: CSV,
    });
    assert.equal(res.status, 403);
  });
});
