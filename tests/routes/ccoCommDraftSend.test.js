'use strict';

/* Steg 2d — kontrollerad live-send. Den ENDA vägen som kan skicka. Alla grindar
 * måste passera: owner (mail.live_send) · flagga på · adapter wire:ad · approved ·
 * mottagare allowlistad (2a) · avsändar-brevlåda allowlistad. Varje blockerad väg
 * anropar ALDRIG adaptern. Happy path skickar en gång och sätter draft = sent. */

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

function fakeAdapter() {
  const calls = [];
  return {
    calls,
    sendMail: async (payload) => {
      calls.push(payload);
      return { messageId: 'provider-msg-1' };
    },
  };
}

async function createFixture({ adapter = undefined, seedRecipient = 'anna@mail.se' } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-send-'));
  const auditEvents = [];
  const auditLog = { append: (e) => auditEvents.push(e) };
  const allowlist = await createCcoRecipientAllowlistStore({
    filePath: path.join(tempDir, 'cco-recipient-allowlist.json'),
    auditLog,
  });
  if (seedRecipient) {
    await allowlist.addRecipient('hairtpclinic', seedRecipient, { actor: { userId: 'u1' } });
  }
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
      graphSendAdapter: adapter,
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

async function newApprovedDraft(baseUrl) {
  const created = await j(baseUrl, 'POST', '/cco-comm/drafts', {
    role: 'operator',
    user: 'author-1',
    body: { tenantId: 'hairtpclinic', customerId: 'c1', channel: 'email', subject: 'Hej', body: 'Text' },
  });
  const draftId = created.json.draft.draftId;
  await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/transition`, {
    role: 'operator',
    user: 'author-1',
    body: { status: 'needs_approval' },
  });
  await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/transition`, {
    role: 'operator',
    user: 'approver-2',
    body: { status: 'approved' },
  });
  return draftId;
}

function withSendEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  })();
}

test('operator (ej owner) nekas av middleware (403)', async () => {
  const adapter = fakeAdapter();
  const { app } = await createFixture({ adapter });
  await withSendEnv({ ARCANA_GRAPH_SEND_ENABLED: 'true', ARCANA_GRAPH_SEND_ALLOWLIST: '*' }, () =>
    withServer(app, async (baseUrl) => {
      const draftId = await newApprovedDraft(baseUrl);
      const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send`, {
        role: 'operator',
        body: { to: 'anna@mail.se', senderMailbox: 'kons@hairtp.se' },
      });
      assert.equal(res.status, 403);
      assert.equal(adapter.calls.length, 0);
    })
  );
});

test('owner, flagga av → 403 send_disabled, adaptern anropas ALDRIG', async () => {
  const adapter = fakeAdapter();
  const { app } = await createFixture({ adapter });
  await withSendEnv({ ARCANA_GRAPH_SEND_ENABLED: undefined, ARCANA_GRAPH_SEND_ALLOWLIST: '*' }, () =>
    withServer(app, async (baseUrl) => {
      const draftId = await newApprovedDraft(baseUrl);
      const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send`, {
        role: 'owner',
        body: { to: 'anna@mail.se', senderMailbox: 'kons@hairtp.se' },
      });
      assert.equal(res.status, 403);
      assert.equal(res.json.reason, 'send_disabled');
      assert.equal(adapter.calls.length, 0);
    })
  );
});

test('owner, flagga på men ingen adapter wire:ad → 503 no_adapter', async () => {
  const { app } = await createFixture({ adapter: null });
  await withSendEnv({ ARCANA_GRAPH_SEND_ENABLED: 'true', ARCANA_GRAPH_SEND_ALLOWLIST: '*' }, () =>
    withServer(app, async (baseUrl) => {
      const draftId = await newApprovedDraft(baseUrl);
      const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send`, {
        role: 'owner',
        body: { to: 'anna@mail.se', senderMailbox: 'kons@hairtp.se' },
      });
      assert.equal(res.status, 503);
      assert.equal(res.json.reason, 'no_adapter');
    })
  );
});

test('owner, ej godkänt utkast → 409, adaptern anropas ALDRIG', async () => {
  const adapter = fakeAdapter();
  const { app } = await createFixture({ adapter });
  await withSendEnv({ ARCANA_GRAPH_SEND_ENABLED: 'true', ARCANA_GRAPH_SEND_ALLOWLIST: '*' }, () =>
    withServer(app, async (baseUrl) => {
      const created = await j(baseUrl, 'POST', '/cco-comm/drafts', {
        role: 'operator',
        body: { tenantId: 'hairtpclinic', customerId: 'c', channel: 'email', subject: 'x' },
      });
      const draftId = created.json.draft.draftId;
      const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send`, {
        role: 'owner',
        body: { to: 'anna@mail.se', senderMailbox: 'kons@hairtp.se' },
      });
      assert.equal(res.status, 409);
      assert.equal(adapter.calls.length, 0);
    })
  );
});

test('owner, mottagare ej allowlistad → 403, adaptern anropas ALDRIG', async () => {
  const adapter = fakeAdapter();
  const { app } = await createFixture({ adapter });
  await withSendEnv({ ARCANA_GRAPH_SEND_ENABLED: 'true', ARCANA_GRAPH_SEND_ALLOWLIST: '*' }, () =>
    withServer(app, async (baseUrl) => {
      const draftId = await newApprovedDraft(baseUrl);
      const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send`, {
        role: 'owner',
        body: { to: 'okand@spam.se', senderMailbox: 'kons@hairtp.se' },
      });
      assert.equal(res.status, 403);
      assert.equal(res.json.reason, 'recipient_not_allowlisted');
      assert.equal(adapter.calls.length, 0);
    })
  );
});

test('owner, avsändar-brevlåda ej allowlistad → 403 sender_not_allowlisted', async () => {
  const adapter = fakeAdapter();
  const { app } = await createFixture({ adapter });
  await withSendEnv(
    { ARCANA_GRAPH_SEND_ENABLED: 'true', ARCANA_GRAPH_SEND_ALLOWLIST: 'annan@hairtp.se' },
    () =>
      withServer(app, async (baseUrl) => {
        const draftId = await newApprovedDraft(baseUrl);
        const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send`, {
          role: 'owner',
          body: { to: 'anna@mail.se', senderMailbox: 'kons@hairtp.se' },
        });
        assert.equal(res.status, 403);
        assert.equal(res.json.reason, 'sender_mailbox_not_allowlisted');
        assert.equal(adapter.calls.length, 0);
      })
  );
});

test('happy path: alla grindar passerar → adaptern anropas en gång, draft = sent', async () => {
  const adapter = fakeAdapter();
  const { app, auditEvents } = await createFixture({ adapter });
  await withSendEnv(
    { ARCANA_GRAPH_SEND_ENABLED: 'true', ARCANA_GRAPH_SEND_ALLOWLIST: 'kons@hairtp.se' },
    () =>
      withServer(app, async (baseUrl) => {
        const draftId = await newApprovedDraft(baseUrl);
        const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send`, {
          role: 'owner',
          user: 'owner-1',
          body: { to: 'Anna@Mail.SE', senderMailbox: 'Kons@HairTP.se' },
        });
        assert.equal(res.status, 200);
        assert.equal(res.json.sent, true);
        assert.equal(res.json.draft.status, 'sent');
        assert.equal(res.json.providerMessageId, 'provider-msg-1');
        // Adaptern anropades exakt en gång med normaliserad payload.
        assert.equal(adapter.calls.length, 1);
        assert.equal(adapter.calls[0].to, 'anna@mail.se');
        assert.equal(adapter.calls[0].from, 'kons@hairtp.se');
        assert.equal(adapter.calls[0].subject, 'Hej');
        const sent = auditEvents.filter(
          (e) => e.action === 'communication.draft.send' && e.result === 'ok'
        );
        assert.equal(sent.length, 1);
        assert.equal(sent[0].detail.recipientMasked, 'an***@mail.se');
      })
  );
});

test('adaptern kastar → draft = failed, 502', async () => {
  const throwing = {
    calls: [],
    sendMail: async () => {
      throw new Error('graph 500');
    },
  };
  const { app } = await createFixture({ adapter: throwing });
  await withSendEnv(
    { ARCANA_GRAPH_SEND_ENABLED: 'true', ARCANA_GRAPH_SEND_ALLOWLIST: 'kons@hairtp.se' },
    () =>
      withServer(app, async (baseUrl) => {
        const draftId = await newApprovedDraft(baseUrl);
        const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/send`, {
          role: 'owner',
          body: { to: 'anna@mail.se', senderMailbox: 'kons@hairtp.se' },
        });
        assert.equal(res.status, 502);
        assert.equal(res.json.sent, false);
        const after = await j(baseUrl, 'GET', `/cco-comm/drafts/${draftId}`, { role: 'owner' });
        assert.equal(after.json.draft.status, 'failed');
      })
  );
});

test('generisk /transition → sent förblir hårt blockerad även för owner', async () => {
  const adapter = fakeAdapter();
  const { app } = await createFixture({ adapter });
  await withSendEnv(
    { ARCANA_GRAPH_SEND_ENABLED: 'true', ARCANA_GRAPH_SEND_ALLOWLIST: '*' },
    () =>
      withServer(app, async (baseUrl) => {
        const draftId = await newApprovedDraft(baseUrl);
        await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/transition`, {
          role: 'owner',
          body: { status: 'queued' },
        });
        const res = await j(baseUrl, 'POST', `/cco-comm/drafts/${draftId}/transition`, {
          role: 'owner',
          body: { status: 'sent' },
        });
        assert.equal(res.status, 403);
        assert.equal(res.json.decision, 'blocked');
        assert.equal(adapter.calls.length, 0);
      })
  );
});
