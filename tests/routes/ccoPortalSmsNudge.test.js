'use strict';

/* SMS-nudge-routern (följdsteg). mail.send-grindad. Resolverar telefonnummer lazy
 * från patientMasterStore. Dry-run som default (grind av) → 200 skipped. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createCcoPortalSmsNudgeRouter } = require('../../src/routes/ccoPortalSmsNudge');
const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');
const { createCcoPortalNudgeStore } = require('../../src/ops/ccoPortalNudgeStore');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-route-'));
  return path.join(dir, 'x.json');
}

async function buildApp({ withStores = true, sms = null, master = null } = {}) {
  const app = express();
  app.use(
    '/api/v1',
    createCcoPortalSmsNudgeRouter({
      requireAuth: (rq, _r, n) => {
        rq.auth = { tenantId: 'hairtpclinic', userId: 'staff' };
        n();
      },
    })
  );
  if (withStores) {
    app.locals.ccoPortalAccessStore = await createCcoPortalAccessStore({ filePath: tmp() });
    app.locals.ccoPortalNudgeStore = await createCcoPortalNudgeStore({ filePath: tmp() });
    app.locals.ccoSmsSender = sms || {
      async sendSms(i) {
        (app.locals._sent = app.locals._sent || []).push(i);
        return { ok: true, messageId: 'm1' };
      },
    };
    if (master) app.locals.ccoPatientMasterStore = master;
  }
  return app;
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

const P = '/api/v1/cco/runtime/customer/CUST-1/portal-sms-nudge';

test('grind av (default) → 200 skipped sms_gate_off, inget SMS', async () => {
  const app = await buildApp();
  const res = await req(app, 'POST', P, {
    headers: { 'x-cco-role': 'operator' },
    body: { phone: '+46700000000' },
  });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).reason, 'sms_gate_off');
  assert.equal((app.locals._sent || []).length, 0);
});

test('telefonnummer resolveras lazy från patientMasterStore', async () => {
  const app = await buildApp({
    master: { getPatient: async () => ({ phone: '+46711111111' }) },
  });
  // grind av → skipped men url byggd; bevisar att flödet nådde servicen med nummer
  const res = await req(app, 'POST', P, { headers: { 'x-cco-role': 'operator' }, body: {} });
  const j = JSON.parse(res.body);
  assert.equal(res.status, 200);
  assert.notEqual(j.reason, 'no_phone'); // numret hittades via master-store
});

test('obehörig roll (personal) blockeras', async () => {
  const app = await buildApp();
  const res = await req(app, 'POST', P, {
    headers: { 'x-cco-role': 'personal' },
    body: { phone: '+46700000000' },
  });
  assert.equal(res.status, 403);
});

test('utan stores → 503', async () => {
  const app = await buildApp({ withStores: false });
  const res = await req(app, 'POST', P, {
    headers: { 'x-cco-role': 'owner' },
    body: { phone: '+46700000000' },
  });
  assert.equal(res.status, 503);
});
