'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoConversationRouter } = require('../../src/routes/ccoConversation');
const { createCcoConversationStateStore } = require('../../src/ops/ccoConversationStateStore');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const KNOWN_MESSAGES = [
  {
    mailboxConversationId: 'conv-c5-handled',
    senderEmail: 'kund-c5@test.se',
    folderType: 'inbox',
    sentAt: '2025-01-01T10:00:00.000Z',
  },
  {
    mailboxConversationId: 'conv-c5-later',
    senderEmail: 'kund-c5@test.se',
    folderType: 'inbox',
    sentAt: '2025-01-01T10:00:00.000Z',
  },
  {
    mailboxConversationId: 'conv-c5-reopen',
    senderEmail: 'kund-c5@test.se',
    folderType: 'inbox',
    sentAt: '2025-01-01T10:00:00.000Z',
  },
  {
    mailboxConversationId: 'conv-c5-later-default',
    senderEmail: 'kund-c5@test.se',
    folderType: 'inbox',
    sentAt: '2025-01-01T10:00:00.000Z',
  },
  {
    mailboxConversationId: 'conv-c5-wrong-customer',
    senderEmail: 'annan-kund@test.se',
    folderType: 'inbox',
    sentAt: '2025-01-01T10:00:00.000Z',
  },
];

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-c5-action-'));
  const auditEvents = [];

  const conversationStateStore = await createCcoConversationStateStore({
    filePath: path.join(tempDir, 'conv-state.json'),
  });

  const mailboxTruthStore = {
    listMessages: () => KNOWN_MESSAGES,
  };

  const authStore = {
    async getSessionContextByToken() {
      return null;
    },
    async touchSession() {
      return true;
    },
    async addAuditEvent(event) {
      auditEvents.push(event);
      return true;
    },
  };

  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoConversationRouter({
      ccoMailboxTruthStore: mailboxTruthStore,
      ccoConversationStateStore: conversationStateStore,
      defaultTenantId: 'cco',
      authStore,
    })
  );

  return { app, tempDir, auditEvents, conversationStateStore };
}

// ── C5 test scenarios ─────────────────────────────────────────────────────────

test('C5: Klar → sparar handled-status och audit-loggar actor + customerId', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/conv-c5-handled/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
        body: JSON.stringify({
          action: 'handled',
          customerId: 'kund-c5@test.se',
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.action, 'handled');
    });

    const auditEvent = fixture.auditEvents.find((e) => e.action === 'cco.conversation.handled');
    assert.ok(auditEvent, 'audit-event för handled ska finnas');
    assert.equal(auditEvent.metadata.customerId, 'kund-c5@test.se');
    assert.equal(auditEvent.metadata.conversationKey, 'conv-c5-handled');
    assert.equal(auditEvent.metadata.action, 'handled');
    assert.ok(auditEvent.metadata.actionAt, 'actionAt ska finnas');

    // Verifiera att state sparades
    const savedState = await fixture.conversationStateStore.getActiveState({
      tenantId: 'cco',
      canonicalConversationKey: 'conv-c5-handled',
    });
    assert.equal(savedState?.actionState, 'handled');
    assert.equal(savedState?.needsReplyStatusOverride, 'handled');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C5: Senare → sparar snoozed/followUpDueAt och audit-loggar', async () => {
  const fixture = await createFixture();
  const followUpDueAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/conv-c5-later/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
        body: JSON.stringify({
          action: 'reply_later',
          customerId: 'kund-c5@test.se',
          followUpDueAt,
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.action, 'reply_later');
    });

    const auditEvent = fixture.auditEvents.find((e) => e.action === 'cco.conversation.reply_later');
    assert.ok(auditEvent, 'audit-event för reply_later ska finnas');
    assert.equal(auditEvent.metadata.customerId, 'kund-c5@test.se');
    assert.equal(auditEvent.metadata.followUpDueAt, followUpDueAt);

    const savedState = await fixture.conversationStateStore.getActiveState({
      tenantId: 'cco',
      canonicalConversationKey: 'conv-c5-later',
    });
    assert.equal(savedState?.actionState, 'reply_later');
    assert.equal(savedState?.followUpDueAt, followUpDueAt);
    assert.equal(savedState?.waitingOn, 'customer');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C5: Reopen → supersederar befintligt state och audit-loggar', async () => {
  const fixture = await createFixture();
  try {
    // Skapa handled-state först
    await fixture.conversationStateStore.writeConversationState({
      tenantId: 'cco',
      canonicalConversationKey: 'conv-c5-reopen',
      canonicalConversationSource: 'mailbox_conversation_fallback',
      canonicalConversationType: 'conversationKey',
      actionState: 'handled',
      needsReplyStatusOverride: 'handled',
      followUpDueAt: null,
      waitingOn: null,
      nextActionLabel: 'Markerad som klar',
      nextActionSummary: null,
      actionAt: new Date().toISOString(),
      actionByUserId: null,
      actionByEmail: null,
    });

    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/conv-c5-reopen/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
        body: JSON.stringify({
          action: 'reopen',
          customerId: 'kund-c5@test.se',
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.action, 'reopen');
    });

    const auditEvent = fixture.auditEvents.find((e) => e.action === 'cco.conversation.reopen');
    assert.ok(auditEvent, 'audit-event för reopen ska finnas');
    assert.equal(auditEvent.metadata.customerId, 'kund-c5@test.se');
    assert.equal(auditEvent.metadata.conversationKey, 'conv-c5-reopen');

    // State ska vara superseded (inget aktivt state)
    const activeState = await fixture.conversationStateStore.getActiveState({
      tenantId: 'cco',
      canonicalConversationKey: 'conv-c5-reopen',
    });
    assert.equal(activeState, null, 'inget aktivt state ska finnas efter reopen');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C5: returnerar 400 när customerId saknas (skyddar mot fel kund)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/conv-c5-nocustomer/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
        body: JSON.stringify({
          action: 'handled',
          // customerId saknas
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error, 'felbeskrivning ska finnas');
      assert.match(body.error, /customer/i);
    });

    assert.equal(
      fixture.auditEvents.some((e) => e.action?.startsWith('cco.conversation.')),
      false,
      'inget audit-event ska skapas när blockerat'
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C5: returnerar 400 för okänd action (skyddar mot felaktig tråd-mutation)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/conv-c5-badaction/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
        body: JSON.stringify({
          action: 'delete_everything',
          customerId: 'kund-c5@test.se',
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error, 'felbeskrivning ska finnas');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C5: Senare utan explicit followUpDueAt defaultar till nu+24h', async () => {
  const fixture = await createFixture();
  const before = Date.now();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/conv-c5-later-default/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
        body: JSON.stringify({
          action: 'reply_later',
          customerId: 'kund-c5@test.se',
          // followUpDueAt saknas
        }),
      });

      assert.equal(res.status, 200);
    });

    const savedState = await fixture.conversationStateStore.getActiveState({
      tenantId: 'cco',
      canonicalConversationKey: 'conv-c5-later-default',
    });
    assert.ok(savedState?.followUpDueAt, 'followUpDueAt ska vara satt');
    const dueMs = Date.parse(savedState.followUpDueAt);
    const expectedMin = before + 23 * 60 * 60 * 1000;
    const expectedMax = Date.now() + 25 * 60 * 60 * 1000;
    assert.ok(
      dueMs >= expectedMin && dueMs <= expectedMax,
      `followUpDueAt (${savedState.followUpDueAt}) ska vara ca 24h framåt`
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C5: returnerar 404 för okänd konversationsnyckel (handled)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/okand-konversation-xyz/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
        body: JSON.stringify({ action: 'handled', customerId: 'kund-c5@test.se' }),
      });
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.equal(body.error, 'conversation_not_found');
    });
    assert.equal(
      fixture.auditEvents.some((e) => e.action?.startsWith('cco.conversation.')),
      false,
      'inget audit-event ska skapas för okänd konversation'
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C5: returnerar 404 för okänd konversationsnyckel (reopen)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/okand-konversation-xyz/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
        body: JSON.stringify({ action: 'reopen', customerId: 'kund-c5@test.se' }),
      });
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.equal(body.error, 'conversation_not_found');
    });
    assert.equal(
      fixture.auditEvents.some((e) => e.action?.startsWith('cco.conversation.')),
      false,
      'inget audit-event ska skapas för okänd konversation'
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C5: returnerar 409 när customerId inte matchar konversationens kund (handled)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/conv-c5-wrong-customer/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
        body: JSON.stringify({ action: 'handled', customerId: 'fel-kund@test.se' }),
      });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.error, 'customer_mismatch');
    });
    assert.equal(
      fixture.auditEvents.some((e) => e.action?.startsWith('cco.conversation.')),
      false,
      'inget audit-event ska skapas vid customerId-mismatch'
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('C5: returnerar 409 när customerId inte matchar konversationens kund (reopen)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/conv-c5-wrong-customer/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
        body: JSON.stringify({ action: 'reopen', customerId: 'fel-kund@test.se' }),
      });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.error, 'customer_mismatch');
    });
    assert.equal(
      fixture.auditEvents.some((e) => e.action?.startsWith('cco.conversation.')),
      false,
      'inget audit-event ska skapas vid customerId-mismatch'
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
