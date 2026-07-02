'use strict';

/* D1 — bulk preview → confirm för konversations-actions.
 *
 *   1. preview muterar inget
 *   2. confirm muterar rätt trådar
 *   3. conflict/suggested/unmatched (unconfirmed identity) blockas
 *   4. permission saknas → 403
 *   5. audit skrivs (batchId, actor, action, antal, affected thread ids)
 *   6. partial failure hanteras säkert
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createCcoConversationRouter } = require('../../src/routes/ccoConversation');
const { createCcoConversationStateStore } = require('../../src/ops/ccoConversationStateStore');

const CONFIRMED = (key, mailbox) => ({
  mailboxConversationId: key,
  mailboxId: mailbox,
  senderEmail: 'kund@test.se',
  folderType: 'inbox',
  sentAt: '2025-01-01T10:00:00.000Z',
  conversationId: key,
  customerIdentity: {
    canonicalCustomerId: 'p-1',
    identityProvenance: { matchStatus: 'MATCHED' },
  },
});

const MESSAGES = [
  CONFIRMED('conv-bulk-1', 'info@clinic.se'),
  CONFIRMED('conv-bulk-2', 'boka@clinic.se'),
  // Ingen bekräftad identitet → suggested/unmatched → blockas
  {
    mailboxConversationId: 'conv-unconfirmed',
    mailboxId: 'info@clinic.se',
    senderEmail: 'gissning@test.se',
    folderType: 'inbox',
    sentAt: '2025-01-01T10:00:00.000Z',
  },
  // Systemmail/brus → blockas
  {
    mailboxConversationId: 'conv-system',
    mailboxId: 'info@clinic.se',
    senderEmail: 'no-reply@brus.se',
    folderType: 'inbox',
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

async function createFixture({ wrapState } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-bulk-'));
  const auditEvents = [];
  let conversationStateStore = await createCcoConversationStateStore({
    filePath: path.join(tempDir, 'conv-state.json'),
  });
  if (typeof wrapState === 'function') {
    conversationStateStore = wrapState(conversationStateStore);
  }
  const app = express();
  app.use(express.json());
  app.use(
    '/api/v1',
    createCcoConversationRouter({
      ccoMailboxTruthStore: { listMessages: () => MESSAGES },
      ccoConversationStateStore: conversationStateStore,
      defaultTenantId: 'cco',
      authStore: {
        async addAuditEvent(event) {
          auditEvents.push(event);
          return true;
        },
      },
    })
  );
  return { app, tempDir, auditEvents, conversationStateStore };
}

function post(baseUrl, route, body, role = 'operator') {
  const headers = { 'content-type': 'application/json' };
  if (role) headers['x-cco-role'] = role;
  return fetch(`${baseUrl}${route}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

const ALL_ITEMS = [
  { conversationKey: 'conv-bulk-1', customerId: 'kund@test.se' },
  { conversationKey: 'conv-bulk-2', customerId: 'kund@test.se' },
  { conversationKey: 'conv-unconfirmed', customerId: 'gissning@test.se' },
  { conversationKey: 'conv-system', customerId: 'no-reply@brus.se' },
];

// ── 1. preview muterar inget ─────────────────────────────────────────────────

test('D1: preview visar påverkade trådar + varningar och muterar INGET state', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await post(baseUrl, '/cco/runtime/conversation/bulk/preview', {
        action: 'handled',
        items: ALL_ITEMS,
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.batchId, 'batchId ska returneras');
      assert.equal(body.summary.eligible, 2);
      assert.equal(body.summary.ineligible, 2);

      const byKey = Object.fromEntries(body.items.map((r) => [r.conversationKey, r]));
      assert.equal(byKey['conv-bulk-1'].eligible, true);
      assert.equal(byKey['conv-bulk-1'].mailbox, 'info@clinic.se');
      assert.equal(byKey['conv-bulk-2'].eligible, true);
      assert.ok(byKey['conv-unconfirmed'].warnings.includes('unconfirmed_identity'));
      assert.ok(byKey['conv-system'].warnings.includes('system_mail'));
    });

    // Ingen mutation: state saknas fortfarande.
    const state = await fixture.conversationStateStore.getActiveState({
      tenantId: 'cco',
      canonicalConversationKey: 'conv-bulk-1',
    });
    assert.equal(state, null, 'preview får inte skriva state');
    assert.equal(fixture.auditEvents.length, 0, 'preview auditar inte mutation');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// ── 2 + 3 + 5. confirm muterar rätt trådar, blockar unconfirmed, auditar ─────

test('D1: confirm muterar endast behöriga trådar, blockar unconfirmed/system och auditar batch', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await post(baseUrl, '/cco/runtime/conversation/bulk/confirm', {
        action: 'handled',
        batchId: 'batch-1',
        confirm: true,
        items: ALL_ITEMS,
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.applied.sort(), ['conv-bulk-1', 'conv-bulk-2']);
      assert.equal(body.summary.applied, 2);
      assert.equal(body.summary.skipped, 2);
      const skippedKeys = body.skipped.map((s) => s.conversationKey).sort();
      assert.deepEqual(skippedKeys, ['conv-system', 'conv-unconfirmed']);
    });

    // Behöriga trådar muterade
    const s1 = await fixture.conversationStateStore.getActiveState({
      tenantId: 'cco',
      canonicalConversationKey: 'conv-bulk-1',
    });
    assert.equal(s1?.actionState, 'handled');
    // Unconfirmed tråd ALDRIG muterad
    const sU = await fixture.conversationStateStore.getActiveState({
      tenantId: 'cco',
      canonicalConversationKey: 'conv-unconfirmed',
    });
    assert.equal(sU, null, 'unconfirmed tråd får aldrig muteras');

    // Audit: en batch-post
    const audit = fixture.auditEvents.find((e) => e.action === 'cco.conversation.bulk_handled');
    assert.ok(audit, 'batch-audit ska skrivas');
    assert.equal(audit.metadata.batchId, 'batch-1');
    assert.equal(audit.metadata.appliedCount, 2);
    assert.equal(audit.metadata.skippedCount, 2);
    assert.deepEqual(audit.metadata.affectedThreadIds.sort(), ['conv-bulk-1', 'conv-bulk-2']);
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('D1: confirm utan confirm=true muterar inget (400 confirmation_required)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await post(baseUrl, '/cco/runtime/conversation/bulk/confirm', {
        action: 'handled',
        batchId: 'batch-x',
        items: [{ conversationKey: 'conv-bulk-1', customerId: 'kund@test.se' }],
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error, 'confirmation_required');
    });
    const s1 = await fixture.conversationStateStore.getActiveState({
      tenantId: 'cco',
      canonicalConversationKey: 'conv-bulk-1',
    });
    assert.equal(s1, null, 'ingen mutation utan explicit confirm');
    assert.equal(fixture.auditEvents.length, 0);
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// ── 4. permission saknas → 403 ───────────────────────────────────────────────

test('D1: konsult (saknar mail.write) → 403 på både preview och confirm', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const preview = await post(
        baseUrl,
        '/cco/runtime/conversation/bulk/preview',
        { action: 'handled', items: ALL_ITEMS },
        'konsult'
      );
      assert.equal(preview.status, 403);
      const confirm = await post(
        baseUrl,
        '/cco/runtime/conversation/bulk/confirm',
        { action: 'handled', batchId: 'b', confirm: true, items: ALL_ITEMS },
        'konsult'
      );
      assert.equal(confirm.status, 403);
    });
    assert.equal(fixture.auditEvents.length, 0, 'ingen audit vid nekad behörighet');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// ── 6. partial failure hanteras säkert ───────────────────────────────────────

test('D1: partial failure — en tråds fel stoppar inte övriga och batchen auditar ändå', async () => {
  const fixture = await createFixture({
    wrapState: (store) => ({
      ...store,
      writeConversationState: async (input) => {
        if (input.canonicalConversationKey === 'conv-bulk-2') {
          throw new Error('simulerat skrivfel');
        }
        return store.writeConversationState(input);
      },
    }),
  });
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await post(baseUrl, '/cco/runtime/conversation/bulk/confirm', {
        action: 'handled',
        batchId: 'batch-partial',
        confirm: true,
        items: [
          { conversationKey: 'conv-bulk-1', customerId: 'kund@test.se' },
          { conversationKey: 'conv-bulk-2', customerId: 'kund@test.se' },
        ],
      });
      assert.equal(res.status, 200, 'partial failure ger ändå ett kontrollerat svar');
      const body = await res.json();
      assert.deepEqual(body.applied, ['conv-bulk-1']);
      assert.equal(body.summary.failed, 1);
      assert.equal(body.failed[0].conversationKey, 'conv-bulk-2');
    });

    const s1 = await fixture.conversationStateStore.getActiveState({
      tenantId: 'cco',
      canonicalConversationKey: 'conv-bulk-1',
    });
    assert.equal(s1?.actionState, 'handled', 'friska tråden muteras');

    const audit = fixture.auditEvents.find((e) => e.action === 'cco.conversation.bulk_handled');
    assert.ok(audit, 'batch auditas trots partiellt fel');
    assert.equal(audit.metadata.appliedCount, 1);
    assert.equal(audit.metadata.failedCount, 1);
    assert.deepEqual(audit.metadata.affectedThreadIds, ['conv-bulk-1']);
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
