const test = require('node:test');
const assert = require('node:assert/strict');

const { createCcoMailboxTruthReadAdapter } = require('../../src/ops/ccoMailboxTruthReadAdapter');

function mockStore(messages, completeness = null) {
  const defaultCompleteness = {
    accountReports: [
      {
        mailboxId: 'clinic@demo.se',
        mailboxAddress: 'clinic@demo.se',
        accountStatus: 'VERIFIED',
        statusByFolderType: {
          inbox: 'VERIFIED',
          sent: 'VERIFIED',
          drafts: 'VERIFIED',
          deleted: 'VERIFIED',
        },
        reasonByFolderType: {},
        detailByFolderType: {},
        folderCounts: [],
      },
    ],
  };
  return {
    listMessages: ({ mailboxIds = [] } = {}) => {
      if (!mailboxIds.length) return [...messages];
      return messages.filter((m) => mailboxIds.includes(m.mailboxId));
    },
    getCompletenessReport: () => completeness || defaultCompleteness,
  };
}

test('createCcoMailboxTruthReadAdapter returns null without valid store', () => {
  assert.equal(createCcoMailboxTruthReadAdapter(), null);
  assert.equal(createCcoMailboxTruthReadAdapter({ store: {} }), null);
  assert.equal(
    createCcoMailboxTruthReadAdapter({ store: { listMessages: () => [], getCompletenessReport: null } }),
    null,
  );
});

test('listHistoryMessages filters by conversationId', () => {
  const iso = '2026-05-10T12:00:00.000Z';
  const messages = [
    {
      graphMessageId: 'g-a',
      mailboxId: 'clinic@demo.se',
      conversationId: 'thread-alpha',
      subject: 'First',
      folderType: 'inbox',
      from: { address: 'a@patient.se' },
      receivedAt: iso,
    },
    {
      graphMessageId: 'g-b',
      mailboxId: 'clinic@demo.se',
      conversationId: 'thread-beta',
      subject: 'Second',
      folderType: 'inbox',
      from: { address: 'b@patient.se' },
      receivedAt: '2026-05-11T12:00:00.000Z',
    },
  ];
  const adapter = createCcoMailboxTruthReadAdapter({ store: mockStore(messages) });
  const rows = adapter.listHistoryMessages({
    mailboxIds: ['clinic@demo.se'],
    conversationId: 'thread-alpha',
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].graphMessageId, 'g-a');
});

test('listHistoryMessages strips bodyHtml when includeBodyHtml is false', () => {
  const messages = [
    {
      graphMessageId: 'g1',
      mailboxId: 'clinic@demo.se',
      subject: 'S',
      folderType: 'inbox',
      from: { address: 'c@x.se' },
      receivedAt: '2026-05-01T10:00:00.000Z',
      bodyHtml: '<p>secret</p>',
    },
  ];
  const adapter = createCcoMailboxTruthReadAdapter({ store: mockStore(messages) });
  const rows = adapter.listHistoryMessages({
    mailboxIds: ['clinic@demo.se'],
    includeBodyHtml: false,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bodyHtml, null);
});

test('searchHistoryMessages requires all query tokens to match', () => {
  const messages = [
    {
      graphMessageId: 'g1',
      mailboxId: 'clinic@demo.se',
      subject: 'Booking follow up',
      bodyPreview: 'Please confirm Tuesday',
      folderType: 'inbox',
      from: { address: 'guest@example.com', name: 'Guest User' },
      receivedAt: '2026-05-02T08:00:00.000Z',
    },
  ];
  const adapter = createCcoMailboxTruthReadAdapter({ store: mockStore(messages) });
  const hit = adapter.searchHistoryMessages({
    mailboxIds: ['clinic@demo.se'],
    q: 'booking tuesday',
    limit: 10,
  });
  assert.equal(hit.length, 1);

  const miss = adapter.searchHistoryMessages({
    mailboxIds: ['clinic@demo.se'],
    q: 'booking missingtoken',
    limit: 10,
  });
  assert.equal(miss.length, 0);
});

test('getHistoryCoverage marks incomplete when a folder is not VERIFIED', () => {
  const messages = [{ mailboxId: 'mb1', graphMessageId: 'x', subject: 's', folderType: 'inbox' }];
  const store = mockStore(messages, {
    accountReports: [
      {
        mailboxId: 'mb1',
        mailboxAddress: 'mb1',
        accountStatus: 'PARTIAL',
        statusByFolderType: {
          inbox: 'VERIFIED',
          sent: 'MISSING',
          drafts: 'VERIFIED',
          deleted: 'VERIFIED',
        },
        reasonByFolderType: { sent: 'backfill pending' },
        detailByFolderType: { sent: 'no window' },
        folderCounts: [],
      },
    ],
  });
  const adapter = createCcoMailboxTruthReadAdapter({ store });
  const cov = adapter.getHistoryCoverage({ mailboxIds: ['mb1'] });
  assert.equal(cov.source, 'mailbox_truth_store');
  assert.equal(cov.coverage.complete, false);
  assert.ok(cov.coverage.missingWindowCount >= 1);
  assert.equal(cov.mailboxes[0].mailbox.messageCount, 1);
  assert.equal(cov.mailboxes[0].folderStatuses.inbox, 'VERIFIED');
  assert.equal(cov.mailboxes[0].folderStatuses.sent, 'MISSING');
});

test('getFidelityInventory identifies local MIME and attachment metadata gaps without reading content', () => {
  const messages = [
    {
      graphMessageId: 'rich-missing-mime',
      mailboxId: 'clinic@demo.se',
      folderType: 'inbox',
      receivedAt: '2025-01-01T10:00:00.000Z',
      bodyHtml: '<p>Hej</p><img src="cid:logo-1">',
      hasAttachments: true,
      attachments: [],
    },
    {
      graphMessageId: 'complete-rich-mail',
      mailboxId: 'clinic@demo.se',
      folderType: 'sent',
      receivedAt: '2025-01-02T10:00:00.000Z',
      bodyHtml: '<p>Hej</p><img src="cid:logo-2">',
      hasAttachments: true,
      attachments: [{ id: 'asset-2', contentId: '<logo-2>', contentType: 'image/png' }],
      mime: { available: true },
    },
    {
      graphMessageId: 'complete-local-rich-mail',
      mailboxId: 'clinic@demo.se',
      folderType: 'inbox',
      receivedAt: '2025-01-03T10:00:00.000Z',
      bodyHtml: '<p>Hej</p><img src="cid:logo-3">',
      hasAttachments: true,
      attachments: [{ id: 'asset-3', contentId: '<logo-3>', contentType: 'image/png' }],
    },
  ];
  const adapter = createCcoMailboxTruthReadAdapter({ store: mockStore(messages) });
  const inventory = adapter.getFidelityInventory({
    mailboxIds: ['clinic@demo.se'],
    sampleLimit: 10,
  });

  assert.equal(inventory.summary.messages, 3);
  assert.equal(inventory.summary.mimeAvailable, 1);
  assert.equal(inventory.summary.declaredAttachmentsWithoutMetadata, 1);
  assert.equal(inventory.summary.cidWithoutAttachmentMetadata, 1);
  assert.equal(inventory.summary.richCandidatesWithoutMime, 2);
  assert.equal(inventory.summary.fidelityGapCount, 1);
  assert.deepEqual(inventory.samples, [
    {
      messageId: 'rich-missing-mime',
      mailboxId: 'clinic@demo.se',
      folderType: 'inbox',
      observedAt: '2025-01-01T10:00:00.000Z',
      reasons: [
        'declared_attachment_without_metadata',
        'cid_without_attachment_metadata',
      ],
    },
  ]);
});
