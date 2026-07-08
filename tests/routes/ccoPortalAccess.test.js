'use strict';

/* Magisk-länk-utfärdning (Fas 2, steg 5). Staff myntar/roterar/återkallar
 * patientens portal-token och får den färdiga länken tillbaka. Routern skickar
 * inget själv — leveransen sker i den kontrollerade mailkedjan. Funktionellt mot
 * express + riktig ccoPortalAccessStore. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createCcoPortalAccessRouter } = require('../../src/routes/ccoPortalAccess');
const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-access-'));
  return path.join(dir, 'a.json');
}

async function buildApp() {
  const app = express();
  const requireAuth = (req, _res, next) => {
    req.auth = { tenantId: 'hairtpclinic', userId: 'staff-1' };
    next();
  };
  app.use(
    '/api/v1',
    createCcoPortalAccessRouter({ requireAuth, baseUrl: 'https://portal.example' })
  );
  const store = await createCcoPortalAccessStore({ filePath: tmp() });
  app.locals.ccoPortalAccessStore = store;
  return { app, store };
}

function req(app, method, p, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const r = http.request({ port, path: p, method, headers }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: b });
        });
      });
      r.on('error', (e) => {
        server.close();
        reject(e);
      });
      r.end();
    });
  });
}

test('staff utfärdar magisk länk → token + färdig portal-URL', async () => {
  const { app } = await buildApp();
  const res = await req(app, 'POST', '/api/v1/cco/runtime/customer/CUST-1/portal-access', {
    headers: { 'x-cco-role': 'operator' },
  });
  assert.equal(res.status, 201);
  const json = JSON.parse(res.body);
  assert.ok(json.token && json.token.length > 20);
  assert.equal(json.reused, false);
  assert.match(json.url, /^https:\/\/portal\.example\/portal-chat\//);
  assert.ok(json.url.includes(encodeURIComponent(json.token)));
});

test('andra anropet återanvänder samma aktiva token (idempotent länk)', async () => {
  const { app } = await buildApp();
  const first = JSON.parse(
    (
      await req(app, 'POST', '/api/v1/cco/runtime/customer/CUST-1/portal-access', {
        headers: { 'x-cco-role': 'operator' },
      })
    ).body
  );
  const second = JSON.parse(
    (
      await req(app, 'POST', '/api/v1/cco/runtime/customer/CUST-1/portal-access', {
        headers: { 'x-cco-role': 'operator' },
      })
    ).body
  );
  assert.equal(second.token, first.token);
  assert.equal(second.reused, true);
});

test('rotera ger ny token; gamla länken slutar gälla', async () => {
  const { app, store } = await buildApp();
  const first = JSON.parse(
    (
      await req(app, 'POST', '/api/v1/cco/runtime/customer/CUST-1/portal-access', {
        headers: { 'x-cco-role': 'operator' },
      })
    ).body
  );
  const rotated = JSON.parse(
    (
      await req(app, 'POST', '/api/v1/cco/runtime/customer/CUST-1/portal-access/rotate', {
        headers: { 'x-cco-role': 'operator' },
      })
    ).body
  );
  assert.notEqual(rotated.token, first.token);
  assert.equal(store.resolveToken(first.token), null); // gamla ogiltig
  assert.ok(store.resolveToken(rotated.token)); // nya giltig
});

test('återkalla stänger av länken', async () => {
  const { app, store } = await buildApp();
  const issued = JSON.parse(
    (
      await req(app, 'POST', '/api/v1/cco/runtime/customer/CUST-1/portal-access', {
        headers: { 'x-cco-role': 'operator' },
      })
    ).body
  );
  const res = await req(app, 'POST', '/api/v1/cco/runtime/customer/CUST-1/portal-access/revoke', {
    headers: { 'x-cco-role': 'operator' },
  });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).revoked, true);
  assert.equal(store.resolveToken(issued.token), null);
});

test('obehörig roll (konsult) blockeras — magisk länk är portal.write', async () => {
  const { app } = await buildApp();
  const res = await req(app, 'POST', '/api/v1/cco/runtime/customer/CUST-1/portal-access', {
    headers: { 'x-cco-role': 'konsult' },
  });
  assert.equal(res.status, 403);
});

test('utan store → 503 (funktionen ej aktiverad)', async () => {
  const app = express();
  app.use(
    '/api/v1',
    createCcoPortalAccessRouter({
      requireAuth: (req, _res, next) => {
        req.auth = { tenantId: 'hairtpclinic' };
        next();
      },
    })
  );
  const res = await req(app, 'POST', '/api/v1/cco/runtime/customer/CUST-1/portal-access', {
    headers: { 'x-cco-role': 'owner' },
  });
  assert.equal(res.status, 503);
});
