const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeMailboxTruthSnapshot,
  summarizeMailboxTruthVerification,
} = require('../../src/infra/microsoftGraphMailboxTruth');

test('normalizeMailboxTruthSnapshot keeps folder-aware message truth and thin conversation index across folders', () => {
  const snapshot = {
    snapshotVersion: 'graph.mailbox.truth.snapshot.v1',
    source: 'microsoft-graph',
    timestamps: {
      capturedAt: '2026-04-02T09:00:00.000Z',
      sourceGeneratedAt: '2026-04-02T09:00:00.000Z',
    },
    accounts: [
      {
        graphUserId: 'user-1',
        mailboxId: 'info@hairtpclinic.com',
        mailboxAddress: 'info@hairtpclinic.com',
        userPrincipalName: 'info@hairtpclinic.com',
        fetchStatus: 'success',
        folders: [
          {
            folderType: 'inbox',
            folderId: 'folder-inbox',
            folderName: 'Inbox',
            wellKnownName: 'inbox',
            fetchStatus: 'success',
            totalItemCount: 11,
            unreadItemCount: 4,
            fetchedMessageCount: 1,
            truncatedByLimit: false,
            messages: [
              {
                graphMessageId: 'msg-in-1',
                conversationId: 'conv-1',
                subject: 'Kan ni hjälpa mig?',
                bodyPreview: 'Jag vill boka en tid.',
                direction: 'inbound',
                isRead: false,
                hasAttachments: false,
                receivedAt: '2026-04-02T08:00:00.000Z',
                from: {
                  address: 'patient@example.com',
                  name: 'Patient',
                },
                toRecipients: [
                  {
                    address: 'info@hairtpclinic.com',
                    name: 'Hair TP Clinic',
                  },
                ],
              },
            ],
          },
          {
            folderType: 'sent',
            folderId: 'folder-sent',
            folderName: 'Sent Items',
            wellKnownName: 'sentitems',
            fetchStatus: 'success',
            totalItemCount: 7,
            unreadItemCount: 0,
            fetchedMessageCount: 1,
            truncatedByLimit: false,
            messages: [
              {
                graphMessageId: 'msg-out-1',
                conversationId: 'conv-1',
                subject: 'Re: Kan ni hjälpa mig?',
                bodyPreview: 'Vi har tider i nästa vecka.',
                direction: 'outbound',
                isRead: null,
                hasAttachments: true,
                attachments: [
                  {
                    id: 'att-out-1',
                    name: 'order.pdf',
                    contentType: 'application/pdf',
                    isInline: false,
                    size: 12000,
                    sourceType: 'graph_file_attachment',
                  },
                ],
                sentAt: '2026-04-02T08:30:00.000Z',
                from: {
                  address: 'info@hairtpclinic.com',
                  name: 'Hair TP Clinic',
                },
                toRecipients: [
                  {
                    address: 'patient@example.com',
                    name: 'Patient',
                  },
                ],
              },
            ],
          },
          {
            folderType: 'drafts',
            folderId: 'folder-drafts',
            folderName: 'Drafts',
            wellKnownName: 'drafts',
            fetchStatus: 'success',
            totalItemCount: 2,
            unreadItemCount: 0,
            fetchedMessageCount: 1,
            truncatedByLimit: false,
            messages: [
              {
                graphMessageId: 'msg-draft-1',
                conversationId: 'conv-2',
                subject: 'Utkast',
                bodyPreview: 'Jag återkommer snart.',
                direction: 'draft',
                isRead: null,
                hasAttachments: false,
                createdAt: '2026-04-02T08:40:00.000Z',
                lastModifiedAt: '2026-04-02T08:45:00.000Z',
                from: {
                  address: 'info@hairtpclinic.com',
                  name: 'Hair TP Clinic',
                },
                toRecipients: [
                  {
                    address: 'patient@example.com',
                    name: 'Patient',
                  },
                ],
              },
            ],
          },
          {
            folderType: 'deleted',
            folderId: 'folder-deleted',
            folderName: 'Deleted Items',
            wellKnownName: 'deleteditems',
            fetchStatus: 'success',
            totalItemCount: 1,
            unreadItemCount: 0,
            fetchedMessageCount: 1,
            truncatedByLimit: false,
            messages: [
              {
                graphMessageId: 'msg-deleted-1',
                conversationId: 'conv-3',
                subject: 'Borttaget mail',
                bodyPreview: 'Detta mail ligger i deleted.',
                direction: 'inbound',
                isRead: true,
                hasAttachments: false,
                receivedAt: '2026-04-01T07:00:00.000Z',
                lastModifiedAt: '2026-04-02T08:50:00.000Z',
                from: {
                  address: 'patient@example.com',
                  name: 'Patient',
                },
                toRecipients: [
                  {
                    address: 'info@hairtpclinic.com',
                    name: 'Hair TP Clinic',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const model = normalizeMailboxTruthSnapshot(snapshot);

  assert.equal(model.modelVersion, 'cco.mailbox.truth.v1');
  assert.equal(model.accounts.length, 1);
  assert.equal(model.folders.length, 4);
  assert.equal(model.messages.length, 4);
  assert.equal(model.conversations.length, 3);
  assert.equal(model.metadata.truncatedFolderCount, 0);

  const sentMessage = model.messages.find((message) => message.graphMessageId === 'msg-out-1');
  const draftMessage = model.messages.find((message) => message.graphMessageId === 'msg-draft-1');
  const deletedMessage = model.messages.find((message) => message.graphMessageId === 'msg-deleted-1');
  assert.equal(sentMessage.folderType, 'sent');
  assert.equal(sentMessage.hasAttachments, true);
  assert.equal(Array.isArray(sentMessage.attachments), true);
  assert.equal(sentMessage.attachments.length, 1);
  assert.equal(sentMessage.attachments[0].name, 'order.pdf');
  assert.equal(draftMessage.direction, 'draft');
  assert.equal(draftMessage.isDraft, true);
  assert.equal(deletedMessage.isDeleted, true);

  const conversation = model.conversations.find(
    (entry) => entry.conversationId === 'conv-1'
  );
  assert.equal(Boolean(conversation), true);
  assert.deepEqual(conversation.folderTypes.sort(), ['inbox', 'sent']);
  assert.equal(conversation.messageIds.length, 2);
  assert.equal(conversation.latestInboundAt, '2026-04-02T08:00:00.000Z');
  assert.equal(conversation.latestOutboundAt, '2026-04-02T08:30:00.000Z');
});

test('summarizeMailboxTruthVerification marks verified, partial, broken and not-verified folder truth explicitly', () => {
  const model = normalizeMailboxTruthSnapshot({
    snapshotVersion: 'graph.mailbox.truth.snapshot.v1',
    source: 'microsoft-graph',
    accounts: [
      {
        graphUserId: 'user-1',
        mailboxId: 'kons@hairtpclinic.com',
        mailboxAddress: 'kons@hairtpclinic.com',
        userPrincipalName: 'kons@hairtpclinic.com',
        fetchStatus: 'partial',
        folders: [
          {
            folderType: 'inbox',
            folderId: 'folder-inbox',
            folderName: 'Inbox',
            wellKnownName: 'inbox',
            fetchStatus: 'success',
            totalItemCount: 12,
            unreadItemCount: 2,
            fetchedMessageCount: 12,
            truncatedByLimit: false,
            messages: [],
          },
          {
            folderType: 'sent',
            folderId: 'folder-sent',
            folderName: 'Sent Items',
            wellKnownName: 'sentitems',
            fetchStatus: 'success',
            totalItemCount: 120,
            unreadItemCount: 0,
            fetchedMessageCount: 50,
            truncatedByLimit: true,
            messages: [],
          },
          {
            folderType: 'drafts',
            folderId: 'folder-drafts',
            folderName: 'Drafts',
            wellKnownName: 'drafts',
            fetchStatus: 'error',
            totalItemCount: 0,
            unreadItemCount: 0,
            fetchedMessageCount: 0,
            truncatedByLimit: false,
            messages: [],
          },
        ],
      },
    ],
  });

  const summary = summarizeMailboxTruthVerification(model, {
    expectedMailboxIds: ['kons@hairtpclinic.com', 'missing@hairtpclinic.com'],
  });
  assert.equal(summary.overallStatus, 'BROKEN');
  assert.equal(summary.accountSummaries.length, 2);
  const account = summary.accountSummaries[0];
  assert.equal(account.accountStatus, 'BROKEN');
  assert.equal(account.statusByFolderType.inbox, 'VERIFIED');
  assert.equal(account.reasonByFolderType.inbox, 'verified');
  assert.equal(account.statusByFolderType.sent, 'PARTIAL');
  assert.equal(account.reasonByFolderType.sent, 'cap_truncated');
  assert.equal(account.statusByFolderType.drafts, 'BROKEN');
  assert.equal(account.reasonByFolderType.drafts, 'fetch_error');
  assert.equal(account.statusByFolderType.deleted, 'NOT VERIFIED');
  assert.equal(account.reasonByFolderType.deleted, 'folder_missing');

  const missingAccount = summary.accountSummaries[1];
  assert.equal(missingAccount.mailboxId, 'missing@hairtpclinic.com');
  assert.equal(missingAccount.accountStatus, 'NOT VERIFIED');
  assert.equal(missingAccount.statusByFolderType.inbox, 'NOT VERIFIED');
  assert.equal(missingAccount.reasonByFolderType.inbox, 'account_not_returned');
});
