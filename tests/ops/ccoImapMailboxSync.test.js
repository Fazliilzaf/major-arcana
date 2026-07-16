const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');
const { createCcoMailAssetCache } = require('../../src/ops/ccoMailAssetCache');
const { createCcoImapMailboxSync } = require('../../src/ops/ccoImapMailboxSync');
const { createCcoMailIngestionStore } = require('../../src/ops/ccoMailIngestion/store');
const { createCcoMailIngestionSyncService } = require('../../src/ops/ccoMailIngestion/syncService');

function testEnv(overrides = {}) {
  return {
    ARCANA_CCO_IMAP_ENABLED: 'true',
    ARCANA_CCO_IMAP_HOST: 'imap.one.com',
    ARCANA_CCO_IMAP_USER: 'info@fazli.se',
    ARCANA_CCO_IMAP_PASSWORD: 'test-secret',
    ARCANA_CCO_IMAP_FOLDERS: 'inbox',
    ARCANA_CCO_IMAP_SINCE: '2026-01-01',
    ARCANA_CCO_IMAP_MAX_MESSAGES_PER_CYCLE: '25',
    ...overrides,
  };
}

test('CCO IMAP sparar HTML/CID-signatur i truth + etablerad asset-cache och UID-cursor', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-imap-'));
  const truth = await createCcoMailboxTruthStore({
    filePath: path.join(tempDir, 'truth.json'),
    deferConversationRebuild: true,
  });
  const assetCache = createCcoMailAssetCache({ dirPath: path.join(tempDir, 'assets') });
  const queries = [];
  let loggedOut = 0;
  const client = {
    async mailboxOpen() {
      return { exists: 2, unseen: 1 };
    },
    async search(query) {
      queries.push(query);
      return [1, 2];
    },
    async fetchOne(uid) {
      return { source: Buffer.from(String(uid)) };
    },
    async logout() {
      loggedOut += 1;
    },
  };
  const sync = createCcoImapMailboxSync({
    truthStore: truth,
    assetCache,
    env: testEnv(),
    imapClientFactory: async () => client,
    parseMessageImpl: async (source) => ({
      subject: `Mail ${source.toString()}`,
      date: '2026-07-16T10:00:00.000Z',
      messageId: `<message-${source.toString()}@example.test>`,
      text: 'Hej från One.com',
      html: '<p>Hej från One.com</p><img src="cid:clinic-logo">',
      from: [{ address: 'kund@example.test', name: 'Kund' }],
      to: [{ address: 'info@fazli.se', name: 'Info Fazli' }],
      attachments: [
        {
          filename: 'logo.png',
          contentType: 'image/png',
          contentId: '<clinic-logo>',
          contentDisposition: 'inline',
          size: 4,
          content: Buffer.from('logo'),
        },
      ],
    }),
  });

  const first = await sync.syncMailbox();
  assert.equal(first.ok, true);
  assert.equal(first.changedMessageIds.length, 2);
  assert.equal(first.folders[0].remainingBacklog, 0);
  const messages = truth.listMessages({ mailboxIds: ['info@fazli.se'], folderTypes: ['inbox'] });
  assert.equal(messages.length, 2);
  assert.match(messages[0].bodyHtml, /cid:clinic-logo/);
  assert.equal(messages[0].attachments[0].contentId, 'clinic-logo');
  assert.equal(messages[0].attachments[0].contentBytesAvailable, true);
  const cached = await assetCache.get({
    mailboxId: 'info@fazli.se',
    messageId: messages[0].graphMessageId,
    attachmentId: messages[0].attachments[0].id,
  });
  assert.equal(cached.buffer.toString(), 'logo');

  const second = await sync.syncMailbox();
  assert.equal(second.ok, true);
  assert.equal(second.changedMessageIds.length, 0);
  assert.deepEqual(queries[1], { uid: '3:*' });
  assert.equal(loggedOut, 2);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('CCO IMAP är fail-closed och använder aldrig Finance CM_IMAP-variabler', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-imap-disabled-'));
  const truth = await createCcoMailboxTruthStore({ filePath: path.join(tempDir, 'truth.json') });
  let createdClient = false;
  const sync = createCcoImapMailboxSync({
    truthStore: truth,
    env: {
      CM_IMAP_ENABLED: 'true',
      CM_IMAP_USER: 'info@fazli.se',
      CM_IMAP_PASSWORD: 'finance-secret',
    },
    imapClientFactory: async () => {
      createdClient = true;
      return null;
    },
  });

  const result = await sync.syncMailbox();
  assert.equal(result.ok, false);
  assert.match(result.error, /ARCANA_CCO_IMAP_ENABLED/);
  assert.equal(createdClient, false);
  assert.deepEqual(sync.getConfiguredMailboxIds(), []);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('CCO IMAP med tom UID-diff läser inte om hela truth-sharden', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-imap-scope-'));
  const truth = await createCcoMailboxTruthStore({ filePath: path.join(tempDir, 'truth.json') });
  await truth.recordFolderPage({
    runId: 'seed',
    account: { mailboxId: 'info@fazli.se', mailboxAddress: 'info@fazli.se' },
    folder: { folderType: 'inbox', totalItemCount: 2, messageCollectionCount: 2 },
    messages: [
      { graphMessageId: 'imap:inbox:1', folderType: 'inbox', subject: 'Ett', bodyText: 'Ett' },
      { graphMessageId: 'imap:inbox:2', folderType: 'inbox', subject: 'Två', bodyText: 'Två' },
    ],
    complete: true,
  });
  const ingestion = await createCcoMailIngestionStore({ filePath: path.join(tempDir, 'ingestion.json') });
  const service = createCcoMailIngestionSyncService({
    config: { defaultTenant: 'hair-tp-clinic' },
    ingestionStore: ingestion,
    truthStore: truth,
  });

  const result = await service.ingestTruthMessages({
    mailboxEmail: 'info@fazli.se',
    folderTypes: ['inbox'],
    messageIds: [],
  });
  assert.equal(result.totalFetched, 0);
  assert.equal(result.totalSaved, 0);

  await fs.rm(tempDir, { recursive: true, force: true });
});
