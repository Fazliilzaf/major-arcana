'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const {
  createCcoConversationRouter,
  sanitizeReplyHtml,
} = require('../../src/routes/ccoConversation');
const { createCcoGraphSendAdapter } = require('../../src/infra/ccoGraphSendAdapter');

// P0-003 — skarpt svar går via den kanoniska adaptern, som kräver att
// avsändar-brevlådan står på ARCANA_GRAPH_SEND_ALLOWLIST (fail-closed).
process.env.ARCANA_GRAPH_SEND_ALLOWLIST = 'kons@hairtpclinic.com';

const passAuth = (_req, _res, next) => next();

function createMockMailboxTruthStore() {
  return {
    listMessages() {
      return [
        {
          id: 'msg-inbound-1',
          graphMessageId: 'graph-inbound-1',
          mailboxId: 'kons@hairtpclinic.com',
          conversationId: 'conv-1',
          folderType: 'inbox',
          subject: 'Hej',
          from: { emailAddress: { address: 'patient@example.com', name: 'Patient' } },
          senderEmail: 'patient@example.com',
          bodyPreview: 'Hej',
          receivedAt: '2026-01-15T10:00:00.000Z',
        },
      ];
    },
  };
}

function createMockGraphSendConnector() {
  const calls = [];
  return {
    _calls: calls,
    async sendReply(args) {
      calls.push(args);
      return { messageId: 'sent-1' };
    },
    async sendNewMessage(args) {
      calls.push(args);
      return { sentAt: 'now' };
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

function createRouter(overrides = {}) {
  const graphSendConnector = overrides.graphSendConnector || createMockGraphSendConnector();
  return createCcoConversationRouter({
    config: {
      defaultTenantId: 'hair-tp-clinic',
      ccoConversationMailboxIds: ['kons@hairtpclinic.com'],
    },
    mailboxIdsForSync: ['kons@hairtpclinic.com'],
    authStore: {
      async getSessionContextByToken() {
        return null;
      },
      async touchSession() {
        return true;
      },
      async appendConversationAudit() {},
    },
    authMiddleware: passAuth,
    requirePermission: () => (_req, _res, next) => next(),
    requireTenantScope: (_req, _res, next) => next(),
    ccoMailboxTruthStore: overrides.ccoMailboxTruthStore || createMockMailboxTruthStore(),
    graphSendConnector,
    // P0-003 — skarpt svar går via den kanoniska adaptern.
    graphSendAdapter: graphSendConnector ? createCcoGraphSendAdapter(graphSendConnector) : null,
    sendTestRecipient: null,
    shadowSendEnabled: false,
    markAnsweredCategoryEnabled: () => false,
    auditLog: null,
    logger: null,
  });
}

test('sanitizeReplyHtml: tillåter säker HTML', () => {
  const input = '<p>Hej!</p><p>Tack för ditt mejl.</p>';
  const out = sanitizeReplyHtml(input);
  assert.equal(out, input);
});

test('sanitizeReplyHtml: tar bort script-taggar och innehåll', () => {
  const input = '<p>Hej!</p><script>alert(1)</script><p>Hej då</p>';
  const out = sanitizeReplyHtml(input);
  assert.equal(out, '<p>Hej!</p><p>Hej då</p>');
});

test('sanitizeReplyHtml: tar bort event handlers', () => {
  const input = '<p onclick="alert(1)" onload="steal()">Hej</p>';
  const out = sanitizeReplyHtml(input);
  assert.equal(out, '<p>Hej</p>');
});

test('sanitizeReplyHtml: tar bort style-attribut', () => {
  const input = '<p style="background:url(javascript:alert(1))">Hej</p>';
  const out = sanitizeReplyHtml(input);
  assert.equal(out, '<p>Hej</p>');
});

test('sanitizeReplyHtml: blockerar farliga href-scheman', () => {
  const input = '<a href="javascript:alert(1)">klick</a><a href="https://example.com">ok</a>';
  const out = sanitizeReplyHtml(input);
  assert.equal(out, '<a>klick</a><a href="https://example.com">ok</a>');
});

test('sanitizeReplyHtml: tar bort iframe, object, form', () => {
  const input =
    '<iframe src="https://evil.com"></iframe><object data="evil.swf"></object><form><input></form>';
  const out = sanitizeReplyHtml(input);
  assert.equal(out, '');
});

test('sanitizeReplyHtml: tar bort HTML-kommentarer', () => {
  const input = '<p>Hej</p><!-- <script>alert(1)</script> --><p>då</p>';
  const out = sanitizeReplyHtml(input);
  assert.equal(out, '<p>Hej</p><p>då</p>');
});

test('sanitizeReplyHtml: behåller tillåtna taggar', () => {
  const input =
    '<div><h1>Rubrik</h1><ul><li><strong>fet</strong></li></ul><blockquote>citat</blockquote><pre>kod</pre></div>';
  const out = sanitizeReplyHtml(input);
  assert.equal(out, input);
});

test('sanitizeReplyHtml: tar bort otillåtna taggar men behåller innehåll', () => {
  const input = '<p>Hej <img src="https://example.com/x.png"> då</p>';
  const out = sanitizeReplyHtml(input);
  assert.equal(out, '<p>Hej  då</p>');
});

test('/reply sanerar bodyHtml innan Graph-sändning', async () => {
  const graphSendConnector = createMockGraphSendConnector();
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter({ graphSendConnector }));

  await withServer(app, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco/runtime/conversation/${encodeURIComponent('kons@hairtpclinic.com:conv-1')}/reply`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'owner' },
        body: JSON.stringify({
          body: 'Tack för ditt mejl.',
          bodyHtml: '<p>Tack</p><script>alert(1)</script><p onclick="x">Hej</p>',
        }),
      }
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(graphSendConnector._calls.length, 1);
    const sentHtml = graphSendConnector._calls[0].bodyHtml;
    assert.ok(!sentHtml.includes('<script>'));
    assert.ok(!sentHtml.includes('onclick'));
    assert.ok(sentHtml.includes('<p>Tack</p>'));
    assert.ok(sentHtml.includes('<p>Hej</p>'));
  });
});

test('/reply kräver body', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createRouter());

  await withServer(app, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco/runtime/conversation/${encodeURIComponent('kons@hairtpclinic.com:conv-1')}/reply`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'owner' },
        body: JSON.stringify({ bodyHtml: '<p>Tack</p>' }),
      }
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'missing_body');
  });
});
