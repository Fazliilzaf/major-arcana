'use strict';

/* C1 — Explicit RBAC på konversations-routes.
 *
 * Verifierar att /cco/runtime/conversation/:key/* gate:as med rätt permission:
 *  - läsning (messages)   → mail.read   (owner/operator/konsult)
 *  - triage-write (action)→ mail.write  (owner/operator)
 *
 * Rollerna sätts via x-cco-role-headern (honoreras bara utanför production).
 * Permission-kartan (src/security/ccoRbac.js):
 *   personal → varken mail.read eller mail.write
 *   konsult  → mail.read men INTE mail.write   (read-only för triage)
 *   operator → mail.read + mail.write
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

const CUSTOMER = 'rbac-kund@test.se';
const CONV_KEY = 'conv-rbac-1';
const MESSAGES = [
  {
    mailboxConversationId: CONV_KEY,
    senderEmail: CUSTOMER,
    mailboxId: 'kons@hairtpclinic.com',
    mailboxAddress: 'kons@hairtpclinic.com',
    folderType: 'inbox',
    sentAt: '2025-01-01T10:00:00.000Z',
  },
];

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-rbac-'));
  const auditEvents = [];
  const conversationStateStore = await createCcoConversationStateStore({
    filePath: path.join(tempDir, 'conv-state.json'),
  });
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
  return { app, tempDir, auditEvents };
}

function readReq(baseUrl, role) {
  const headers = {};
  if (role) headers['x-cco-role'] = role;
  return fetch(`${baseUrl}/cco/runtime/conversation/${CONV_KEY}/messages`, { headers });
}

function actionReq(baseUrl, role) {
  const headers = { 'content-type': 'application/json' };
  if (role) headers['x-cco-role'] = role;
  return fetch(`${baseUrl}/cco/runtime/conversation/${CONV_KEY}/action`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'handled', customerId: CUSTOMER }),
  });
}

// ── Saknad permission → 403 ──────────────────────────────────────────────────

test('RBAC: anonym (ingen roll) får 403 på både läsning och write', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReq(baseUrl, null);
      assert.equal(read.status, 403, 'anonym ska nekas läsning');
      const write = await actionReq(baseUrl, null);
      assert.equal(write.status, 403, 'anonym ska nekas write');
    });
    assert.equal(fixture.auditEvents.length, 0, 'inget audit-event vid nekad request');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('RBAC: personal (saknar mail.read) får 403 på läsning', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReq(baseUrl, 'personal');
      assert.equal(read.status, 403);
      const body = await read.json();
      assert.equal(body.error, 'forbidden');
      assert.equal(body.requiredPermission, 'mail.read');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// ── Rätt permission → action fungerar ────────────────────────────────────────

test('RBAC: operator (mail.write) får utföra handled-action', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await actionReq(baseUrl, 'operator');
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.action, 'handled');
    });
    assert.ok(
      fixture.auditEvents.some((e) => e.action === 'cco.conversation.handled'),
      'audit-event ska skapas när permission finns'
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// ── Read-only roll: kan läsa men inte skriva ─────────────────────────────────

test('RBAC: konsult kan läsa tråden (200) men nekas triage-write (403)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const read = await readReq(baseUrl, 'konsult');
      assert.equal(read.status, 200, 'konsult har mail.read');
      const readBody = await read.json();
      assert.equal(readBody.ok, true);
      assert.equal(readBody.messages[0].senderEmail, CUSTOMER);
      assert.equal(readBody.messages[0].fromEmail, CUSTOMER);
      assert.equal(readBody.messages[0].mailboxAddress, 'kons@hairtpclinic.com');

      const write = await actionReq(baseUrl, 'konsult');
      assert.equal(write.status, 403, 'konsult saknar mail.write');
      const writeBody = await write.json();
      assert.equal(writeBody.requiredPermission, 'mail.write');
    });
    assert.equal(
      fixture.auditEvents.length,
      0,
      'ingen mutation/audit när read-only-roll nekas write'
    );
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

// ── Live-send är owner-only (mail.live_send) ─────────────────────────────────

test('RBAC: operator nekas live-send reply (mail.live_send är owner-only)', async () => {
  const fixture = await createFixture();
  try {
    await withServer(fixture.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/cco/runtime/conversation/${CONV_KEY}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cco-role': 'operator' },
        body: JSON.stringify({ body: 'Hej!' }),
      });
      assert.equal(res.status, 403, 'operator saknar mail.live_send');
      const body = await res.json();
      assert.equal(body.requiredPermission, 'mail.live_send');
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
