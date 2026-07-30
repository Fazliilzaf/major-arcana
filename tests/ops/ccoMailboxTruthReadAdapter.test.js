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
    createCcoMailboxTruthReadAdapter({
      store: { listMessages: () => [], getCompletenessReport: null },
    }),
    null
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
      subject: 'Bokningsbekräftelse',
      from: { address: 'patient@example.com', name: 'Pat Ient' },
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
      subject: 'Bokningsbekräftelse',
      counterparty: 'Pat Ient <patient@example.com>',
      reasons: ['declared_attachment_without_metadata', 'cid_without_attachment_metadata'],
    },
  ]);
});

test('getFidelityInventory-provet pekar ut mottagaren för utgående gap, inte avsändaren', () => {
  // Ett prov utan motpart går inte att slå upp — bara messageId, ingen ledtråd
  // om vem operatören ska öppna meddelandet mot. Utgående/utkast ska peka på
  // mottagaren, inte den egna brevlådan.
  const messages = [
    {
      graphMessageId: 'outbound-missing-mime',
      mailboxId: 'clinic@demo.se',
      folderType: 'sent',
      subject: 'Uppföljning',
      from: { address: 'clinic@demo.se', name: 'Clinic' },
      toRecipients: [{ address: 'patient@example.com', name: 'Pat Ient' }],
      receivedAt: '2025-01-04T10:00:00.000Z',
      bodyHtml: '<p>Hej</p><img src="cid:logo-4">',
      hasAttachments: true,
      attachments: [],
    },
  ];
  const adapter = createCcoMailboxTruthReadAdapter({ store: mockStore(messages) });
  const inventory = adapter.getFidelityInventory({
    mailboxIds: ['clinic@demo.se'],
    sampleLimit: 10,
  });
  assert.equal(inventory.samples[0]?.subject, 'Uppföljning');
  assert.equal(inventory.samples[0]?.counterparty, 'Pat Ient <patient@example.com>');
});

test('getCidFidelityManifest partitions each missing CID without exposing mail content', () => {
  const adapter = createCcoMailboxTruthReadAdapter({
    store: mockStore([
      {
        graphMessageId: 'cid-gap-inbox',
        mailboxId: 'clinic@demo.se',
        folderType: 'inbox',
        receivedAt: '2026-07-01T10:00:00.000Z',
        bodyHtml: '<div><img src="cid:logo-a"><img src="cid:logo-b"></div>',
        attachments: [{ id: 'asset-b', contentId: '<logo-b>', contentType: 'image/png' }],
      },
      {
        graphMessageId: 'cid-gap-sent',
        mailboxId: 'clinic@demo.se',
        folderType: 'sent',
        direction: 'outbound',
        sentAt: '2026-07-02T10:00:00.000Z',
        bodyHtml: '<div><img src="cid:signature-logo"></div>',
        attachments: [],
      },
    ]),
  });

  const manifest = adapter.getCidFidelityManifest({
    mailboxIds: ['clinic@demo.se'],
    limit: 10,
  });

  assert.equal(manifest.summary.messagesWithMissingCidMetadata, 2);
  assert.equal(manifest.summary.cidReferencesWithoutAttachmentMetadata, 2);
  assert.deepEqual(manifest.summary.byFolderType, { inbox: 1, sent: 1 });
  assert.deepEqual(manifest.summary.byMessageType, { inbound: 1, outbound: 1 });
  assert.equal(manifest.entries.length, 2);
  assert.deepEqual(manifest.entries[0], {
    messageId: 'cid-gap-sent',
    mailboxId: 'clinic@demo.se',
    folderType: 'sent',
    messageType: 'outbound',
    observedAt: '2026-07-02T10:00:00.000Z',
    attachmentId: null,
    cid: 'signature-logo',
    htmlReferencesCid: true,
    localAttachmentMetadata: null,
    localBlob: {
      available: null,
      state: 'not_addressable_without_attachment_metadata',
    },
  });
  assert.equal('bodyHtml' in manifest.entries[0], false);
  assert.equal('subject' in manifest.entries[0], false);
});
