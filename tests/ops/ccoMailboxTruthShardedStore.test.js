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
    lazyPreload: false,
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

test('sharded store keeps a bounded LRU cache while mailbox selections change', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-truth-lru-'));
  const baseDir = path.join(tempDir, 'cco-mailbox-truth');
  const mailboxIds = ['a@hairtpclinic.com', 'b@hairtpclinic.com', 'c@hairtpclinic.com'];

  for (const mailboxId of mailboxIds) {
    const fileName = `${mailboxId.replace(/[^a-z0-9]+/g, '_')}.json`;
    const filePath = path.join(baseDir, 'mailboxes', fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        accounts: { [mailboxId]: { mailboxId } },
        folders: {},
        messages: {},
        conversations: {},
        syncCheckpoints: {},
        syncRuns: [],
      }),
      'utf8'
    );
  }

  const store = await createCcoMailboxTruthShardedStore({
    baseDir,
    legacyFilePath: path.join(tempDir, 'no-legacy-mailbox-truth.json'),
    lazyPreload: true,
    maxLoadedShards: 2,
  });
  await store.ensureMailboxLoaded(mailboxIds[0]);
  await store.ensureMailboxLoaded(mailboxIds[1]);
  await store.ensureMailboxLoaded(mailboxIds[2]);

  assert.deepEqual(store.listLoadedMailboxes(), [mailboxIds[1], mailboxIds[2]]);

  // Reopening an evicted mailbox must still work from disk and evict the LRU
  // entry instead of retaining a third whole mailbox in memory.
  await store.ensureMailboxLoaded(mailboxIds[0]);
  assert.deepEqual(store.listLoadedMailboxes(), [mailboxIds[0], mailboxIds[2]]);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('sharded store delegerar getFidelityInventory/getCidFidelityManifest till sin shard', async () => {
  // Bugbot-fynd (ORD-97): varje shard ÄR en ccoMailboxTruthStore och bär
  // redan deepScan/bodySource, men den sharded wrappern (produktionens
  // default) vidarebefordrade aldrig anropen. Adaptern föll då tillbaka på
  // sin egna enkla bodyHtml-only-väg, och deepScan blev en no-op i drift.
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-mailbox-truth-sharded-fidelity-')
  );
  const baseDir = path.join(tempDir, 'cco-mailbox-truth');
  const MAILBOX = 'contact@hairtpclinic.com';
  const store = await createCcoMailboxTruthShardedStore({
    baseDir,
    legacyFilePath: path.join(tempDir, 'saknas-cco-mailbox-truth.json'),
    lazyPreload: false,
  });
  await store.recordFolderPage({
    runId: 'run-1',
    account: { mailboxId: MAILBOX, mailboxAddress: MAILBOX },
    folder: { folderType: 'inbox', totalItemCount: 1, messageCollectionCount: 1 },
    messages: [
      {
        mailboxId: MAILBOX,
        graphMessageId: 'cid-gap-message',
        folderType: 'inbox',
        bodyHtml: '<div><img src="cid:logo@cid"></div>',
        attachments: [],
        hasAttachments: false,
      },
    ],
    nextPageUrl: null,
    complete: true,
  });

  const inventory = await store.getFidelityInventory({
    mailboxIds: [MAILBOX],
    sampleLimit: 5,
    deepScan: false,
  });
  assert.equal(
    inventory.summary.fidelityGapCount,
    1,
    'utan delegeringen ser den sharded storen ingen brödtext alls och rapporterar noll gap'
  );
  assert.equal(inventory.summary.bodySource, 'shard_inline_only');

  const inventoryDeepScan = await store.getFidelityInventory({
    mailboxIds: [MAILBOX],
    sampleLimit: 5,
    deepScan: true,
  });
  assert.equal(
    inventoryDeepScan.summary.bodySource,
    'bodies_sidecar',
    'deepScan måste synas i svaret även via den sharded storen'
  );

  const manifest = await store.getCidFidelityManifest({
    mailboxIds: [MAILBOX],
    limit: 10,
    deepScan: false,
  });
  assert.equal(manifest.summary.cidReferencesWithoutAttachmentMetadata, 1);
  assert.equal(manifest.entries[0]?.cid, 'logo@cid');
  assert.equal(manifest.summary.bodySource, 'shard_inline_only');

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('VAKT: sharded store exponerar fidelity-metoderna den vidarebefordrar', () => {
  const SOURCE = require('node:fs').readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'ccoMailboxTruthShardedStore.js'),
    'utf8'
  );
  assert.match(
    SOURCE,
    /async getFidelityInventory\(options = \{\}\) \{/,
    'utan denna faller adaptern tillbaka på sin bodyHtml-only-väg i produktion'
  );
  assert.match(SOURCE, /async getCidFidelityManifest\(options = \{\}\) \{/);
});
