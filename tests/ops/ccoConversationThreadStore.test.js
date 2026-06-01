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
