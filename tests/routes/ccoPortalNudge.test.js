'use strict';

/* Portal-nudge-routern (följdsteg): automatiserbar ingång som förbereder ett
 * needs_approval-utkast med den magiska länken. mail.send-grindat, idempotent,
 * skickar aldrig själv. Funktionellt mot express + riktiga stores. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createCcoPortalNudgeRouter } = require('../../src/routes/ccoPortalNudge');
const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');
const { createCcoPortalNudgeStore } = require('../../src/ops/ccoPortalNudgeStore');
const { createCcoCommDraftStore } = require('../../src/ops/ccoCommDraftStore');

function tmp(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudge-route-'));
  return path.join(dir, n);
}

async function buildApp({ withStores = true } = {}) {
  const app = express();
  const requireAuth = (req, _res, next) => {
    req.auth = { tenantId: 'hairtpclinic', userId: 'staff-1' };
    next();
  };
  app.use('/api/v1', createCcoPortalNudgeRouter({ requireAuth, baseUrl: 'https://p.ex' }));
  if (withStores) {
    app.locals.ccoPortalAccessStore = await createCcoPortalAccessStore({ filePath: tmp('a.json') });
    app.locals.ccoPortalNudgeStore = await createCcoPortalNudgeStore({ filePath: tmp('n.json') });
    app.locals.ccoCommDraftStore = await createCcoCommDraftStore({ filePath: tmp('d.json') });
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

const P = '/api/v1/cco/runtime/customer/CUST-1/portal-nudge';

test('förbereder nudge → 201 prepared med draftId + url', async () => {
  const app = await buildApp();
  const res = await req(app, 'POST', P, {
    headers: { 'x-cco-role': 'operator' },
    body: { customerName: 'Anna' },
  });
  assert.equal(res.status, 201);
  const j = JSON.parse(res.body);
  assert.equal(j.status, 'prepared');
  assert.ok(j.draftId);
  assert.match(j.url, /^https:\/\/p\.ex\/portal-chat\//);
});

test('andra anropet → 200 skipped (already_nudged), inte ett fel', async () => {
  const app = await buildApp();
  await req(app, 'POST', P, { headers: { 'x-cco-role': 'operator' } });
  const res = await req(app, 'POST', P, { headers: { 'x-cco-role': 'operator' } });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).reason, 'already_nudged');
});

test('obehörig roll (personal) blockeras — nudge är mail.send', async () => {
  const app = await buildApp();
  const res = await req(app, 'POST', P, { headers: { 'x-cco-role': 'personal' } });
  assert.equal(res.status, 403);
});

test('utan stores → 503', async () => {
  const app = await buildApp({ withStores: false });
  const res = await req(app, 'POST', P, { headers: { 'x-cco-role': 'owner' } });
  assert.equal(res.status, 503);
});
