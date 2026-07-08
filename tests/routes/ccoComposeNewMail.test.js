'use strict';

/* Kompose-routern (följdsteg). mail.send-grindad. Skapar kontakt +
 * needs_approval-utkast. Funktionellt mot express + riktiga stores. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createCcoComposeNewMailRouter } = require('../../src/routes/ccoComposeNewMail');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoCommDraftStore } = require('../../src/ops/ccoCommDraftStore');

function tmp(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-route-'));
  return path.join(dir, n);
}

async function buildApp({ withStores = true } = {}) {
  const app = express();
  app.use(
    '/api/v1',
    createCcoComposeNewMailRouter({
      requireAuth: (rq, _r, n) => {
        rq.auth = { tenantId: 'hairtpclinic', userId: 'staff-1' };
        n();
      },
    })
  );
  if (withStores) {
    app.locals.ccoPatientMasterStore = await createCcoPatientMasterStore({
      filePath: tmp('pm.json'),
    });
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
          let bb = '';
          res.on('data', (c) => (bb += c));
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode, body: bb });
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

const P = '/api/v1/cco/runtime/compose-new-mail';

test('POST → 201 prepared, skapar kontakt + needs_approval-utkast', async () => {
  const app = await buildApp();
  const res = await req(app, 'POST', P, {
    headers: { 'x-cco-role': 'operator' },
    body: {
      recipientName: 'Ny Person',
      recipientEmail: 'ny@example.com',
      subject: 'Hej',
      body: 'Välkommen!',
      channel: 'graph',
      senderMailboxId: 'kons@hairtpclinic.com',
    },
  });
  assert.equal(res.status, 201);
  const j = JSON.parse(res.body);
  assert.equal(j.status, 'prepared');
  assert.ok(j.draftId && j.customerId);
  // Utkastet finns på needs_approval.
  const draft = app.locals.ccoCommDraftStore.getDraft(j.draftId);
  assert.equal(draft.status, 'needs_approval');
  assert.equal(draft.mergeFields.senderMailboxId, 'kons@hairtpclinic.com');
});

test('ogiltig e-post → 400', async () => {
  const app = await buildApp();
  const res = await req(app, 'POST', P, {
    headers: { 'x-cco-role': 'operator' },
    body: { recipientEmail: 'trasig', subject: 's', body: 'b' },
  });
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body).reason, 'invalid_email');
});

test('obehörig roll (personal) blockeras', async () => {
  const app = await buildApp();
  const res = await req(app, 'POST', P, {
    headers: { 'x-cco-role': 'personal' },
    body: { recipientEmail: 'x@y.se', subject: 's', body: 'b' },
  });
  assert.equal(res.status, 403);
});

test('utan stores → 503', async () => {
  const app = await buildApp({ withStores: false });
  const res = await req(app, 'POST', P, {
    headers: { 'x-cco-role': 'owner' },
    body: { recipientEmail: 'x@y.se', subject: 's', body: 'b' },
  });
  assert.equal(res.status, 503);
});

// ── Dublettvarning: GET /contact-lookup ──────────────────────────────────────

const LOOKUP = '/api/v1/cco/runtime/contact-lookup';

test('contact-lookup: känd e-post → exists:true med namn', async () => {
  const app = await buildApp();
  await app.locals.ccoPatientMasterStore.upsertPatient({
    tenantId: 'hairtpclinic',
    displayName: 'Redan Kund',
    emails: ['redan@example.com'],
  });
  const res = await req(app, 'GET', LOOKUP + '?email=redan@example.com', {
    headers: { 'x-cco-role': 'operator' },
  });
  assert.equal(res.status, 200);
  const j = JSON.parse(res.body);
  assert.equal(j.exists, true);
  assert.equal(j.displayName, 'Redan Kund');
});

test('contact-lookup: okänd e-post → exists:false', async () => {
  const app = await buildApp();
  const res = await req(app, 'GET', LOOKUP + '?email=ny@example.com', {
    headers: { 'x-cco-role': 'operator' },
  });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).exists, false);
});

test('contact-lookup: obehörig roll (personal) blockeras', async () => {
  const app = await buildApp();
  const res = await req(app, 'GET', LOOKUP + '?email=a@b.se', {
    headers: { 'x-cco-role': 'personal' },
  });
  assert.equal(res.status, 403);
});
