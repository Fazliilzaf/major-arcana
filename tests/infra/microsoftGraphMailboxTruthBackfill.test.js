const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');
const {
  createMicrosoftGraphMailboxTruthBackfill,
} = require('../../src/infra/microsoftGraphMailboxTruthBackfill');

async function createTempStorePath() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-truth-'));
  return path.join(dir, 'mailbox-truth-store.json');
}

test('ccoMailboxTruthStore bevarar identity-envelope i meddelanden och conversation-indexet utan ny härledning', async () => {
  const filePath = await createTempStorePath();
  const store = await createCcoMailboxTruthStore({ filePath });
  const run = await store.startBackfillRun({
    mailboxIds: ['kons@hairtpclinic.com'],
    folderTypes: ['inbox'],
  });

  await store.recordFolderPage({
    runId: run.runId,
    account: {
      graphUserId: 'user-1',
      mailboxId: 'kons@hairtpclinic.com',
      mailboxAddress: 'kons@hairtpclinic.com',
      userPrincipalName: 'kons@hairtpclinic.com',
    },
    folder: {
      folderType: 'inbox',
      folderId: 'folder-inbox',
      folderName: 'Inbox',
      wellKnownName: 'inbox',
      totalItemCount: 1,
      messageCollectionCount: 1,
      unreadItemCount: 1,
    },
    messages: [
      {
        graphMessageId: 'msg-identity-1',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxAddress: 'kons@hairtpclinic.com',
        userPrincipalName: 'kons@hairtpclinic.com',
        graphUserId: 'user-1',
        folderId: 'folder-inbox',
        folderName: 'Inbox',
        folderType: 'inbox',
        wellKnownName: 'inbox',
        conversationId: 'conv-identity',
        mailboxConversationId: 'kons@hairtpclinic.com:conv-identity',
        subject: 'Hej',
        bodyPreview: 'Hej från kund',
        direction: 'inbound',
        isRead: false,
        hasAttachments: false,
        isDraft: false,
        isDeleted: false,
        receivedAt: '2026-04-02T08:00:00.000Z',
        sentAt: '2026-04-02T07:59:59.000Z',
        createdAt: '2026-04-02T07:59:59.000Z',
        lastModifiedAt: '2026-04-02T08:00:00.000Z',
        from: { address: 'patient@example.com', name: 'Patient' },
        toRecipients: [{ address: 'kons@hairtpclinic.com', name: 'Kons' }],
        ccRecipients: [],
        bccRecipients: [],
        replyToRecipients: [],
        internetMessageId: 'message-identity-1@example.com',
        customerIdentity: {
          canonicalCustomerId: 'cust-1',
          canonicalContactId: 'contact-1',
          explicitMergeGroupId: 'merge-1',
          verifiedPersonalEmailNormalized: 'patient@example.com',
          verifiedPhoneE164: '+46701234567',
          identitySource: 'backend',
          identityConfidence: 'strong',
          provenance: {
            source: 'backend',
            mailboxIds: ['kons@hairtpclinic.com'],
            conversationIds: ['conv-identity'],
            sourceRecordIds: ['msg-identity-1'],
          },
        },
        hardConflictSignals: [
          { type: 'email', left: 'patient@example.com', right: 'patient@example.com', reason: 'match' },
        ],
        mergeReviewDecisionsByPairId: {
          'pair-1': { decision: 'dismissed', decidedAt: '2026-04-02T08:05:00.000Z' },
        },
        identityProvenance: {
          source: 'backend',
          mailboxIds: ['kons@hairtpclinic.com'],
          conversationIds: ['conv-identity'],
          sourceRecordIds: ['msg-identity-1'],
        },
      },
    ],
    nextPageUrl: null,
    sourcePageUrl: 'https://graph.example/first-page',
    pageSize: 1,
    complete: true,
  });

  const model = store.toNormalizedModel();
  assert.equal(model.messages[0]?.customerIdentity?.canonicalCustomerId, 'cust-1');
  assert.equal(model.messages[0]?.hardConflictSignals?.length, 1);
  assert.equal(
    model.messages[0]?.mergeReviewDecisionsByPairId?.['pair-1']?.decision,
    'dismissed'
  );
  assert.equal(model.conversations[0]?.customerIdentity?.canonicalCustomerId, 'cust-1');
  assert.equal(model.conversations[0]?.identityProvenance?.source, 'backend');
});

test('ccoMailboxTruthStore persists folder completeness metadata and rebuilds mailbox conversations', async () => {
  const filePath = await createTempStorePath();
  const store = await createCcoMailboxTruthStore({ filePath });
  const run = await store.startBackfillRun({
    mailboxIds: ['kons@hairtpclinic.com'],
    folderTypes: ['inbox'],
  });

  await store.recordFolderPage({
    runId: run.runId,
    account: {
      graphUserId: 'user-1',
      mailboxId: 'kons@hairtpclinic.com',
      mailboxAddress: 'kons@hairtpclinic.com',
      userPrincipalName: 'kons@hairtpclinic.com',
    },
    folder: {
      folderType: 'inbox',
      folderId: 'folder-inbox',
      folderName: 'Inbox',
      wellKnownName: 'inbox',
      totalItemCount: 2,
      messageCollectionCount: 2,
      unreadItemCount: 1,
    },
    messages: [
      {
        graphMessageId: 'msg-1',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxAddress: 'kons@hairtpclinic.com',
        userPrincipalName: 'kons@hairtpclinic.com',
        graphUserId: 'user-1',
        folderId: 'folder-inbox',
        folderName: 'Inbox',
        folderType: 'inbox',
        wellKnownName: 'inbox',
        conversationId: 'conv-1',
        mailboxConversationId: 'kons@hairtpclinic.com:conv-1',
        subject: 'Hej',
        bodyPreview: 'Hej från kund',
        direction: 'inbound',
        isRead: false,
        hasAttachments: false,
        isDraft: false,
        isDeleted: false,
        receivedAt: '2026-04-02T08:00:00.000Z',
        sentAt: '2026-04-02T07:59:59.000Z',
        createdAt: '2026-04-02T07:59:59.000Z',
        lastModifiedAt: '2026-04-02T08:00:00.000Z',
        from: { address: 'patient@example.com', name: 'Patient' },
        toRecipients: [{ address: 'kons@hairtpclinic.com', name: 'Kons' }],
        ccRecipients: [],
        bccRecipients: [],
        replyToRecipients: [],
        internetMessageId: 'message-1@example.com',
        inReplyTo: null,
        references: [],
      },
    ],
    nextPageUrl: 'https://graph.example/next-page',
    sourcePageUrl: 'https://graph.example/first-page',
    pageSize: 1,
    complete: false,
  });

  let report = store.getCompletenessReport({
    mailboxIds: ['kons@hairtpclinic.com'],
  });
  assert.equal(report.overallStatus, 'PARTIAL');
  assert.equal(report.accountReports[0].reasonByFolderType.inbox, 'backfill_incomplete');

  await store.recordFolderPage({
    runId: run.runId,
    account: {
      graphUserId: 'user-1',
      mailboxId: 'kons@hairtpclinic.com',
      mailboxAddress: 'kons@hairtpclinic.com',
      userPrincipalName: 'kons@hairtpclinic.com',
    },
    folder: {
      folderType: 'inbox',
      folderId: 'folder-inbox',
      folderName: 'Inbox',
      wellKnownName: 'inbox',
      totalItemCount: 2,
      messageCollectionCount: 2,
      unreadItemCount: 1,
    },
    messages: [
      {
        graphMessageId: 'msg-2',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxAddress: 'kons@hairtpclinic.com',
        userPrincipalName: 'kons@hairtpclinic.com',
        graphUserId: 'user-1',
        folderId: 'folder-inbox',
        folderName: 'Inbox',
        folderType: 'inbox',
        wellKnownName: 'inbox',
        conversationId: 'conv-1',
        mailboxConversationId: 'kons@hairtpclinic.com:conv-1',
        subject: 'Re: Hej',
        bodyPreview: 'Vi återkommer.',
        direction: 'outbound',
        isRead: true,
        hasAttachments: false,
        isDraft: false,
        isDeleted: false,
        receivedAt: null,
        sentAt: '2026-04-02T08:30:00.000Z',
        createdAt: '2026-04-02T08:29:59.000Z',
        lastModifiedAt: '2026-04-02T08:30:00.000Z',
        from: { address: 'kons@hairtpclinic.com', name: 'Kons' },
        toRecipients: [{ address: 'patient@example.com', name: 'Patient' }],
        ccRecipients: [],
        bccRecipients: [],
        replyToRecipients: [],
        internetMessageId: 'message-2@example.com',
        inReplyTo: 'message-1@example.com',
        references: ['message-1@example.com'],
      },
    ],
    nextPageUrl: null,
    sourcePageUrl: 'https://graph.example/second-page',
    pageSize: 1,
    complete: true,
  });

  report = store.getCompletenessReport({
    mailboxIds: ['kons@hairtpclinic.com'],
  });
  assert.equal(report.overallStatus, 'NOT VERIFIED');
  assert.equal(report.accountReports[0].statusByFolderType.inbox, 'VERIFIED');
  assert.equal(report.accountReports[0].reasonByFolderType.inbox, 'verified');

  const model = store.toNormalizedModel();
  assert.equal(model.messages.length, 2);
  assert.equal(model.conversations.length, 1);
  assert.equal(model.conversations[0].messageIds.length, 2);
});

test('microsoftGraphMailboxTruthBackfill backfills paged folders into the persistent truth store', async () => {
  const filePath = await createTempStorePath();
  const store = await createCcoMailboxTruthStore({ filePath });

  const responses = {
    'fazli@hairtpclinic.com:inbox:initial': {
      account: {
        graphUserId: 'user-fazli',
        mailboxId: 'fazli@hairtpclinic.com',
        mailboxAddress: 'fazli@hairtpclinic.com',
        userPrincipalName: 'fazli@hairtpclinic.com',
      },
      folder: {
        folderType: 'inbox',
        folderId: 'folder-inbox',
        folderName: 'Inbox',
        wellKnownName: 'inbox',
        totalItemCount: 2,
        messageCollectionCount: 2,
        unreadItemCount: 1,
      },
      page: {
        fetchedMessageCount: 1,
        nextPageUrl: 'cursor-2',
        pageSize: 1,
        complete: false,
        sourcePageUrl: 'page-1',
      },
      messages: [
        {
          graphMessageId: 'fazli-in-1',
          mailboxId: 'fazli@hairtpclinic.com',
          mailboxAddress: 'fazli@hairtpclinic.com',
          userPrincipalName: 'fazli@hairtpclinic.com',
          graphUserId: 'user-fazli',
          folderId: 'folder-inbox',
          folderName: 'Inbox',
          folderType: 'inbox',
          wellKnownName: 'inbox',
          conversationId: 'conv-fazli',
          subject: 'Hej',
          bodyPreview: 'Första sidan',
          direction: 'inbound',
          isRead: false,
          hasAttachments: false,
          isDraft: false,
          isDeleted: false,
          receivedAt: '2026-04-02T08:00:00.000Z',
          sentAt: '2026-04-02T07:59:59.000Z',
          createdAt: '2026-04-02T07:59:59.000Z',
          lastModifiedAt: '2026-04-02T08:00:00.000Z',
          from: { address: 'patient@example.com', name: 'Patient' },
          toRecipients: [{ address: 'fazli@hairtpclinic.com', name: 'Fazli' }],
          ccRecipients: [],
          bccRecipients: [],
          replyToRecipients: [],
          internetMessageId: 'fazli-in-1@example.com',
          inReplyTo: null,
          references: [],
        },
      ],
    },
    'fazli@hairtpclinic.com:inbox:cursor-2': {
      account: {
        graphUserId: 'user-fazli',
        mailboxId: 'fazli@hairtpclinic.com',
        mailboxAddress: 'fazli@hairtpclinic.com',
        userPrincipalName: 'fazli@hairtpclinic.com',
      },
      folder: {
        folderType: 'inbox',
        folderId: 'folder-inbox',
        folderName: 'Inbox',
        wellKnownName: 'inbox',
        totalItemCount: 2,
        messageCollectionCount: 2,
        unreadItemCount: 1,
      },
      page: {
        fetchedMessageCount: 1,
        nextPageUrl: null,
        pageSize: 1,
        complete: true,
        sourcePageUrl: 'page-2',
      },
      messages: [
        {
          graphMessageId: 'fazli-in-2',
          mailboxId: 'fazli@hairtpclinic.com',
          mailboxAddress: 'fazli@hairtpclinic.com',
          userPrincipalName: 'fazli@hairtpclinic.com',
          graphUserId: 'user-fazli',
          folderId: 'folder-inbox',
          folderName: 'Inbox',
          folderType: 'inbox',
          wellKnownName: 'inbox',
          conversationId: 'conv-fazli',
          subject: 'Re: Hej',
          bodyPreview: 'Andra sidan',
          direction: 'outbound',
          isRead: true,
          hasAttachments: false,
          isDraft: false,
          isDeleted: false,
          receivedAt: null,
          sentAt: '2026-04-02T08:30:00.000Z',
          createdAt: '2026-04-02T08:29:59.000Z',
          lastModifiedAt: '2026-04-02T08:30:00.000Z',
          from: { address: 'fazli@hairtpclinic.com', name: 'Fazli' },
          toRecipients: [{ address: 'patient@example.com', name: 'Patient' }],
          ccRecipients: [],
          bccRecipients: [],
          replyToRecipients: [],
          internetMessageId: 'fazli-in-2@example.com',
          inReplyTo: 'fazli-in-1@example.com',
          references: ['fazli-in-1@example.com'],
        },
      ],
    },
  };

  const connectorFactory = (mailboxId) => ({
    async fetchMailboxTruthFolderPage(options = {}) {
      const cursor = options.nextPageUrl ? options.nextPageUrl : 'initial';
      const key = `${mailboxId}:${options.folderType}:${cursor}`;
      const response = responses[key];
      if (!response) {
        return {
          account: {
            graphUserId: `user-${mailboxId}`,
            mailboxId,
            mailboxAddress: mailboxId,
            userPrincipalName: mailboxId,
          },
          folder: {
            folderType: options.folderType,
            folderId: `folder-${options.folderType}`,
            folderName: options.folderType,
            wellKnownName: options.folderType,
            totalItemCount: 0,
            unreadItemCount: 0,
          },
          page: {
            fetchedMessageCount: 0,
            nextPageUrl: null,
            pageSize: options.pageSize,
            complete: true,
            sourcePageUrl: 'empty-page',
          },
          messages: [],
        };
      }
      return response;
    },
  });

  const backfill = createMicrosoftGraphMailboxTruthBackfill({
    connectorFactory,
    store,
    now: () => Date.parse('2026-04-02T10:00:00.000Z'),
  });

  const result = await backfill.runBackfill({
    mailboxIds: ['fazli@hairtpclinic.com'],
    folderTypes: ['inbox', 'sent', 'drafts', 'deleted'],
    includeRead: true,
    sinceIso: '2026-04-01T00:00:00.000Z',
    pageSize: 1,
    maxPagesPerFolder: 10,
    resume: false,
  });

  assert.equal(result.completeness.overallStatus, 'VERIFIED');
  assert.equal(result.perMailbox.length, 1);
  assert.equal(result.perMailbox[0].accountStatus, 'VERIFIED');
  assert.equal(result.perMailbox[0].folderReports[0].pagesFetched, 2);

  const report = store.getCompletenessReport({
    mailboxIds: ['fazli@hairtpclinic.com'],
  });
  assert.equal(report.accountReports[0].statusByFolderType.inbox, 'VERIFIED');
  assert.equal(report.accountReports[0].reasonByFolderType.drafts, 'empty_verified');

  const model = store.toNormalizedModel();
  assert.equal(model.messages.length, 2);
  assert.equal(model.messages[0].mailboxConversationId, 'fazli@hairtpclinic.com:conv-fazli');
  assert.equal(model.messages[1].mailboxConversationId, 'fazli@hairtpclinic.com:conv-fazli');
  assert.equal(model.conversations.length, 1);
});

test('ccoMailboxTruthStore writes compact JSON so large truth stores stay serializable', async () => {
  const filePath = await createTempStorePath();
  const store = await createCcoMailboxTruthStore({ filePath });

  const run = await store.startBackfillRun({
    mailboxIds: ['kons@hairtpclinic.com', 'contact@hairtpclinic.com'],
    folderTypes: ['inbox'],
  });

  await store.recordFolderPage({
    runId: run.runId,
    account: {
      graphUserId: 'user-kons',
      mailboxId: 'kons@hairtpclinic.com',
      mailboxAddress: 'kons@hairtpclinic.com',
      userPrincipalName: 'kons@hairtpclinic.com',
    },
    folder: {
      folderType: 'inbox',
      folderId: 'folder-inbox',
      folderName: 'Inbox',
      wellKnownName: 'inbox',
      totalItemCount: 0,
      unreadItemCount: 0,
      messageCollectionCount: 0,
    },
    messages: [],
    nextPageUrl: null,
    sourcePageUrl: 'mock://kons/inbox',
    pageSize: 500,
    complete: true,
  });

  const raw = await fs.readFile(filePath, 'utf8');
  assert.equal(raw.endsWith('\n'), true);
  assert.equal(raw.includes('\n  '), false);
  assert.doesNotThrow(() => JSON.parse(raw));
});

test('ccoMailboxTruthStore migrates persisted messages to mailboxConversationId-backed conversations on load', async () => {
  const filePath = await createTempStorePath();
  await fs.writeFile(
    filePath,
    `${JSON.stringify(
      {
        version: 1,
        createdAt: '2026-04-02T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
        accounts: {
          'kons@hairtpclinic.com': {
            mailboxId: 'kons@hairtpclinic.com',
            mailboxAddress: 'kons@hairtpclinic.com',
            userPrincipalName: 'kons@hairtpclinic.com',
            graphUserId: 'user-1',
          },
        },
        folders: {},
        messages: {
          'kons@hairtpclinic.com:msg-1': {
            graphMessageId: 'msg-1',
            mailboxId: 'kons@hairtpclinic.com',
            mailboxAddress: 'kons@hairtpclinic.com',
            userPrincipalName: 'kons@hairtpclinic.com',
            graphUserId: 'user-1',
            folderType: 'inbox',
            conversationId: 'conv-1',
            internetMessageId: 'message-1@example.com',
            receivedAt: '2026-04-02T08:00:00.000Z',
            lastModifiedAt: '2026-04-02T08:00:00.000Z',
            direction: 'inbound',
            isRead: false,
            hasAttachments: false,
            references: [],
          },
        },
        conversations: {},
        syncRuns: [],
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  const store = await createCcoMailboxTruthStore({ filePath });
  const model = store.toNormalizedModel();
  assert.equal(model.messages.length, 1);
  assert.equal(model.messages[0].mailboxConversationId, 'kons@hairtpclinic.com:conv-1');
  assert.equal(model.conversations.length, 1);
  assert.equal(model.conversations[0].mailboxConversationId, 'kons@hairtpclinic.com:conv-1');
});

test('ccoMailboxTruthStore verifies folder completeness against Graph message collection count when folder total is broader', async () => {
  const filePath = await createTempStorePath();
  const store = await createCcoMailboxTruthStore({ filePath });
  const run = await store.startBackfillRun({
    mailboxIds: ['fazli@hairtpclinic.com'],
    folderTypes: ['deleted'],
  });

  await store.recordFolderPage({
    runId: run.runId,
    account: {
      graphUserId: 'user-fazli',
      mailboxId: 'fazli@hairtpclinic.com',
      mailboxAddress: 'fazli@hairtpclinic.com',
      userPrincipalName: 'fazli@hairtpclinic.com',
    },
    folder: {
      folderType: 'deleted',
      folderId: 'folder-deleted',
      folderName: 'Deleted Items',
      wellKnownName: 'DeletedItems',
      totalItemCount: 3206,
      messageCollectionCount: 3178,
      unreadItemCount: 14,
    },
    messages: Array.from({ length: 3178 }, (_, index) => ({
      graphMessageId: `deleted-${index + 1}`,
      mailboxId: 'fazli@hairtpclinic.com',
      mailboxAddress: 'fazli@hairtpclinic.com',
      userPrincipalName: 'fazli@hairtpclinic.com',
      graphUserId: 'user-fazli',
      folderId: 'folder-deleted',
      folderName: 'Deleted Items',
      folderType: 'deleted',
      wellKnownName: 'DeletedItems',
      conversationId: `conv-${index + 1}`,
      subject: `Deleted ${index + 1}`,
      bodyPreview: 'Deleted item',
      direction: 'unknown',
      isRead: true,
      hasAttachments: false,
      isDraft: false,
      isDeleted: true,
      receivedAt: null,
      sentAt: null,
      createdAt: '2026-04-02T08:00:00.000Z',
      lastModifiedAt: '2026-04-02T08:00:00.000Z',
      from: { address: 'patient@example.com', name: 'Patient' },
      toRecipients: [],
      ccRecipients: [],
      bccRecipients: [],
      replyToRecipients: [],
      internetMessageId: `deleted-${index + 1}@example.com`,
      inReplyTo: null,
      references: [],
    })),
    nextPageUrl: null,
    sourcePageUrl: 'https://graph.example/deleted-page',
    pageSize: 500,
    complete: true,
  });

  const report = store.getCompletenessReport({
    mailboxIds: ['fazli@hairtpclinic.com'],
  });
  assert.equal(report.accountReports[0].statusByFolderType.deleted, 'VERIFIED');
  assert.equal(
    report.accountReports[0].reasonByFolderType.deleted,
    'verified_message_collection_count'
  );
});

test('ccoMailboxTruthStore delta sync report marks empty verified folders explicitly', async () => {
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

  const report = store.getDeltaSyncReport({
    mailboxIds: ['info@hairtpclinic.com'],
  });
  assert.equal(report.accountReports[0].statusByFolderType.drafts, 'VERIFIED EMPTY');
  assert.equal(report.accountReports[0].reasonByFolderType.drafts, 'empty_verified');
});
