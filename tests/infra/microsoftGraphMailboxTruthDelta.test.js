const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');
const {
  createMicrosoftGraphMailboxTruthDelta,
} = require('../../src/infra/microsoftGraphMailboxTruthDelta');

async function createTempStorePath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-delta-'));
  return path.join(dir, 'mailbox-truth-store.json');
}

function toWellKnownName(folderType = 'inbox') {
  if (folderType === 'sent') return 'SentItems';
  if (folderType === 'drafts') return 'Drafts';
  if (folderType === 'deleted') return 'DeletedItems';
  return 'inbox';
}

function toFolderName(folderType = 'inbox') {
  if (folderType === 'sent') return 'Sent Items';
  if (folderType === 'drafts') return 'Drafts';
  if (folderType === 'deleted') return 'Deleted Items';
  return 'Inbox';
}

function createMessage({
  mailboxId = 'kons@hairtpclinic.com',
  graphUserId = 'user-kons',
  graphMessageId = 'msg-1',
  folderType = 'inbox',
  conversationId = 'conv-1',
  subject = 'Hej',
  bodyPreview = 'Hej från kund',
  direction = 'inbound',
  isRead = false,
  hasAttachments = false,
  receivedAt = '2026-04-02T08:00:00.000Z',
  sentAt = null,
  createdAt = '2026-04-02T07:59:59.000Z',
  lastModifiedAt = '2026-04-02T08:00:00.000Z',
  internetMessageId = null,
  inReplyTo = null,
  references = [],
} = {}) {
  return {
    graphMessageId,
    mailboxId,
    mailboxAddress: mailboxId,
    userPrincipalName: mailboxId,
    graphUserId,
    folderId: `folder-${folderType}`,
    folderName: toFolderName(folderType),
    folderType,
    wellKnownName: toWellKnownName(folderType),
    conversationId,
    subject,
    bodyPreview,
    direction,
    isRead,
    hasAttachments,
    isDraft: folderType === 'drafts',
    isDeleted: folderType === 'deleted',
    receivedAt,
    sentAt,
    createdAt,
    lastModifiedAt,
    from: {
      address: direction === 'outbound' ? mailboxId : 'patient@example.com',
      name: direction === 'outbound' ? 'Operator' : 'Patient',
    },
    toRecipients: [
      {
        address: direction === 'outbound' ? 'patient@example.com' : mailboxId,
        name: direction === 'outbound' ? 'Patient' : 'Operator',
      },
    ],
    ccRecipients: [],
    bccRecipients: [],
    replyToRecipients: [],
    internetMessageId: internetMessageId || `${graphMessageId}@example.com`,
    inReplyTo,
    references,
  };
}

function createUpsertChange(message) {
  return {
    changeType: 'upsert',
    graphMessageId: message.graphMessageId,
    mailboxId: message.mailboxId,
    folderType: message.folderType,
    message,
  };
}

function createDeleteChange({
  mailboxId = 'kons@hairtpclinic.com',
  folderType = 'inbox',
  graphMessageId = 'msg-delete',
  reason = 'deleted',
} = {}) {
  return {
    changeType: 'deleted',
    graphMessageId,
    mailboxId,
    folderType,
    removalReason: reason,
  };
}

async function seedVerifiedFolder(store, { mailboxId = 'kons@hairtpclinic.com', folderType = 'inbox', messages = [] } = {}) {
  const run = await store.startBackfillRun({
    mailboxIds: [mailboxId],
    folderTypes: [folderType],
  });
  await store.recordFolderPage({
    runId: run.runId,
    account: {
      graphUserId: `user-${mailboxId}`,
      mailboxId,
      mailboxAddress: mailboxId,
      userPrincipalName: mailboxId,
    },
    folder: {
      folderType,
      folderId: `folder-${folderType}`,
      folderName: toFolderName(folderType),
      wellKnownName: toWellKnownName(folderType),
      totalItemCount: messages.length,
      messageCollectionCount: messages.length,
      unreadItemCount: messages.filter((message) => message.isRead === false).length,
    },
    messages,
    nextPageUrl: null,
    sourcePageUrl: 'seed-page',
    pageSize: messages.length || 1,
    complete: true,
  });
  await store.finishBackfillRun(run.runId, { status: 'completed' });
}

test('microsoftGraphMailboxTruthDelta persists nextLink checkpoints, resumes, and verifies a no-change incremental round', async () => {
  const filePath = await createTempStorePath();
  const mailboxId = 'kons@hairtpclinic.com';
  const initialMessage = createMessage({
    mailboxId,
    graphUserId: 'user-kons',
    graphMessageId: 'msg-1',
    subject: 'Första version',
  });

  const store = await createCcoMailboxTruthStore({ filePath });
  await seedVerifiedFolder(store, {
    mailboxId,
    folderType: 'inbox',
    messages: [initialMessage],
  });

  const firstConnectorFactory = () => ({
    async fetchMailboxTruthFolderDeltaPage(options = {}) {
      assert.equal(options.cursorUrl || '', '');
      return {
        account: {
          graphUserId: 'user-kons',
          mailboxId,
          mailboxAddress: mailboxId,
          userPrincipalName: mailboxId,
        },
        folder: {
          folderType: 'inbox',
          folderId: 'folder-inbox',
          folderName: 'Inbox',
          wellKnownName: 'inbox',
          totalItemCount: 1,
          unreadItemCount: 1,
        },
        page: {
          nextPageUrl: 'cursor-inbox-2',
          deltaLink: null,
          complete: false,
          sourcePageUrl: 'delta-page-1',
        },
        changes: [createUpsertChange(initialMessage)],
      };
    },
  });

  const firstDelta = createMicrosoftGraphMailboxTruthDelta({
    connectorFactory: firstConnectorFactory,
    store,
  });

  await firstDelta.runDeltaSync({
    mailboxIds: [mailboxId],
    folderTypes: ['inbox'],
    maxPagesPerFolder: 1,
  });

  const midCheckpoint = store.getSyncCheckpoint(mailboxId, 'inbox');
  assert.equal(midCheckpoint.syncStatus, 'running');
  assert.equal(midCheckpoint.nextPageUrl, 'cursor-inbox-2');
  assert.equal(midCheckpoint.deltaLink, null);

  const reopenedStore = await createCcoMailboxTruthStore({ filePath });
  const secondConnectorFactory = () => ({
    async fetchMailboxTruthFolderDeltaPage(options = {}) {
      if (options.cursorUrl === 'cursor-inbox-2') {
        return {
          account: {
            graphUserId: 'user-kons',
            mailboxId,
            mailboxAddress: mailboxId,
            userPrincipalName: mailboxId,
          },
          folder: {
            folderType: 'inbox',
            folderId: 'folder-inbox',
            folderName: 'Inbox',
            wellKnownName: 'inbox',
            totalItemCount: 1,
            unreadItemCount: 1,
          },
          page: {
            nextPageUrl: null,
            deltaLink: 'delta-inbox-1',
            complete: true,
            sourcePageUrl: 'delta-page-2',
          },
          changes: [],
        };
      }
      if (options.cursorUrl === 'delta-inbox-1') {
        return {
          account: {
            graphUserId: 'user-kons',
            mailboxId,
            mailboxAddress: mailboxId,
            userPrincipalName: mailboxId,
          },
          folder: {
            folderType: 'inbox',
            folderId: 'folder-inbox',
            folderName: 'Inbox',
            wellKnownName: 'inbox',
            totalItemCount: 1,
            unreadItemCount: 1,
          },
          page: {
            nextPageUrl: null,
            deltaLink: 'delta-inbox-2',
            complete: true,
            sourcePageUrl: 'delta-page-3',
          },
          changes: [],
        };
      }
      throw new Error(`Unexpected cursor: ${options.cursorUrl}`);
    },
  });

  const resumedDelta = createMicrosoftGraphMailboxTruthDelta({
    connectorFactory: secondConnectorFactory,
    store: reopenedStore,
  });

  await resumedDelta.runDeltaSync({
    mailboxIds: [mailboxId],
    folderTypes: ['inbox'],
  });

  let checkpoint = reopenedStore.getSyncCheckpoint(mailboxId, 'inbox');
  assert.equal(checkpoint.syncStatus, 'delta_armed');
  assert.equal(checkpoint.nextPageUrl, null);
  assert.equal(checkpoint.deltaLink, 'delta-inbox-1');

  const noChangeResult = await resumedDelta.runDeltaSync({
    mailboxIds: [mailboxId],
    folderTypes: ['inbox'],
  });

  checkpoint = reopenedStore.getSyncCheckpoint(mailboxId, 'inbox');
  assert.equal(checkpoint.syncStatus, 'delta_armed');
  assert.equal(checkpoint.deltaLink, 'delta-inbox-2');
  assert.equal(checkpoint.changesApplied, 0);
  assert.equal(
    noChangeResult.sync.accountReports[0].statusByFolderType.inbox,
    'DELTA ARMED'
  );
});

test('microsoftGraphMailboxTruthDelta applies add/update/delete changes and remains idempotent on replay', async () => {
  const filePath = await createTempStorePath();
  const mailboxId = 'fazli@hairtpclinic.com';
  const keepMessage = createMessage({
    mailboxId,
    graphUserId: 'user-fazli',
    graphMessageId: 'msg-keep',
    subject: 'Original subject',
  });
  const deleteMessage = createMessage({
    mailboxId,
    graphUserId: 'user-fazli',
    graphMessageId: 'msg-delete',
    subject: 'Delete me',
  });

  const store = await createCcoMailboxTruthStore({ filePath });
  await seedVerifiedFolder(store, {
    mailboxId,
    folderType: 'inbox',
    messages: [keepMessage, deleteMessage],
  });

  const seedDeltaRun = await store.startDeltaRun({
    mailboxIds: [mailboxId],
    folderTypes: ['inbox'],
  });
  await store.recordDeltaPage({
    runId: seedDeltaRun.runId,
    account: {
      graphUserId: 'user-fazli',
      mailboxId,
      mailboxAddress: mailboxId,
      userPrincipalName: mailboxId,
    },
    folder: {
      folderType: 'inbox',
      folderId: 'folder-inbox',
      folderName: 'Inbox',
      wellKnownName: 'inbox',
      totalItemCount: 2,
      unreadItemCount: 2,
    },
    changes: [],
    nextPageUrl: null,
    deltaLink: 'delta-old',
    sourcePageUrl: 'seed-delta',
    pageSize: 200,
    complete: true,
    roundType: 'initial_delta_round',
  });
  await store.finishDeltaRun(seedDeltaRun.runId, { status: 'completed' });

  const updatedMessage = createMessage({
    mailboxId,
    graphUserId: 'user-fazli',
    graphMessageId: 'msg-keep',
    subject: 'Updated subject',
    bodyPreview: 'Updated preview',
    lastModifiedAt: '2026-04-02T09:00:00.000Z',
  });
  const newMessage = createMessage({
    mailboxId,
    graphUserId: 'user-fazli',
    graphMessageId: 'msg-new',
    subject: 'Brand new',
    bodyPreview: 'Nytt mail',
    receivedAt: '2026-04-02T10:00:00.000Z',
    createdAt: '2026-04-02T09:59:59.000Z',
    lastModifiedAt: '2026-04-02T10:00:00.000Z',
  });

  const connectorFactory = () => ({
    async fetchMailboxTruthFolderDeltaPage(options = {}) {
      if (options.cursorUrl === 'delta-old' || options.cursorUrl === 'delta-new') {
        return {
          account: {
            graphUserId: 'user-fazli',
            mailboxId,
            mailboxAddress: mailboxId,
            userPrincipalName: mailboxId,
          },
          folder: {
            folderType: 'inbox',
            folderId: 'folder-inbox',
            folderName: 'Inbox',
            wellKnownName: 'inbox',
            totalItemCount: 2,
            unreadItemCount: 2,
          },
          page: {
            nextPageUrl: null,
            deltaLink: options.cursorUrl === 'delta-old' ? 'delta-new' : 'delta-new-2',
            complete: true,
            sourcePageUrl: 'delta-apply',
          },
          changes: [
            createUpsertChange(updatedMessage),
            createUpsertChange(newMessage),
            createDeleteChange({
              mailboxId,
              folderType: 'inbox',
              graphMessageId: 'msg-delete',
            }),
          ],
        };
      }
      throw new Error(`Unexpected cursor: ${options.cursorUrl}`);
    },
  });

  const delta = createMicrosoftGraphMailboxTruthDelta({
    connectorFactory,
    store,
  });

  await delta.runDeltaSync({
    mailboxIds: [mailboxId],
    folderTypes: ['inbox'],
  });

  let model = store.toNormalizedModel();
  let mailboxMessages = model.messages.filter((message) => message.mailboxId === mailboxId);
  assert.equal(mailboxMessages.length, 2);
  assert.equal(
    mailboxMessages.find((message) => message.graphMessageId === 'msg-keep')?.subject,
    'Updated subject'
  );
  assert.equal(
    mailboxMessages.some((message) => message.graphMessageId === 'msg-delete'),
    false
  );
  assert.equal(
    mailboxMessages.some((message) => message.graphMessageId === 'msg-new'),
    true
  );

  await delta.runDeltaSync({
    mailboxIds: [mailboxId],
    folderTypes: ['inbox'],
  });

  const checkpoint = store.getSyncCheckpoint(mailboxId, 'inbox');
  assert.equal(checkpoint.deltaLink, 'delta-new-2');
  assert.equal(checkpoint.changesApplied, 0);

  model = store.toNormalizedModel();
  mailboxMessages = model.messages.filter((message) => message.mailboxId === mailboxId);
  assert.equal(mailboxMessages.length, 2);
  assert.equal(
    mailboxMessages.find((message) => message.graphMessageId === 'msg-keep')?.subject,
    'Updated subject'
  );
});

test('microsoftGraphMailboxTruthDelta marks invalid delta tokens as resync required without touching worklist semantics', async () => {
  const filePath = await createTempStorePath();
  const mailboxId = 'contact@hairtpclinic.com';
  const message = createMessage({
    mailboxId,
    graphUserId: 'user-contact',
    graphMessageId: 'msg-1',
  });

  const store = await createCcoMailboxTruthStore({ filePath });
  await seedVerifiedFolder(store, {
    mailboxId,
    folderType: 'inbox',
    messages: [message],
  });

  const seedDeltaRun = await store.startDeltaRun({
    mailboxIds: [mailboxId],
    folderTypes: ['inbox'],
  });
  await store.recordDeltaPage({
    runId: seedDeltaRun.runId,
    account: {
      graphUserId: 'user-contact',
      mailboxId,
      mailboxAddress: mailboxId,
      userPrincipalName: mailboxId,
    },
    folder: {
      folderType: 'inbox',
      folderId: 'folder-inbox',
      folderName: 'Inbox',
      wellKnownName: 'inbox',
      totalItemCount: 1,
      unreadItemCount: 1,
    },
    changes: [],
    nextPageUrl: null,
    deltaLink: 'delta-contact-old',
    sourcePageUrl: 'seed-delta',
    pageSize: 200,
    complete: true,
    roundType: 'initial_delta_round',
  });
  await store.finishDeltaRun(seedDeltaRun.runId, { status: 'completed' });

  const delta = createMicrosoftGraphMailboxTruthDelta({
    connectorFactory: () => ({
      async fetchMailboxTruthFolderDeltaPage() {
        const error = new Error('delta token invalid');
        error.code = 'GRAPH_DELTA_TOKEN_INVALID';
        error.status = 410;
        throw error;
      },
    }),
    store,
  });

  await delta.runDeltaSync({
    mailboxIds: [mailboxId],
    folderTypes: ['inbox'],
  });

  const checkpoint = store.getSyncCheckpoint(mailboxId, 'inbox');
  assert.equal(checkpoint.syncStatus, 'resync_required');
  assert.equal(checkpoint.deltaLink, null);

  const report = store.getDeltaSyncReport({
    mailboxIds: [mailboxId],
  });
  assert.equal(report.accountReports[0].statusByFolderType.inbox, 'RESYNC REQUIRED');
  assert.equal(report.accountReports[0].reasonByFolderType.inbox, 'delta_token_invalid');
});

test('microsoftGraphMailboxTruthDelta keeps empty verified folders as verified empty without arming delta', async () => {
  const filePath = await createTempStorePath();
  const store = await createCcoMailboxTruthStore({ filePath });
  const run = await store.startBackfillRun({
    mailboxIds: ['info@hairtpclinic.com'],
    folderTypes: ['drafts'],
  });

  await store.recordFolderPage({
    runId: run.runId,
    account: {
      graphUserId: 'user-info',
      mailboxId: 'info@hairtpclinic.com',
      mailboxAddress: 'info@hairtpclinic.com',
      userPrincipalName: 'info@hairtpclinic.com',
    },
    folder: {
      folderType: 'drafts',
      folderId: 'folder-drafts',
      folderName: 'Drafts',
      wellKnownName: 'Drafts',
      totalItemCount: 0,
      messageCollectionCount: 0,
      unreadItemCount: 0,
    },
    messages: [],
    nextPageUrl: null,
    sourcePageUrl: 'https://graph.example/drafts-empty',
    pageSize: 500,
    complete: true,
  });

  const delta = createMicrosoftGraphMailboxTruthDelta({
    connectorFactory() {
      return {
        async fetchMailboxTruthFolderDeltaPage() {
          throw new Error('empty verified folders should not fetch delta pages');
        },
      };
    },
    store,
  });

  const result = await delta.runDeltaSync({
    mailboxIds: ['info@hairtpclinic.com'],
    folderTypes: ['drafts'],
    pageSize: 500,
    maxPagesPerFolder: 1,
  });

  assert.equal(result.perMailbox[0].folderReports[0].status, 'VERIFIED EMPTY');
  assert.equal(result.perMailbox[0].folderReports[0].reasonCode, 'empty_verified');
  assert.deepEqual(store.getSyncCheckpoint('info@hairtpclinic.com', 'drafts'), {});
});
