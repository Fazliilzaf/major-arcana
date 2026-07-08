'use strict';

/* Portal-självtest-routern. settings.read (owner/operator). Skarpt testmejl
 * (live) är owner-only — operator tvingas till dry-run. Funktionellt mot
 * express med injicerade fake-stores. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createCcoPortalSelfTestRouter } = require('../../src/routes/ccoPortalSelfTest');

function buildApp() {
  const app = express();
  app.use(
    '/api/v1',
    createCcoPortalSelfTestRouter({
      requireAuth: (rq, _r, n) => {
        rq.auth = { tenantId: 'hairtpclinic', userId: 'u1' };
        n();
      },
    })
  );
  app.locals.ccoPortalAccessStore = {
    issueToken: async () => ({ token: 'tok-1' }),
  };
  app.locals.ccoSendActionStore = {
    performSend: async (input) => ({
      ok: true,
      mode: input.dryRunOverride === false ? 'live' : 'dry-run',
    }),
  };
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
          let bb = '';
          res.on('data', (c) => (bb += c));
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode, json: JSON.parse(bb || '{}') });
          });
        }
      );
      r.on('error', reject);
      if (data) r.write(data);
      r.end();
    });
  });
}

test('owner: 200 med fyra steg och skarpt utskick när live+adress', async () => {
  const app = buildApp();
  const { status, json } = await req(app, 'POST', '/api/v1/cco/runtime/portal-selftest', {
    headers: { 'x-cco-role': 'owner' },
    body: { email: 'info@fazli.se', live: true },
  });
  assert.equal(status, 200);
  // json.ok speglar hela loopen (config/domän beror på riktig env) — här verifieras
  // strukturen + att skarpt utskick faktiskt kördes för owner.
  assert.equal(json.steps.length, 4);
  assert.equal(json.live, true);
  assert.equal(json.steps.find((s) => s.key === 'notify').ok, true);
  assert.equal(json.steps.find((s) => s.key === 'mint').ok, true);
});

test('operator: live tvingas till dry-run (owner-only skarpt)', async () => {
  const app = buildApp();
  const { status, json } = await req(app, 'POST', '/api/v1/cco/runtime/portal-selftest', {
    headers: { 'x-cco-role': 'operator' },
    body: { email: 'info@fazli.se', live: true },
  });
  assert.equal(status, 200);
  assert.equal(json.live, false); // inte skarpt trots live:true
});

test('konsult utan settings.read → 403', async () => {
  const app = buildApp();
  const { status } = await req(app, 'POST', '/api/v1/cco/runtime/portal-selftest', {
    headers: { 'x-cco-role': 'konsult' },
    body: {},
  });
  assert.equal(status, 403);
});
