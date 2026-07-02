'use strict';

/* E1 steg 1 — shadow/dry-run för live-send av svar.
 *
 * Reply-endpointen (/cco/runtime/conversation/:key/reply, owner-only
 * mail.live_send) körs fullt ut i shadow-läge men skickar ALDRIG: den
 * returnerar wouldSend och rör aldrig graphSendConnector. Skarpt utskick kräver
 * shadowSendEnabled=false + en connector. Detta gör att flödet kan verifieras i
 * skarp miljö utan att något mejl går ut. */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const { createCcoConversationRouter } = require('../../src/routes/ccoConversation');

const CONV_KEY = 'conv-shadow-1';
const MESSAGES = [
  {
    mailboxConversationId: CONV_KEY,
    conversationId: 'graph-conv-1',
    graphMessageId: 'graph-msg-1',
    mailboxId: 'contact@hairtpclinic.com',
    folderType: 'inbox', // → inbound
    subject: 'Fråga om pris',
    from: { emailAddress: { address: 'kund@example.com' } },
    sentAt: '2025-01-01T10:00:00.000Z',
  },
];

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

function makeApp({
  shadowSendEnabled = false,
  graphSendConnector = null,
  sendTestRecipient = '',
} = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoConversationRouter({
      ccoMailboxTruthStore: { listMessages: () => MESSAGES },
      graphSendConnector,
      shadowSendEnabled,
      sendTestRecipient,
      defaultTenantId: 'cco',
    })
  );
  return app;
}

function captureConnector() {
  const calls = [];
  return {
    calls,
    sendReply(args) {
      calls.push(args);
      return { id: `sent-${calls.length}` };
    },
  };
}

function replyReq(baseUrl, role = 'owner', body = 'Hej, tack för ditt mejl!') {
  return fetch(`${baseUrl}/cco/runtime/conversation/${CONV_KEY}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cco-role': role },
    body: JSON.stringify({ body }),
  });
}

// ── 1. Shadow utan connector → dry-run, inget skickas ────────────────────────

test('E1: shadow-läge svarar 200 med wouldSend och rör inte connectorn (null connector)', async () => {
  const app = makeApp({ shadowSendEnabled: true, graphSendConnector: null });
  await withServer(app, async (baseUrl) => {
    const res = await replyReq(baseUrl);
    assert.equal(res.status, 200, 'shadow ska INTE 503:a trots saknad connector');
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, 'shadow');
    assert.equal(payload.sent, false);
    assert.equal(payload.recipient, 'kund@example.com');
    assert.equal(payload.mailboxId, 'contact@hairtpclinic.com');
    assert.equal(payload.replyToMessageId, 'graph-msg-1');
    assert.ok(payload.wouldSend, 'wouldSend ska finnas');
    assert.equal(payload.wouldSend.subject, 'Fråga om pris');
    assert.ok(payload.wouldSend.bodyPreview.length > 0);
  });
});

// ── 2. Shadow anropar aldrig connector.sendReply ─────────────────────────────

test('E1: shadow-läge anropar aldrig graphSendConnector.sendReply', async () => {
  let sendCalls = 0;
  const connector = {
    sendReply() {
      sendCalls += 1;
      return { id: 'should-not-happen' };
    },
  };
  const app = makeApp({ shadowSendEnabled: true, graphSendConnector: connector });
  await withServer(app, async (baseUrl) => {
    const res = await replyReq(baseUrl);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.mode, 'shadow');
    assert.equal(payload.sent, false);
  });
  assert.equal(sendCalls, 0, 'sendReply får ALDRIG anropas i shadow-läge');
});

// ── 3. Icke-shadow utan connector → 503 (bevarat beteende) ───────────────────

test('E1: utan shadow och utan connector → 503 graph_send_unavailable', async () => {
  const app = makeApp({ shadowSendEnabled: false, graphSendConnector: null });
  await withServer(app, async (baseUrl) => {
    const res = await replyReq(baseUrl);
    assert.equal(res.status, 503);
    const payload = await res.json();
    assert.equal(payload.error, 'graph_send_unavailable');
  });
});

// ── 4. Skarpt läge anropar connector och rapporterar mode:live ───────────────

test('E1: utan shadow med connector → skarp sändning (mode:live, sendReply anropas)', async () => {
  let sendCalls = 0;
  let lastArgs = null;
  const connector = {
    sendReply(args) {
      sendCalls += 1;
      lastArgs = args;
      return { id: 'sent-123' };
    },
  };
  const app = makeApp({ shadowSendEnabled: false, graphSendConnector: connector });
  await withServer(app, async (baseUrl) => {
    const res = await replyReq(baseUrl);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.mode, 'live');
    assert.equal(payload.sent, true);
    assert.deepEqual(payload.sendResult, { id: 'sent-123' });
  });
  assert.equal(sendCalls, 1, 'sendReply ska anropas exakt en gång i skarpt läge');
  assert.equal(lastArgs.to[0], 'kund@example.com');
});

// ── 5. Owner-only-grinden gäller fortfarande i shadow-läge ───────────────────

test('E1: shadow ändrar inte RBAC — operator nekas (mail.live_send owner-only)', async () => {
  const app = makeApp({ shadowSendEnabled: true, graphSendConnector: null });
  await withServer(app, async (baseUrl) => {
    const res = await replyReq(baseUrl, 'operator');
    assert.equal(res.status, 403);
    const payload = await res.json();
    assert.equal(payload.requiredPermission, 'mail.live_send');
  });
});

// ── 6. Settings-info speglar shadow-läget ────────────────────────────────────

test('E1: settings/info rapporterar send.mode=shadow och shadow=true', async () => {
  const app = makeApp({ shadowSendEnabled: true, graphSendConnector: null });
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/runtime/settings/info`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.send.shadow, true);
    assert.equal(payload.send.mode, 'shadow');
    assert.equal(payload.send.enabled, false, 'shadow är inte skarp sändning');
  });
});

// ── E1 steg 2 — skarpt utskick omdirigerat till ägar-testadress ──────────────

const TEST_ADDR = 'agare-test@hairtpclinic.com';

test('E1 steg 2: test-redirect skickar skarpt men tvingar mottagaren till testadressen', async () => {
  const connector = captureConnector();
  const app = makeApp({ graphSendConnector: connector, sendTestRecipient: TEST_ADDR });
  await withServer(app, async (baseUrl) => {
    const res = await replyReq(baseUrl);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.mode, 'live_test');
    assert.equal(payload.sent, true);
    assert.equal(payload.testRedirect, true);
    assert.equal(payload.recipient, TEST_ADDR, 'mottagaren är testadressen');
    assert.equal(
      payload.intendedRecipient,
      'kund@example.com',
      'kundens adress bevaras som avsedd'
    );
  });
  assert.equal(connector.calls.length, 1, 'exakt en skarp sändning');
  assert.deepEqual(connector.calls[0].to, [TEST_ADDR], 'Graph får ENDAST testadressen');
  assert.notEqual(
    connector.calls[0].to[0],
    'kund@example.com',
    'kunden får ALDRIG mejlet i test-redirect'
  );
  assert.match(connector.calls[0].subject, /^\[ARCANA TEST → kund@example\.com\]/);
});

test('E1 steg 2: shadow har företräde över test-redirect (inget skickas)', async () => {
  const connector = captureConnector();
  const app = makeApp({
    shadowSendEnabled: true,
    graphSendConnector: connector,
    sendTestRecipient: TEST_ADDR,
  });
  await withServer(app, async (baseUrl) => {
    const res = await replyReq(baseUrl);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.mode, 'shadow');
    assert.equal(payload.sent, false);
  });
  assert.equal(connector.calls.length, 0, 'shadow vinner → ingen sändning trots testadress');
});

test('E1 steg 2: utan connector men med testadress → 503 (test-redirect kräver skarp connector)', async () => {
  const app = makeApp({ graphSendConnector: null, sendTestRecipient: TEST_ADDR });
  await withServer(app, async (baseUrl) => {
    const res = await replyReq(baseUrl);
    assert.equal(res.status, 503);
    const payload = await res.json();
    assert.equal(payload.error, 'graph_send_unavailable');
  });
});

test('E1 steg 2: settings/info rapporterar send.mode=live_test när testadress är satt', async () => {
  const connector = captureConnector();
  const app = makeApp({ graphSendConnector: connector, sendTestRecipient: TEST_ADDR });
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco/runtime/settings/info`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.send.mode, 'live_test');
    assert.equal(payload.send.testRedirect, true);
    assert.equal(payload.send.enabled, true);
  });
});
