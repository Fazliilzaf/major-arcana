'use strict';

/* Staff-sidan av portal-kanalen (Fas 2, steg 4). GET listar patientens portal-
 * meddelanden (mail.read), POST skickar klinik-svar → outbound (mail.send) och
 * markerar patientens inkommande som lästa. Funktionellt mot express + riktig store. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createCcoPortalMessagesRouter } = require('../../src/routes/ccoPortalMessages');
const { createCcoPortalMessageStore } = require('../../src/ops/ccoPortalMessageStore');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-portal-'));
  return path.join(dir, 'm.json');
}

async function buildApp() {
  const app = express();
  const requireAuth = (req, _res, next) => {
    req.auth = { tenantId: 'hairtpclinic', userId: 'staff-1' };
    next();
  };
  app.use('/api/v1', createCcoPortalMessagesRouter({ requireAuth }));
  const store = await createCcoPortalMessageStore({ filePath: tmp() });
  await store.appendMessage({
    tenantId: 'hairtpclinic',
    customerId: 'CUST-1',
    direction: 'inbound',
    body: 'Går det att flytta min tid?',
  });
  app.locals.ccoPortalMessageStore = store;
  return { app, store };
}

function req(app, method, p, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const data = body ? JSON.stringify(body) : null;
      const r = http.request(
        {
          port,
          path: p,
          method,
          headers: {
            ...(data
              ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }
              : {}),
            ...headers,
          },
        },
        (res) => {
          let b = '';
          res.on('data', (c) => (b += c));
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode, body: b });
          });
        }
      );
      r.on('error', (e) => {
        server.close();
        reject(e);
      });
      if (data) r.write(data);
      r.end();
    });
  });
}

test('staff läser patientens portal-meddelanden (mail.read)', async () => {
  const { app } = await buildApp();
  const res = await req(app, 'GET', '/api/v1/cco/runtime/customer/CUST-1/portal-messages', {
    headers: { 'x-cco-role': 'owner' },
  });
  assert.equal(res.status, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.messages.length, 1);
  assert.equal(json.messages[0].direction, 'inbound');
});

test('staff skickar klinik-svar → outbound + markerar inkommande läst', async () => {
  const { app, store } = await buildApp();
  const res = await req(app, 'POST', '/api/v1/cco/runtime/customer/CUST-1/portal-message', {
    headers: { 'x-cco-role': 'owner' },
    body: { body: 'Ja, vi flyttar den till fredag 09:00.' },
  });
  assert.equal(res.status, 201);
  assert.equal(JSON.parse(res.body).message.direction, 'outbound');
  // patientens inkommande ska nu vara markerat läst
  assert.equal(store.countUnreadInbound({ tenantId: 'hairtpclinic', customerId: 'CUST-1' }), 0);
  const all = store.listMessagesForCustomer({ tenantId: 'hairtpclinic', customerId: 'CUST-1' });
  assert.equal(all.length, 2);
});

test('obehörig roll blockeras', async () => {
  const { app } = await buildApp();
  const res = await req(app, 'GET', '/api/v1/cco/runtime/customer/CUST-1/portal-messages', {
    headers: { 'x-cco-role': 'gäst' },
  });
  assert.notEqual(res.status, 200);
});

test('klinik-svar notifierar patienten (dry-run) när stores är wire:ade', async () => {
  const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');
  const { app } = await buildApp();
  app.locals.ccoPortalAccessStore = await createCcoPortalAccessStore({ filePath: tmp() });
  const sends = [];
  app.locals.ccoSendActionStore = {
    async performSend(input) {
      sends.push(input);
      return { ok: true, mode: 'dry-run' };
    },
  };
  app.locals.ccoPatientMasterStore = {
    getPatient: async () => ({ name: 'Anna', email: 'anna@mail.se' }),
  };
  const res = await req(app, 'POST', '/api/v1/cco/runtime/customer/CUST-1/portal-message', {
    headers: { 'x-cco-role': 'owner' },
    body: { body: 'Ja, vi flyttar till fredag.' },
  });
  assert.equal(res.status, 201);
  const json = JSON.parse(res.body);
  assert.equal(json.notification.status, 'sent');
  assert.equal(json.notification.dryRun, true);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].payload.to, 'anna@mail.se');
});
