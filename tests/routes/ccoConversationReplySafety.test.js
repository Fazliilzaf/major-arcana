'use strict';

/**
 * P0-003 — konversationssvar måste gå genom den kanoniska sändadaptern
 * (ccoGraphSendAdapter.sendReply), aldrig direkt på graphSendConnector.
 *
 * Före P0-003 gick POST /cco/runtime/conversation/:key/reply direkt på
 * graphSendConnector.sendReply och passerade förbi avlidenspärren och
 * avsändar-allowlisten. Här mäts de adversarialla kontrakten (T-001..T-016):
 * varje blockering ger NOLL connector-anrop, och klienten kan inte välja
 * avsändare/mottagare.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoConversationRouter } = require('../../src/routes/ccoConversation');
const { createCcoGraphSendAdapter } = require('../../src/infra/ccoGraphSendAdapter');
const { setDeceasedResolver } = require('../../src/ops/ccoDeceasedSendGuard');

const ALLOWLIST_KEY = 'ARCANA_GRAPH_SEND_ALLOWLIST';
const CONV_KEY = 'conv-safety-1';
const MAILBOX = 'contact@hairtpclinic.com';
const CUSTOMER = 'kund@example.com';

const MESSAGES = [
  {
    mailboxConversationId: CONV_KEY,
    conversationId: 'graph-conv-1',
    graphMessageId: 'graph-msg-1',
    mailboxId: MAILBOX,
    folderType: 'inbox', // → inbound
    subject: 'Fråga om pris',
    from: { emailAddress: { address: CUSTOMER, name: 'Kund' } },
    senderEmail: CUSTOMER,
    sentAt: '2025-01-01T10:00:00.000Z',
  },
];

function makeConnector() {
  const calls = [];
  return {
    calls,
    sendNewMessage: async () => ({ sentAt: 'now' }),
    sendReply: async (args) => {
      calls.push(args);
      return { id: 'draft-1' };
    },
  };
}

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

async function withAllowlist(value, fn) {
  const prev = process.env[ALLOWLIST_KEY];
  try {
    if (value === undefined) delete process.env[ALLOWLIST_KEY];
    else process.env[ALLOWLIST_KEY] = value;
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[ALLOWLIST_KEY];
    else process.env[ALLOWLIST_KEY] = prev;
  }
}

/**
 * @param {{requireAuth?:function, tenantScopeId?:string, connector?:object,
 *          messages?:object[]}} opts
 */
function makeApp({ requireAuth, tenantScopeId = '', connector, messages = MESSAGES } = {}) {
  const graphSendConnector = connector || makeConnector();
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoConversationRouter({
      ccoMailboxTruthStore: { listMessages: () => messages },
      requireAuth,
      graphSendConnector,
      graphSendAdapter: createCcoGraphSendAdapter(graphSendConnector),
      mailboxIdsForSync: [MAILBOX],
      shadowSendEnabled: false,
      sendTestRecipient: '',
      defaultTenantId: 'cco',
      tenantScopeId,
      authStore: {
        async addAuditEvent() {
          return true;
        },
      },
    })
  );
  return { app, graphSendConnector };
}

function replyReq(baseUrl, { role = 'owner', tenantId = 'hair-tp-clinic', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (role) headers['x-cco-role'] = role;
  if (tenantId) headers['x-tenant'] = tenantId;
  return fetch(`${baseUrl}/cco/runtime/conversation/${encodeURIComponent(CONV_KEY)}/reply`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || { body: 'Tack för ditt mejl.' }),
  });
}

// ── Auth / context / tenant ────────────────────────────────────────────────

test('T-001: oautentiserad reply nekas (401)', async () => {
  const { app } = makeApp({
    requireAuth: (req, res, next) => {
      if (!req.get('authorization')) return res.status(401).json({ error: 'unauthorized' });
      next();
    },
  });
  await withServer(app, async (baseUrl) => {
    const res = await replyReq(baseUrl, { role: null, tenantId: null });
    assert.equal(res.status, 401);
  });
});

test('T-002: aktör utan mail.live_send (finance) nekas (403)', async () => {
  const { app, graphSendConnector } = makeApp({
    requireAuth: (req, _res, next) => {
      req.auth = { tenantId: 'hair-tp-clinic', userId: 'u-1', role: 'finance' };
      next();
    },
  });
  await withAllowlist('contact@hairtpclinic.com', async () => {
    await withServer(app, async (baseUrl) => {
      const res = await replyReq(baseUrl, { role: 'finance' });
      assert.equal(res.status, 403);
      assert.equal((await res.json()).requiredPermission, 'mail.live_send');
    });
  });
  assert.equal(graphSendConnector.calls.length, 0, '403 ska ske före varje sändning');
});

test('T-003: främmande tenant nekas (tenant_scope_forbidden)', async () => {
  const { app, graphSendConnector } = makeApp({
    tenantScopeId: 'hair-tp-clinic',
    requireAuth: (req, _res, next) => {
      req.auth = { tenantId: 'another-clinic', userId: 'u-1', role: 'owner' };
      next();
    },
  });
  await withServer(app, async (baseUrl) => {
    const res = await replyReq(baseUrl, { role: 'owner', tenantId: 'another-clinic' });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'tenant_scope_forbidden');
  });
  assert.equal(graphSendConnector.calls.length, 0);
});

test('T-004: klient-tenant i body/header kringgår inte tenant-scope', async () => {
  const { app, graphSendConnector } = makeApp({
    tenantScopeId: 'hair-tp-clinic',
    requireAuth: (req, _res, next) => {
      req.auth = { tenantId: 'another-clinic', userId: 'u-1', role: 'owner' };
      next();
    },
  });
  await withServer(app, async (baseUrl) => {
    // Försök hävda rätt tenant i headern och i bodyn — verifierad auth vinner.
    const res = await replyReq(baseUrl, {
      role: 'owner',
      tenantId: 'hair-tp-clinic',
      body: { body: 'Hej', tenantId: 'hair-tp-clinic' },
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'tenant_scope_forbidden');
  });
  assert.equal(graphSendConnector.calls.length, 0);
});

// ── Deceased / sender / recipient ──────────────────────────────────────────

test('T-005: avliden mottagare nekas (SEND_BLOCKED → 500 send_failed, ej sent)', async () => {
  setDeceasedResolver(async ({ email }) => email === CUSTOMER);
  const { app, graphSendConnector } = makeApp({
    requireAuth: (req, _res, next) => {
      req.auth = { tenantId: 'hair-tp-clinic', userId: 'u-1', role: 'owner' };
      next();
    },
  });
  await withAllowlist('contact@hairtpclinic.com', async () => {
    await withServer(app, async (baseUrl) => {
      const res = await replyReq(baseUrl, { role: 'owner' });
      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.notEqual(body.sent, true, 'får aldrig påstå att utskicket skickats');
      assert.match(body.detail, /avliden/i);
    });
  });
  assert.equal(graphSendConnector.calls.length, 0, 'T-006: avliden mottagare → NOLL Graph-anrop');
});

test('T-007: icke-allowlistad avsändare nekas och ger NOLL Graph-anrop (T-008)', async () => {
  setDeceasedResolver(async () => false);
  // Konversationens brevlåda är INTE på allowlisten → blockeras.
  const { app, graphSendConnector } = makeApp({
    requireAuth: (req, _res, next) => {
      req.auth = { tenantId: 'hair-tp-clinic', userId: 'u-1', role: 'owner' };
      next();
    },
  });
  await withAllowlist('annan@hairtpclinic.com', async () => {
    await withServer(app, async (baseUrl) => {
      const res = await replyReq(baseUrl, { role: 'owner' });
      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.match(body.detail, /allowlistad/i);
    });
  });
  assert.equal(graphSendConnector.calls.length, 0);
});

// ── Client-supplied sender/recipient kan inte kringgå auktoritativt val ────

test('T-011/T-012: klientlevererad avsändare/mottagare ignoreras — auktoritativt val vinner', async () => {
  setDeceasedResolver(async () => false);
  const { app, graphSendConnector } = makeApp({
    requireAuth: (req, _res, next) => {
      req.auth = { tenantId: 'hair-tp-clinic', userId: 'u-1', role: 'owner' };
      next();
    },
  });
  await withAllowlist('contact@hairtpclinic.com', async () => {
    await withServer(app, async (baseUrl) => {
      const res = await replyReq(baseUrl, {
        role: 'owner',
        body: {
          body: 'Tack!',
          from: 'attacker@evil.example',
          sender: 'attacker@evil.example',
          to: 'victim@evil.example',
          recipient: 'victim@evil.example',
        },
      });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).sent, true);
    });
  });
  assert.equal(graphSendConnector.calls.length, 1);
  const sent = graphSendConnector.calls[0];
  assert.equal(sent.mailboxId, MAILBOX, 'avsändaren är konversationens brevlåda, ej klientens');
  assert.deepEqual(sent.to, [CUSTOMER], 'mottagaren är kundens adress, ej klientens');
  assert.notEqual(sent.mailboxId, 'attacker@evil.example');
  assert.notEqual(sent.to[0], 'victim@evil.example');
});

// ── Legitimate / error / static ────────────────────────────────────────────

test('T-013: legitimt auktoriserat svar anropar adaptern (connectorn) exakt en gång', async () => {
  setDeceasedResolver(async () => false);
  const { app, graphSendConnector } = makeApp({
    requireAuth: (req, _res, next) => {
      req.auth = { tenantId: 'hair-tp-clinic', userId: 'u-1', role: 'owner' };
      next();
    },
  });
  await withAllowlist('contact@hairtpclinic.com', async () => {
    await withServer(app, async (baseUrl) => {
      const res = await replyReq(baseUrl, { role: 'owner' });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.sent, true);
    });
  });
  assert.equal(graphSendConnector.calls.length, 1, 'exakt en sändning');
  assert.equal(graphSendConnector.calls[0].audience, 'customer');
});

test('T-014: adapterfel ger 500 send_failed (inget falskt sent/delivered)', async () => {
  setDeceasedResolver(async () => false);
  const connector = {
    calls: [],
    sendNewMessage: async () => ({}),
    sendReply: async () => {
      throw new Error('graph_down');
    },
  };
  const { app } = makeApp({
    connector,
    requireAuth: (req, _res, next) => {
      req.auth = { tenantId: 'hair-tp-clinic', userId: 'u-1', role: 'owner' };
      next();
    },
  });
  await withAllowlist('contact@hairtpclinic.com', async () => {
    await withServer(app, async (baseUrl) => {
      const res = await replyReq(baseUrl, { role: 'owner' });
      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(body.sent, undefined, 'inget falskt sent-tillstånd');
    });
  });
});

test('T-016: reply-rutten anropar INTE graphSendConnector.sendReply direkt', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'routes', 'ccoConversation.js'),
    'utf8'
  );
  // Den farliga formen: direkt anrop av den lågnivå-connectorn i sändvägen.
  assert.ok(
    !/graphSendConnector\.sendReply\s*\(/.test(src),
    'reply-rutten får inte anropa graphSendConnector.sendReply direkt'
  );
  // Den säkra formen måste finnas: den kanoniska adaptern.
  assert.match(src, /graphSendAdapter\.sendReply\s*\(/);
});
