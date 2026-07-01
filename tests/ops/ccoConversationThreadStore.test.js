'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { createCcoConversationThreadStore } = require('../../src/ops/ccoConversationThreadStore');

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

test('buildThreadsForCustomer prefers truth over duplicate ingestion rows', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-thread-'));
  const filePath = path.join(tmp, 'states.json');
  const customerId = 'cust-1';
  const store = await createCcoConversationThreadStore({
    filePath,
    mailboxTruthStore: makeTruthStore([
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g1',
        conversationId: 'conv-1',
        folderType: 'inbox',
        direction: 'inbound',
        subject: 'Truth subject',
        bodyPreview: 'preview only',
        fromEmail: 'patient@example.com',
        receivedAt: '2026-06-01T10:00:00.000Z',
        customerIdentity: { customerId, canonicalCustomerId: customerId },
      },
    ]),
    mailIngestionStore: makeIngestionStore([
      {
        patientId: customerId,
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g1',
        conversationId: 'conv-1',
        folderType: 'inbox',
        subject: 'Ingestion duplicate',
        snippet: 'ingest',
        from: 'patient@example.com',
        receivedAt: '2026-06-01T10:00:00.000Z',
      },
    ]),
    historyMailboxIds: ['contact@hairtpclinic.com'],
  });

  const { threads, summary } = await store.buildThreadsForCustomer(customerId);
  const mailRows = threads.filter((t) => t.kind === 'incoming_mail');
  assert.equal(mailRows.length, 1);
  assert.equal(mailRows[0].sourceLayer, 'mailbox_truth');
  assert.equal(mailRows[0].mailboxBadge, 'contact');
  assert.equal(summary.multiMailbox, false);
});

test('buildThreadsForCustomer thread row-shape: C2 field contract (kind/direction/ts/subject/preview/mailboxBadge/conversationId)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-thread-'));
  const filePath = path.join(tmp, 'states.json');
  const customerId = 'cust-c2';
  const store = await createCcoConversationThreadStore({
    filePath,
    mailboxTruthStore: makeTruthStore([
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g-c2',
        conversationId: 'conv-c2',
        folderType: 'inbox',
        direction: 'inbound',
        subject: 'Fråga om behandling',
        bodyPreview: 'Hej, jag undrar om FUE',
        fromEmail: 'patient@example.com',
        receivedAt: '2026-07-01T10:00:00.000Z',
        customerIdentity: { customerId, canonicalCustomerId: customerId },
      },
    ]),
    historyMailboxIds: ['contact@hairtpclinic.com'],
  });

  const result = await store.buildThreadsForCustomer(customerId);
  assert.ok(Array.isArray(result.threads), 'threads must be array');
  assert.equal(result.threads.length, 1);

  const t = result.threads[0];
  // Fields required by C2 hydrateC2ThreadsPanel / c2RenderRow
  assert.ok('kind' in t, 'thread.kind must exist');
  assert.ok('direction' in t, 'thread.direction must exist');
  assert.ok('ts' in t, 'thread.ts must exist');
  assert.ok('subject' in t, 'thread.subject must exist');
  assert.ok('preview' in t, 'thread.preview must exist');
  assert.ok('mailboxBadge' in t, 'thread.mailboxBadge must exist');
  assert.ok('conversationId' in t, 'thread.conversationId must exist');
  assert.ok('unanswered' in t, 'thread.unanswered must exist');
  assert.ok('handled' in t, 'thread.handled must exist');
  assert.ok('snoozedUntil' in t, 'thread.snoozedUntil must exist');
  assert.ok('threadStatus' in t, 'thread.threadStatus must exist');

  // Values
  assert.equal(t.kind, 'incoming_mail');
  assert.equal(t.direction, 'inbound');
  assert.equal(t.subject, 'Fråga om behandling');
  assert.equal(t.conversationId, 'conv-c2');
  assert.equal(t.mailboxBadge, 'contact');
  assert.equal(typeof t.unanswered, 'boolean');
  assert.equal(typeof t.handled, 'boolean');

  // counts must include all C2 filter keys
  const counts = result.counts || {};
  for (const key of [
    'all',
    'incoming',
    'outgoing',
    'drafts',
    'needs_approval',
    'sent',
    'internal',
    'unanswered',
    'system',
    'handled',
    'snoozed',
  ]) {
    assert.ok(key in counts, `counts.${key} must exist`);
  }

  // filterThreads must work for 'incoming' and 'all'
  const allFiltered = store.filterThreads(result.threads, 'all');
  assert.equal(allFiltered.length, 1);
  const inFiltered = store.filterThreads(result.threads, 'incoming');
  assert.equal(inFiltered.length, 1);
  const outFiltered = store.filterThreads(result.threads, 'outgoing');
  assert.equal(outFiltered.length, 0);
});

test('buildThreadsForCustomer merges ingestion-only rows and multi-mailbox summary', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-thread-'));
  const filePath = path.join(tmp, 'states.json');
  const customerId = 'cust-2';
  const store = await createCcoConversationThreadStore({
    filePath,
    mailboxTruthStore: makeTruthStore([
      {
        mailboxId: 'contact@hairtpclinic.com',
        graphMessageId: 'g-contact',
        folderType: 'inbox',
        subject: 'Contact',
        bodyPreview: 'c',
        fromEmail: 'a@example.com',
        receivedAt: '2026-06-01T11:00:00.000Z',
        customerIdentity: { customerId },
      },
    ]),
    mailIngestionStore: makeIngestionStore([
      {
        patientId: customerId,
        mailboxId: 'egzona@hairtpclinic.com',
        graphMessageId: 'g-egzona',
        folderType: 'inbox',
        subject: 'Egzona only ingest',
        snippet: 'e',
        from: 'b@example.com',
        receivedAt: '2026-06-01T12:00:00.000Z',
      },
    ]),
    historyMailboxIds: ['contact@hairtpclinic.com', 'egzona@hairtpclinic.com'],
  });

  const { threads, summary, mailboxes } = await store.buildThreadsForCustomer(customerId);
  assert.equal(threads.filter((t) => t.kind === 'incoming_mail').length, 2);
  assert.equal(summary.multiMailbox, true);
  assert.equal(mailboxes.length, 2);
});
