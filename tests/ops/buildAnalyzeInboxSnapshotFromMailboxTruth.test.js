const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');
const {
  buildAnalyzeInboxSnapshotFromMailboxTruth,
} = require('../../src/ops/buildAnalyzeInboxSnapshotFromMailboxTruth');

test('buildAnalyzeInboxSnapshotFromMailboxTruth groups truth messages without raw body', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-truth-snap-'));
  const store = await createCcoMailboxTruthStore({
    filePath: path.join(dir, 'truth.json'),
  });
  const account = {
    mailboxId: 'contact@hairtpclinic.com',
    mailboxAddress: 'contact@hairtpclinic.com',
  };
  const run = await store.startBackfillRun({ account });

  const recentInbound = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const recentOutbound = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

  await store.recordFolderPage({
    runId: run.runId,
    account,
    folder: { folderType: 'inbox' },
    messages: [
      {
        graphMessageId: 'msg-in-1',
        conversationId: 'conv-1',
        subject: 'Hej',
        bodyPreview: 'Preview inbound',
        body: 'SHOULD NOT LEAK',
        direction: 'inbound',
        receivedAt: recentInbound,
        from: { address: 'kund@example.com', name: 'Kund' },
        toRecipients: ['contact@hairtpclinic.com'],
        isRead: false,
      },
    ],
    complete: true,
  });
  await store.recordFolderPage({
    runId: run.runId,
    account,
    folder: { folderType: 'sent' },
    messages: [
      {
        graphMessageId: 'msg-out-1',
        conversationId: 'conv-1',
        subject: 'Re: Hej',
        bodyPreview: 'Preview outbound',
        direction: 'outbound',
        sentAt: recentOutbound,
        from: { address: 'contact@hairtpclinic.com' },
        toRecipients: ['kund@example.com'],
      },
    ],
    complete: true,
  });

  const built = buildAnalyzeInboxSnapshotFromMailboxTruth({
    ccoMailboxTruthStore: store,
    mailboxIds: ['contact@hairtpclinic.com'],
    lookbackDays: 30,
  });

  assert.equal(built.ok, true);
  assert.equal(built.snapshot.source, 'mailbox_truth_store');
  assert.equal(built.snapshot.conversations.length, 1);
  const conversation = built.snapshot.conversations[0];
  assert.equal(conversation.messages.length, 2);
  assert.ok(conversation.customerEmail.includes('kund@example.com'));
  for (const message of conversation.messages) {
    assert.equal(message.bodyHtml, null);
    assert.ok(!String(message.bodyPreview || '').includes('SHOULD NOT LEAK'));
  }

  await fs.rm(dir, { recursive: true, force: true });
});

test('buildAnalyzeInboxSnapshotFromMailboxTruth includes scoped conversations outside lookback window', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-truth-snap-old-'));
  const store = await createCcoMailboxTruthStore({
    filePath: path.join(dir, 'truth.json'),
  });
  const account = {
    mailboxId: 'contact@hairtpclinic.com',
    mailboxAddress: 'contact@hairtpclinic.com',
  };
  const run = await store.startBackfillRun({ account });
  const oldInbound = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000).toISOString();

  await store.recordFolderPage({
    runId: run.runId,
    account,
    folder: { folderType: 'inbox' },
    messages: [
      {
        graphMessageId: 'msg-old-1',
        conversationId: 'conv-old',
        subject: 'Gammal tråd',
        bodyPreview: 'Gammal preview',
        direction: 'inbound',
        receivedAt: oldInbound,
        from: { address: 'legacy@example.com', name: 'Legacy' },
        toRecipients: ['contact@hairtpclinic.com'],
        isRead: true,
      },
    ],
    complete: true,
  });

  const withoutScope = buildAnalyzeInboxSnapshotFromMailboxTruth({
    ccoMailboxTruthStore: store,
    mailboxIds: ['contact@hairtpclinic.com'],
    lookbackDays: 30,
  });
  assert.equal(withoutScope.snapshot.conversations.length, 0);

  const withScope = buildAnalyzeInboxSnapshotFromMailboxTruth({
    ccoMailboxTruthStore: store,
    mailboxIds: ['contact@hairtpclinic.com'],
    lookbackDays: 30,
    conversationIds: ['contact@hairtpclinic.com:conv-old'],
  });
  assert.equal(withScope.snapshot.conversations.length, 1);
  assert.equal(withScope.snapshot.conversations[0].messages.length, 1);

  await fs.rm(dir, { recursive: true, force: true });
});
