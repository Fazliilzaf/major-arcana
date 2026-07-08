'use strict';

/* Patient-portal meddelande-endpoints (Fas 2, steg 3). Grindas av den magiska
 * länkens access-token, INTE personal-RBAC. Testar round-trip: patient skriver
 * (inbound) → läser tillbaka; ogiltig/utebliven token blockeras; funktion av när
 * storarna saknas. Funktionellt mot en riktig express-app. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createPatientPortalRouter } = require('../../src/routes/patientPortal');
const { createCcoPortalMessageStore } = require('../../src/ops/ccoPortalMessageStore');
const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');

function tmp(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-msg-'));
  return path.join(dir, name);
}

async function buildApp({ withStores = true } = {}) {
  const app = express();
  let portalMessageStore = null;
  let portalAccessStore = null;
  let token = null;
  if (withStores) {
    portalMessageStore = await createCcoPortalMessageStore({ filePath: tmp('m.json') });
    portalAccessStore = await createCcoPortalAccessStore({ filePath: tmp('a.json') });
    ({ token } = await portalAccessStore.issueToken({
      tenantId: 'hairtpclinic',
      customerId: 'CUST-1',
    }));
  }
  app.use(
    '/api',
    createPatientPortalRouter({
      patientPortalStore: { findInvite: async () => null, load: async () => {} },
      journalStore: null,
      portalMessageStore,
      portalAccessStore,
    })
  );
  return { app, token };
}

function req(app, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const data = body ? JSON.stringify(body) : null;
      const r = http.request(
        {
          port,
          path,
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

test('patient skriver (inbound) och läser tillbaka via magisk länk', async () => {
  const { app, token } = await buildApp();
  const post = await req(app, 'POST', `/api/patient-portal/${token}/messages`, {
    body: { body: 'Hej! Går det bra att flytta min tid?' },
  });
  assert.equal(post.status, 201);
  assert.equal(JSON.parse(post.body).message.direction, 'inbound');

  const get = await req(app, 'GET', `/api/patient-portal/${token}/messages`);
  assert.equal(get.status, 200);
  const json = JSON.parse(get.body);
  assert.equal(json.messages.length, 1);
  assert.equal(json.messages[0].body, 'Hej! Går det bra att flytta min tid?');
  assert.equal(json.messages[0].author, 'patient');
});

test('ogiltig token → 404, ingen åtkomst', async () => {
  const { app } = await buildApp();
  const get = await req(app, 'GET', '/api/patient-portal/fejk-token/messages');
  assert.equal(get.status, 404);
});

test('tom body → 400', async () => {
  const { app, token } = await buildApp();
  const post = await req(app, 'POST', `/api/patient-portal/${token}/messages`, {
    body: { body: '   ' },
  });
  assert.equal(post.status, 400);
});

test('utan storar → 503 (funktion ej aktiverad), resten av portalen orörd', async () => {
  const { app } = await buildApp({ withStores: false });
  const get = await req(app, 'GET', '/api/patient-portal/nagot/messages');
  assert.equal(get.status, 503);
});
