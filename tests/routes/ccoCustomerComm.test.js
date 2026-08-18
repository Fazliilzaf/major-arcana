'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const express = require('express');

const { createCcoCustomerCommRouter } = require('../../src/routes/ccoCustomerComm');

function makeAuth(role = 'operator') {
  return (req, _res, next) => {
    req.auth = { tenantId: 'hairtpclinic', userId: 'u1', role };
    next();
  };
}

function makeTruthStore(messages = []) {
  return {
    listLoadedMailboxes() {
      return [...new Set(messages.map((m) => m.mailboxId).filter(Boolean))];
    },
    listMessages({ mailboxIds = [], limit = 0 } = {}) {
      let rows = messages;
      if (mailboxIds.length > 0) {
        rows = rows.filter((m) => mailboxIds.includes(m.mailboxId));
      }
      return limit > 0 ? rows.slice(0, limit) : rows;
    },
  };
}

function makeIngestionStore(messages = []) {
  return {
    listPatientMessages({ patientId, limit = 100 } = {}) {
      const rows = messages.filter((m) => m.patientId === patientId);
      return limit > 0 ? rows.slice(0, limit) : rows;
    },
  };
}

async function withServer(router, run) {
  const app = express();
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

test('GET /cco-customers/:id/conversation-threads surfaces mailboxTruthStore messages', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-route-'));
  const customerId = 'cust-route-1';

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g-route-1',
        conversationId: 'conv-route-1',
        folderType: 'inbox',
        direction: 'inbound',
        subject: 'Fråga från patient',
        bodyPreview: 'Hej, jag undrar om behandlingen',
        fromEmail: 'patient@example.com',
        receivedAt: '2026-07-01T09:00:00.000Z',
        customerIdentity: { customerId, canonicalCustomerId: customerId },
      },
    ]),
    mailIngestionStore: makeIngestionStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco-customers/${encodeURIComponent(customerId)}/conversation-threads`
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.threads), 'threads must be array');
    const mailRows = body.threads.filter((t) => t.kind === 'incoming_mail');
    assert.equal(mailRows.length, 1, 'one truth-store mail thread must appear');
    assert.equal(mailRows[0].sourceLayer, 'mailbox_truth');
    assert.equal(mailRows[0].conversationId, 'conv-route-1');
    assert.equal(mailRows[0].subject, 'Fråga från patient');
    assert.ok(typeof body.counts === 'object', 'counts must be present');
    assert.ok('all' in body.counts, 'counts.all must exist');
  });
});

test('GET /cco-customers/:id/conversation-threads returns empty threads for unknown customer', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-route-'));

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([]),
    mailIngestionStore: makeIngestionStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/no-such-customer/conversation-threads`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.threads));
    assert.equal(body.threads.length, 0);
  });
});

// ── C6: unified-timeline surfaces assets through the route with safety filter ──

function makeAssetStore(assets = []) {
  return {
    listAssetsForPatient(_patientId, _filters, _opts) {
      return assets;
    },
  };
}

test('C6 route: GET /cco-customers/:id/unified-timeline surfaces only VISIBLE assets, filters NEEDS_REVIEW', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-route-'));
  const customerId = 'cust-timeline-1';

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
      ccoCustomerJourneyStorePath: path.join(tmp, 'journey.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g-tl-1',
        conversationId: 'conv-tl-1',
        folderType: 'inbox',
        direction: 'inbound',
        subject: 'Tidslinjefråga',
        bodyPreview: 'Hej',
        fromEmail: 'patient@example.com',
        receivedAt: '2026-06-01T09:00:00.000Z',
        customerIdentity: { customerId, canonicalCustomerId: customerId },
      },
    ]),
    mailIngestionStore: makeIngestionStore([]),
    resolvePatientAssetStore: async () =>
      makeAssetStore([
        {
          id: 'visible-doc',
          patientId: customerId,
          status: 'VISIBLE_ON_PATIENT_CARD',
          category: 'document_medical',
          documentDate: '2026-05-20T10:00:00.000Z',
        },
        {
          id: 'hidden-review',
          patientId: customerId,
          status: 'NEEDS_REVIEW',
          category: 'document_medical',
          documentDate: '2026-05-21T10:00:00.000Z',
        },
      ]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco-customers/${encodeURIComponent(customerId)}/unified-timeline`
    );
    assert.equal(res.status, 200);
    const body = await res.json();

    const assetEvents = (body.events || []).filter((e) => e.source === 'asset');
    assert.equal(assetEvents.length, 1, 'only VISIBLE_ON_PATIENT_CARD asset surfaces');
    assert.equal(assetEvents[0].meta.assetId, 'visible-doc');
    assert.deepEqual(assetEvents[0].meta.openRef, {
      kind: 'patient_asset',
      assetId: 'visible-doc',
    });

    const mail = (body.events || []).find((e) => e.kind === 'incoming_mail');
    assert.ok(mail, 'mail event present');
    assert.equal(mail.meta.conversationKey, 'conv-tl-1');

    // Ingen direkt Drive-länk i hela payloaden.
    assert.ok(!/drive\.google\.com/i.test(JSON.stringify(body)), 'no direct Drive link');
  });
});

test('C6 route: unified-timeline for empty customer returns safe empty state', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-route-'));

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
      ccoCustomerJourneyStorePath: path.join(tmp, 'journey.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([]),
    mailIngestionStore: makeIngestionStore([]),
    resolvePatientAssetStore: async () => makeAssetStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/empty-cust/unified-timeline`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.events, []);
    assert.equal(body.counts.all, 0);
  });
});

// ── Conversation context route tests ──

test('GET /cco-customers/:id/conversation-context returns context shape', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-context-'));
  const customerId = 'cust-ctx-route-1';

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g-ctx-1',
        conversationId: 'conv-ctx-1',
        folderType: 'inbox',
        direction: 'inbound',
        subject: 'Fråga',
        bodyPreview: 'Hej',
        fromEmail: 'patient@example.com',
        receivedAt: '2026-07-15T08:00:00.000Z',
        customerIdentity: { customerId, canonicalCustomerId: customerId },
      },
    ]),
    mailIngestionStore: makeIngestionStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco-customers/${encodeURIComponent(customerId)}/conversation-context`
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.context.customerId, customerId);
    assert.equal(body.context.latestInboundAt, '2026-07-15T08:00:00.000Z');
    assert.equal(body.context.unanswered.count, 1);
    assert.ok(typeof body.context.slaStatus === 'object');
    assert.ok(typeof body.context.risk === 'object');
    assert.ok(typeof body.context.temperature === 'object');
  });
});

test('GET /cco-customers/:id/conversation-context rejects missing permission', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-context-'));
  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth('revisor'),
    mailboxTruthStore: makeTruthStore([]),
    mailIngestionStore: makeIngestionStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/cust/conversation-context`);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'forbidden');
  });
});

test('GET /cco-customers/:id/conversation-context returns empty context for unknown customer', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-context-'));
  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([]),
    mailIngestionStore: makeIngestionStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-customers/no-such/conversation-context`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.context.unanswered.count, 0);
    assert.equal(body.context.activeThreadCount, 0);
    assert.equal(body.context.latestInboundAt, null);
  });
});

test('GET /cco-customers/:id/conversation-context scopes by conversationKey', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-context-'));
  const customerId = 'cust-ctx-route-scope';

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g-scope-1',
        conversationId: 'conv-scope-a',
        folderType: 'inbox',
        direction: 'inbound',
        subject: 'A',
        bodyPreview: 'A',
        fromEmail: 'a@example.com',
        receivedAt: '2026-07-15T08:00:00.000Z',
        customerIdentity: { customerId, canonicalCustomerId: customerId },
      },
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g-scope-2',
        conversationId: 'conv-scope-b',
        folderType: 'inbox',
        direction: 'inbound',
        subject: 'B',
        bodyPreview: 'B',
        fromEmail: 'b@example.com',
        receivedAt: '2026-07-15T07:00:00.000Z',
        customerIdentity: { customerId, canonicalCustomerId: customerId },
      },
    ]),
    mailIngestionStore: makeIngestionStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco-customers/${encodeURIComponent(
        customerId
      )}/conversation-context?conversationKey=conv-scope-a`
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.context.conversationKey, 'conv-scope-a');
    assert.equal(body.context.unanswered.count, 1);
    assert.equal(body.context.latestInboundAt, '2026-07-15T08:00:00.000Z');
  });
});

test('GET /cco-customers/:id/conversation-context caches response for 30s', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-context-'));
  const customerId = 'cust-ctx-route-cache';
  let callCount = 0;

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: {
      listLoadedMailboxes() {
        return ['contact@hairtpclinic.com'];
      },
      listMessages() {
        callCount += 1;
        return [
          {
            mailboxId: 'contact@hairtpclinic.com',
            graphMessageId: 'g-cache-1',
            conversationId: 'conv-cache',
            folderType: 'inbox',
            direction: 'inbound',
            subject: 'Cache',
            bodyPreview: 'Cache',
            fromEmail: 'patient@example.com',
            receivedAt: '2026-07-15T08:00:00.000Z',
            customerIdentity: { customerId, canonicalCustomerId: customerId },
          },
        ];
      },
    },
    mailIngestionStore: makeIngestionStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const url = `${baseUrl}/cco-customers/${encodeURIComponent(customerId)}/conversation-context`;
    const res1 = await fetch(url);
    assert.equal(res1.status, 200);
    const body1 = await res1.json();

    const res2 = await fetch(url);
    assert.equal(res2.status, 200);
    const body2 = await res2.json();

    assert.deepEqual(body1.context, body2.context);
    assert.equal(callCount, 1, 'second request should be served from cache');
  });
});


// ── Fas 6: communication-feed, internal-note och thread-action ─────────────

function makePortalMessageStore(messages = []) {
  return {
    listMessagesForCustomer({ tenantId, customerId }) {
      return messages.filter((m) => m.customerId === customerId);
    },
  };
}

function makeConversationNotesStore(notes = []) {
  const state = new Map();
  for (const n of notes) {
    const key = n.conversationKey || 'default';
    if (!state.has(key)) state.set(key, []);
    state.get(key).push(n);
  }
  return {
    listNotes({ conversationKey }) {
      return state.get(conversationKey) || [];
    },
    async addNote({ conversationKey, body, authorEmail, authorName }) {
      const note = {
        noteId: 'note-' + Math.random().toString(36).slice(2),
        body,
        authorEmail,
        authorName,
        createdAt: new Date().toISOString(),
      };
      if (!state.has(conversationKey)) state.set(conversationKey, []);
      state.get(conversationKey).push(note);
      return note;
    },
  };
}

function makeSendActionStore(sends = []) {
  return {
    listSends({ customerId }) {
      return sends.filter((s) => s.customerId === customerId);
    },
  };
}

test('Fas 6: GET /cco-customers/:id/communication-feed merges threads, portal, notes and sends', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-feed-'));
  const customerId = 'cust-feed-1';

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g-feed-1',
        conversationId: 'conv-feed-1',
        folderType: 'inbox',
        direction: 'inbound',
        subject: 'Mailfråga',
        bodyPreview: 'Hej',
        fromEmail: 'patient@example.com',
        receivedAt: '2026-08-01T09:00:00.000Z',
        customerIdentity: { customerId, canonicalCustomerId: customerId },
      },
    ]),
    mailIngestionStore: makeIngestionStore([]),
    portalMessageStore: makePortalMessageStore([
      {
        customerId,
        direction: 'inbound',
        channel: 'portal',
        body: 'Hej kliniken!',
        createdAt: '2026-08-01T10:00:00.000Z',
      },
    ]),
    conversationNotesStore: makeConversationNotesStore([
      {
        conversationKey: customerId,
        body: 'Intern anteckning',
        authorName: 'Ssk Anna',
        createdAt: '2026-08-01T08:00:00.000Z',
      },
    ]),
    sendActionStore: makeSendActionStore([
      {
        customerId,
        kind: 'form',
        status: 'sent',
        createdAt: '2026-08-01T07:00:00.000Z',
      },
    ]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco-customers/${encodeURIComponent(customerId)}/communication-feed`
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.customerId, customerId);
    assert.equal(body.events.length, 4);
    assert.equal(body.counters.total, 4);
    assert.equal(body.counters.internal_notes, 1);
    assert.equal(body.counters.sends, 1);
    assert.equal(body.lastContactTs, '2026-08-01T10:00:00.000Z');
    const kinds = body.events.map((e) => e.kind);
    assert.ok(kinds.includes('portal_chat'));
    assert.ok(kinds.includes('incoming_mail'));
    assert.ok(kinds.includes('internal_note'));
    assert.ok(kinds.includes('form_sent'));
  });
});

test('Fas 6: POST /cco-customers/:id/internal-note creates a note and returns it', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-note-'));
  const customerId = 'cust-note-1';
  const notesStore = makeConversationNotesStore([]);

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([]),
    mailIngestionStore: makeIngestionStore([]),
    conversationNotesStore: notesStore,
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/cco-customers/${encodeURIComponent(customerId)}/internal-note`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: '  Viktig notis  ' }),
      }
    );
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.note.body, 'Viktig notis');

    const listed = notesStore.listNotes({ conversationKey: customerId });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].body, 'Viktig notis');
  });
});

test('Fas 6: POST /cco-conversation-threads/action marks thread handled', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-action-'));
  const customerId = 'cust-action-1';

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g-action-1',
        conversationId: 'conv-action-1',
        folderType: 'inbox',
        direction: 'inbound',
        subject: 'Hantera mig',
        bodyPreview: 'Hej',
        fromEmail: 'patient@example.com',
        receivedAt: '2026-08-01T09:00:00.000Z',
        customerIdentity: { customerId, canonicalCustomerId: customerId },
      },
    ]),
    mailIngestionStore: makeIngestionStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-conversation-threads/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customerId,
        threadId: 'conv-action-1',
        action: 'mark_handled',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.state.handled, true);

    const threads = await fetch(
      `${baseUrl}/cco-customers/${encodeURIComponent(customerId)}/conversation-threads`
    );
    const tBody = await threads.json();
    const thread = tBody.threads.find((x) => x.threadId === 'conv-action-1');
    assert.ok(thread, 'thread must exist');
    assert.equal(thread.handled, true);
    assert.equal(thread.threadStatus, 'handled');
  });
});

test('Fas 6: POST /cco-conversation-threads/action rejects invalid action', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-comm-action-bad-'));

  const router = createCcoCustomerCommRouter({
    config: {
      ccoConversationThreadStateStorePath: path.join(tmp, 'thread-state.json'),
    },
    requireAuth: makeAuth(),
    mailboxTruthStore: makeTruthStore([]),
    mailIngestionStore: makeIngestionStore([]),
  });

  await withServer(router, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/cco-conversation-threads/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customerId: 'c',
        threadId: 't',
        action: 'delete_everything',
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
  });
});
