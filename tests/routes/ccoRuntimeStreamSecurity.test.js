'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const test = require('node:test');

const { createCcoRuntimeStreamRouter } = require('../../src/routes/ccoRuntimeStream');

const TENANT_ID = 'hair-tp-clinic';
const CONTACT_MAILBOX_ID = 'contact@hairtpclinic.com';
const FAZLI_MAILBOX_ID = 'fazli@hairtpclinic.com';

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

function parseSseEnvelope(raw) {
  const lines = String(raw || '').split('\n');
  const event =
    lines
      .find((line) => line.startsWith('event:'))
      ?.slice(6)
      .trim() || 'message';
  const rawData = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  return { event, data: rawData ? JSON.parse(rawData) : {} };
}

async function readSseUntil(response, predicate, { timeoutMs = 2000 } = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let buffer = '';
  try {
    while (Date.now() < deadline) {
      const remainingMs = Math.max(1, deadline - Date.now());
      let timer;
      const chunk = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('SSE timeout')), remainingMs);
        }),
      ]);
      clearTimeout(timer);
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const envelope = parseSseEnvelope(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (predicate(envelope)) return envelope;
        boundary = buffer.indexOf('\n\n');
      }
    }
    throw new Error('SSE timeout');
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Connection is already closed.
    }
  }
}

function createFixture() {
  const tokens = {
    owner: { tenantId: TENANT_ID, role: 'owner' },
    operator: { tenantId: TENANT_ID, role: 'operator' },
    personal: { tenantId: TENANT_ID, role: 'personal' },
    otherTenant: { tenantId: 'other-clinic', role: 'owner' },
  };
  const app = express();
  const router = createCcoRuntimeStreamRouter({
    pollIntervalMs: 60_000,
    heartbeatIntervalMs: 60_000,
    tenantScopeId: TENANT_ID,
    mailboxIds: [CONTACT_MAILBOX_ID, FAZLI_MAILBOX_ID],
    requireAuth(req, res, next) {
      const token = /^Bearer (.+)$/.exec(String(req.get('authorization') || ''))?.[1];
      const auth = tokens[token];
      if (!auth) return res.status(401).json({ error: 'unauthorized' });
      req.auth = auth;
      return next();
    },
  });
  app.use('/api/v1', router);
  return { app, router };
}

function getStream(baseUrl, token = '') {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  return fetch(`${baseUrl}/cco/runtime/stream`, { headers });
}

test('CCO runtime stream fails closed when its auth middleware is not configured', async () => {
  const app = express();
  app.use(
    '/api/v1',
    createCcoRuntimeStreamRouter({
      tenantScopeId: TENANT_ID,
      mailboxIds: [CONTACT_MAILBOX_ID],
    })
  );
  await withServer(app, async (baseUrl) => {
    const response = await getStream(baseUrl, 'owner');
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'cco_stream_auth_unavailable');
  });
});

test('CCO runtime stream fails closed for missing auth, wrong tenant, and missing mail.read', async () => {
  const fixture = createFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const missingAuth = await getStream(baseUrl);
    assert.equal(missingAuth.status, 401);

    const wrongTenant = await getStream(baseUrl, 'otherTenant');
    assert.equal(wrongTenant.status, 403);
    assert.equal((await wrongTenant.json()).error, 'tenant_scope_forbidden');

    const wrongRole = await getStream(baseUrl, 'personal');
    assert.equal(wrongRole.status, 403);
    assert.equal((await wrongRole.json()).requiredPermission, 'mail.read');
  });
});

test('CCO runtime stream permits a scoped mail.read user and strips unscoped broadcast metadata', async () => {
  const fixture = createFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const response = await getStream(baseUrl, 'operator');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/event-stream/);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    const connected = parseSseEnvelope(decoder.decode(first.value));
    assert.equal(connected.event, 'connected');

    fixture.router.broadcast('worklist_updated', {
      mailboxIds: [CONTACT_MAILBOX_ID, 'outside@other-clinic.example'],
      failedMailboxIds: [FAZLI_MAILBOX_ID, 'outside@other-clinic.example'],
      error: 'confidential sync error',
      conversationKey: 'private-conversation-key',
      draftId: 'private-draft-id',
    });

    let buffer = '';
    const broadcast = await (async () => {
      while (true) {
        const chunk = await reader.read();
        assert.equal(chunk.done, false);
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
        const boundary = buffer.indexOf('\n\n');
        if (boundary === -1) continue;
        const envelope = parseSseEnvelope(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (envelope.event === 'worklist_updated') return envelope;
      }
    })();
    await reader.cancel();

    assert.deepEqual(broadcast.data, {
      mailboxIds: [CONTACT_MAILBOX_ID],
      failedMailboxIds: [FAZLI_MAILBOX_ID],
    });
    assert.equal(JSON.stringify(broadcast.data).includes('confidential'), false);
    assert.equal(JSON.stringify(broadcast.data).includes('private-'), false);
  });
});

test('CCO runtime stream does not emit off-scope mailbox events', async () => {
  const fixture = createFixture();
  await withServer(fixture.app, async (baseUrl) => {
    const response = await getStream(baseUrl, 'owner');
    assert.equal(response.status, 200);

    const eventPromise = readSseUntil(
      response,
      (envelope) => envelope.event === 'worklist_updated',
      {
        timeoutMs: 120,
      }
    );
    fixture.router.broadcast('worklist_updated', {
      mailboxIds: ['outside@other-clinic.example'],
      error: 'must never leave server',
    });
    await assert.rejects(eventPromise, /SSE timeout/);
  });
});
