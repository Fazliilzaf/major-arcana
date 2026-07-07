'use strict';

/* Steg 2c — dry-run send-preview. Bygger förhandsvisningen + kör säkerhets-
 * kontrollerna (approved-utkast, mottagare på 2a-allowlisten) men SKICKAR
 * ALDRIG. HÅRT BLOCKERAD (403) när ARCANA_GRAPH_SEND_ENABLED är av. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoCommDraftRouter } = require('../../src/routes/ccoCommDraft');
const {
  createCcoRecipientAllowlistStore,
} = require('../../src/ops/ccoRecipientAllowlistStore');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-preview-'));
  const auditEvents = [];
  const auditLog = { append: (e) => auditEvents.push(e) };
  // Allowlist seedad med EN godkänd mottagare.
  const allowlist = await createCcoRecipientAllowlistStore({
    filePath: path.join(tempDir, 'cco-recipient-allowlist.json'),
    auditLog,
  });
  await allowlist.addRecipient('hairtpclinic', 'anna@mail.se', { actor: { userId: 'u1' } });

  const app = express();
  app.use(
    '/api/v1',
    createCcoCommDraftRouter({
      config: { stateRoot: tempDir, buildVersion: 'test' },
      requireAuth: (req, _res, next) => {
        req.auth = {
          tenantId: req.headers['x-tenant'] || 'hairtpclinic',
          userId: req.headers['x-user'] || 'author-1',
          role: req.headers['x-role'] || 'operator',
        };
        next();
      },
      commDraftStore: null,
      recipientAllowlistStore: allowlist,
      executionGateway: null,
      openai: null,
      auditLog,
    })
  );
  return { app, tempDir, auditEvents };
}

function j(baseUrl, method, route, { role = 'operator', user, body } = {}) {
  const headers = { 'content-type': 'application/json', 'x-role': role };
  if (user) headers['x-user'] = user;
  return fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
}

async function newApprovedDraft(baseUrl, { subject = 'Hej Anna', body = 'Svarstext' } = {}) {
  const created = await j(baseUrl, 'POST', '/cco-comm/drafts', {
    role: 'operator',
    user: 'author-1',
    body: { tenantId: 'hairtpclinic', customerId: 'cust-1', channel: 'email', subject, body },
  });
  assert.equal(created.status, 201);
  const draftId = created.json.draft.draftId;
  await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/transition`, {
    role: 'operator',
    user: 'author-1',
    body: { status: 'needs_approval' },
  });
  // Godkänns av EN ANNAN operatör (segregation of duties).
  const approved = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/transition`, {
    role: 'operator',
    user: 'approver-2',
    body: { status: 'approved' },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.draft.status, 'approved');
  return draftId;
}

test('flagga av: 403 send_disabled men returnerar preview (dry-run, sent:false)', async () => {
  const { app, auditEvents } = await createFixture();
  delete process.env.ARCANA_GRAPH_SEND_ENABLED;
  await withServer(app, async (baseUrl) => {
    const draftId = await newApprovedDraft(baseUrl);
    const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send-preview`, {
      role: 'operator',
      body: { to: 'Anna@Mail.SE', senderMailbox: 'kons@hairtp.se' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.decision, 'blocked');
    assert.equal(res.json.reason, 'send_disabled');
    assert.equal(res.json.dryRun, true);
    assert.equal(res.json.sent, false);
    assert.equal(res.json.preview.to, 'anna@mail.se');
    assert.equal(res.json.preview.subject, 'Hej Anna');
    assert.equal(res.json.preview.from, 'kons@hairtp.se');
    const previews = auditEvents.filter((e) => e.action === 'communication.draft.send_preview');
    assert.ok(previews.length >= 1);
    assert.equal(previews.at(-1).detail.recipientMasked, 'an***@mail.se');
  });
});

test('mottagare ej på allowlisten → 403 recipient_not_allowlisted', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const draftId = await newApprovedDraft(baseUrl);
    const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send-preview`, {
      role: 'operator',
      body: { to: 'okand@spam.se' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.reason, 'recipient_not_allowlisted');
  });
});

test('icke-godkänt utkast → 409', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const created = await j(baseUrl, 'POST', '/cco-comm/drafts', {
      role: 'operator',
      body: { tenantId: 'hairtpclinic', customerId: 'c', channel: 'email', subject: 'x' },
    });
    const draftId = created.json.draft.draftId;
    const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send-preview`, {
      role: 'operator',
      body: { to: 'anna@mail.se' },
    });
    assert.equal(res.status, 409);
  });
});

test('saknad/ogiltig mottagare → 400', async () => {
  const { app } = await createFixture();
  await withServer(app, async (baseUrl) => {
    const draftId = await newApprovedDraft(baseUrl);
    const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send-preview`, {
      role: 'operator',
      body: { to: 'inte-en-adress' },
    });
    assert.equal(res.status, 400);
  });
});

test('flagga PÅ: 200 preview_ok men sent:false (2c skickar aldrig — det är 2d)', async () => {
  const { app } = await createFixture();
  const prev = process.env.ARCANA_GRAPH_SEND_ENABLED;
  process.env.ARCANA_GRAPH_SEND_ENABLED = 'true';
  try {
    await withServer(app, async (baseUrl) => {
      const draftId = await newApprovedDraft(baseUrl);
      const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send-preview`, {
        role: 'operator',
        body: { to: 'anna@mail.se' },
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.decision, 'preview_ok');
      assert.equal(res.json.dryRun, true);
      assert.equal(res.json.sent, false);
    });
  } finally {
    if (prev === undefined) delete process.env.ARCANA_GRAPH_SEND_ENABLED;
    else process.env.ARCANA_GRAPH_SEND_ENABLED = prev;
  }
});

test('mail.read-roll (konsult saknar mail.send? nej — men saknad auth) nekas ej av misstag: konsult har mail.send', async () => {
  // konsult har mail.send → tillåts nå routen; blockeras sedan av flaggan (403 send_disabled).
  const { app } = await createFixture();
  delete process.env.ARCANA_GRAPH_SEND_ENABLED;
  await withServer(app, async (baseUrl) => {
    const draftId = await newApprovedDraft(baseUrl);
    const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send-preview`, {
      role: 'konsult',
      body: { to: 'anna@mail.se' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.reason, 'send_disabled');
  });
});
