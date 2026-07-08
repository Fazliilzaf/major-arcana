'use strict';

/* Inbound-SMS-webhook (följdsteg). Grindas av hemlig väg-token; utan hemlighet
 * → 404 (ej aktiverad). Fel hemlighet → 403. 46elks urlencoded-format lagras i
 * kundens tråd. Funktionellt mot express + riktig message-store. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createCcoInboundSmsRouter } = require('../../src/routes/ccoInboundSms');
const { createCcoPortalMessageStore } = require('../../src/ops/ccoPortalMessageStore');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-route-in-'));
  return path.join(dir, 'm.json');
}

const SECRET = 's3cr3t-path-token';

async function buildApp({ secret = SECRET, withStore = true } = {}) {
  const app = express();
  app.use('/api', createCcoInboundSmsRouter({ getSecret: () => secret }));
  if (withStore) {
    app.locals.ccoPortalMessageStore = await createCcoPortalMessageStore({ filePath: tmp() });
    app.locals.ccoPatientMasterStore = {
      findPatientByPhone: async ({ phone }) => (phone === '+46701234567' ? { id: 'PAT-1' } : null),
    };
  }
  return app;
}

// x-www-form-urlencoded POST (46elks-format)
function postForm(app, p, form) {
  const data = new URLSearchParams(form).toString();
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const r = http.request(
        {
          port,
          path: p,
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'content-length': Buffer.byteLength(data),
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
      r.write(data);
      r.end();
    });
  });
}

test('giltig hemlighet + 46elks-format → 200 stored, matchad kund', async () => {
  const app = await buildApp();
  const res = await postForm(app, `/api/public/sms/inbound/${SECRET}`, {
    from: '+46701234567',
    to: '+46766000000',
    message: 'Hej, går det bra fredag?',
    id: 'sabc',
  });
  assert.equal(res.status, 200);
  const j = JSON.parse(res.body);
  assert.equal(j.status, 'stored');
  assert.equal(j.matched, true);
  assert.equal(j.customerId, 'PAT-1');
  const list = app.locals.ccoPortalMessageStore.listMessagesForCustomer({
    tenantId: 'hairtpclinic',
    customerId: 'PAT-1',
  });
  assert.equal(list[0].channel, 'sms');
});

test('fel hemlighet → 403', async () => {
  const app = await buildApp();
  const res = await postForm(app, '/api/public/sms/inbound/fel-token', {
    from: '+46700',
    message: 'x',
  });
  assert.equal(res.status, 403);
});

test('ingen hemlighet konfigurerad → 404 (funktion ej aktiverad)', async () => {
  const app = await buildApp({ secret: '' });
  const res = await postForm(app, '/api/public/sms/inbound/vadsomhelst', {
    from: '+46700',
    message: 'x',
  });
  assert.equal(res.status, 404);
});

test('utan message-store → 503', async () => {
  const app = await buildApp({ withStore: false });
  const res = await postForm(app, `/api/public/sms/inbound/${SECRET}`, {
    from: '+46700',
    message: 'x',
  });
  assert.equal(res.status, 503);
});
