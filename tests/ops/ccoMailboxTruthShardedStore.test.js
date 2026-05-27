const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');
const {
  createCcoMailboxTruthShardedStore,
  sliceMonolithStateForMailbox,
} = require('../../src/ops/ccoMailboxTruthShardedStore');

test('sliceMonolithStateForMailbox isolates one mailbox slice', () => {
  const slice = sliceMonolithStateForMailbox(
    {
      version: 1,
      accounts: {
        'a@x.com': { mailboxId: 'a@x.com' },
        'b@x.com': { mailboxId: 'b@x.com' },
      },
      folders: {
        'a@x.com:inbox': { mailboxId: 'a@x.com', folderType: 'inbox' },
        'b@x.com:inbox': { mailboxId: 'b@x.com', folderType: 'inbox' },
      },
      messages: {
        'a@x.com:1': { mailboxId: 'a@x.com', graphMessageId: '1' },
        'b@x.com:2': { mailboxId: 'b@x.com', graphMessageId: '2' },
      },
    },
    'a@x.com'
  );
  assert.deepEqual(Object.keys(slice.accounts), ['a@x.com']);
  assert.deepEqual(Object.keys(slice.messages), ['a@x.com:1']);
  assert.deepEqual(Object.keys(slice.folders), ['a@x.com:inbox']);
});

test('sharded mailbox truth store migrates monolith and saves per mailbox', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-truth-sharded-'));
  const legacyPath = path.join(tempDir, 'cco-mailbox-truth.json');
  const baseDir = path.join(tempDir, 'cco-mailbox-truth');

  await fs.writeFile(
    legacyPath,
    `${JSON.stringify({
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      accounts: {
        'egzona@hairtpclinic.com': {
          mailboxId: 'egzona@hairtpclinic.com',
          mailboxAddress: 'egzona@hairtpclinic.com',
        },
      },
      folders: {
        'egzona@hairtpclinic.com:inbox': {
          mailboxId: 'egzona@hairtpclinic.com',
          folderType: 'inbox',
          totalItemCount: 10,
          materializedMessageCount: 1,
          fetchStatus: 'success',
        },
      },
      messages: {
        'egzona@hairtpclinic.com:msg-1': {
          mailboxId: 'egzona@hairtpclinic.com',
          graphMessageId: 'msg-1',
          folderType: 'inbox',
          subject: 'Hej',
        },
      },
      conversations: {},
      syncCheckpoints: {},
      syncRuns: [],
    })}\n`,
    'utf8'
  );

  const store = await createCcoMailboxTruthShardedStore({
    baseDir,
    legacyFilePath: legacyPath,
  });

  assert.equal(store.sharded, true);
  assert.equal(store.migration.migrated, true);

  const report = store.getCompletenessReport({
    mailboxIds: ['egzona@hairtpclinic.com'],
  });
  assert.equal(report.accountReports.length, 1);
  assert.equal(report.metadata.messageCount, 1);

  await store.recordFolderPage({
    runId: 'run-1',
    account: {
      mailboxId: 'egzona@hairtpclinic.com',
      mailboxAddress: 'egzona@hairtpclinic.com',
    },
    folder: {
      folderType: 'inbox',
      totalItemCount: 10,
      messageCollectionCount: 10,
    },
    messages: [
      {
        mailboxId: 'egzona@hairtpclinic.com',
        graphMessageId: 'msg-2',
        folderType: 'inbox',
        subject: 'Ny',
      },
    ],
    nextPageUrl: null,
    complete: false,
  });

  const nextReport = store.getCompletenessReport({
    mailboxIds: ['egzona@hairtpclinic.com'],
  });
  assert.equal(nextReport.metadata.messageCount, 2);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('mailbox truth store with deferred conversations omits conversations from disk', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-truth-store-'));
  const filePath = path.join(tempDir, 'mailbox.json');
  const store = await createCcoMailboxTruthStore({
    filePath,
    deferConversationRebuild: true,
  });

  await store.recordFolderPage({
    runId: 'run-1',
    account: {
      mailboxId: 'a@x.com',
      mailboxAddress: 'a@x.com',
    },
    folder: {
      folderType: 'inbox',
      totalItemCount: 1,
      messageCollectionCount: 1,
    },
    messages: [
      {
        mailboxId: 'a@x.com',
        graphMessageId: 'msg-1',
        folderType: 'inbox',
        conversationId: 'conv-1',
        subject: 'Hej',
      },
    ],
    nextPageUrl: null,
    complete: true,
  });

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.deepEqual(raw.conversations, {});
  const model = store.toNormalizedModel();
  assert.equal(model.conversations.length, 1);

  await fs.rm(tempDir, { recursive: true, force: true });
});
