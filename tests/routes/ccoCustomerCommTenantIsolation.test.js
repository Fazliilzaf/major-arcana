'use strict';

/**
 * P1-003/004 — kundkommunikations-ytan (8 rutter). Samma client-styrda
 * tenant-bugg fixades här: främmande client-tenant → 403, och för skrivrutterna
 * (advance/rollback/thread-action) sker neket INNAN någon mutation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const express = require('express');

const { createCcoCustomerCommRouter } = require('../../src/routes/ccoCustomerComm');

function makeAuth(tenantId = 'hair-tp-clinic', role = 'operator') {
  return (req, _res, next) => {
    req.auth = { tenantId, userId: 'u1', role };
    next();
  };
}

function makeRouter(tmp, authTenantId = 'hair-tp-clinic') {
  return createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
      ccoCustomerJourneyStorePath: path.join(tmp, 'journey.json'),
    },
    requireAuth: makeAuth(authTenantId),
    mailboxTruthStore: { listLoadedMailboxes: () => [], listMessages: () => [] },
    mailIngestionStore: { listPatientMessages: () => [] },
    conversationNotesStore: {
      listNotes: () => [],
      addNote: async () => ({ noteId: 'n' }),
    },
    portalMessageStore: { listMessagesForCustomer: () => [] },
  });
}

async function withServer(router, run) {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use('/api/v1', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function tmpdir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), label));
}

// ── Läsa-rutter: främmande query-tenant → 403 ───────────────────────────────

test('T-022: conversation-threads foreign tenant → 403', async () => {
  const tmp = tmpdir('cco-iso-threads-');
  await withServer(makeRouter(tmp), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/c1/conversation-threads?tenantId=curatiio`);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'tenant_scope_forbidden');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('T-020: unified-timeline foreign tenant → 403', async () => {
  const tmp = tmpdir('cco-iso-timeline-');
  await withServer(makeRouter(tmp), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/c1/unified-timeline?tenantId=curatiio`);
    assert.equal(res.status, 403);
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('T-023: journey read foreign tenant → 403', async () => {
  const tmp = tmpdir('cco-iso-journey-');
  await withServer(makeRouter(tmp), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/c1/journey?tenantId=curatiio`);
    assert.equal(res.status, 403);
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('T-021: conversation-context foreign tenant → 403', async () => {
  const tmp = tmpdir('cco-iso-ctx-');
  await withServer(makeRouter(tmp), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/c1/conversation-context?tenantId=curatiio`);
    assert.equal(res.status, 403);
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('T-019: communication-feed foreign tenant → 403', async () => {
  const tmp = tmpdir('cco-iso-feed-');
  await withServer(makeRouter(tmp), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/c1/communication-feed?tenantId=curatiio`);
    assert.equal(res.status, 403);
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ── Skriva-rutter: främmande tenant → 403 + NOLL mutation ───────────────────

test('T-016: journey advance foreign tenant → 403 + zero mutation', async () => {
  const tmp = tmpdir('cco-iso-advance-');
  const journeyPath = path.join(tmp, 'journey.json');
  await withServer(makeRouter(tmp), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/c1/journey/advance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetStep: 'booked', tenantId: 'curatiio' }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'tenant_scope_forbidden');
    // Ingen mutation: journey-storen skapades aldrig → ingen fil skrevs.
    assert.equal(fs.existsSync(journeyPath), false, 'journey-fil fick inte skapas');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('T-017: journey rollback foreign tenant → 403 + zero mutation', async () => {
  const tmp = tmpdir('cco-iso-rollback-');
  const journeyPath = path.join(tmp, 'journey.json');
  await withServer(makeRouter(tmp), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/c1/journey/rollback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'test', tenantId: 'curatiio' }),
    });
    assert.equal(res.status, 403);
    assert.equal(fs.existsSync(journeyPath), false, 'journey-fil fick inte skapas');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('T-018: thread action foreign tenant → 403 + zero mutation', async () => {
  const tmp = tmpdir('cco-iso-action-');
  const threadPath = path.join(tmp, 'thread-state.json');
  await withServer(makeRouter(tmp), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-conversation-threads/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customerId: 'c1',
        threadId: 't1',
        action: 'mark_handled',
        tenantId: 'curatiio',
      }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'tenant_scope_forbidden');
    assert.equal(fs.existsSync(threadPath), false, 'thread-state-fil fick inte skapas');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ── Positivt: saknas client-tenant används autentiserad tenant (T-013) ──────

test('T-013: read-rutt utan client-tenant använder autentiserad tenant (200)', async () => {
  const tmp = tmpdir('cco-iso-omit-');
  await withServer(makeRouter(tmp, 'hair-tp-clinic'), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/c1/journey`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.tenantId, 'hair-tp-clinic');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
});
