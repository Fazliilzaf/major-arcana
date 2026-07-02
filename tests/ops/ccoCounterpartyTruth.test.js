const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractEmail,
  humanizeCounterpartyEmail,
  normalizeCounterpartyDirection,
  resolveCounterpartyDisplayName,
  resolveCounterpartyIdentity,
} = require('../../src/ops/ccoCounterpartyTruth');
const {
  createCcoMailboxTruthWorklistReadModel,
} = require('../../src/ops/ccoMailboxTruthWorklistReadModel');
const { createCcoMailboxTruthReadAdapter } = require('../../src/ops/ccoMailboxTruthReadAdapter');

test('extractEmail trims casing and picks first address-like token', () => {
  assert.equal(extractEmail('  Foo@Bar.COM  '), 'foo@bar.com');
  assert.equal(extractEmail('no email here'), '');
  assert.equal(extractEmail(null), '');
});

test('normalizeCounterpartyDirection maps draft to outbound and unknown otherwise', () => {
  assert.equal(normalizeCounterpartyDirection('  DRAFT '), 'outbound');
  assert.equal(normalizeCounterpartyDirection('Inbound'), 'inbound');
  assert.equal(normalizeCounterpartyDirection('OUTBOUND'), 'outbound');
  assert.equal(normalizeCounterpartyDirection('weird'), 'unknown');
  assert.equal(normalizeCounterpartyDirection(''), 'unknown');
});

test('resolveCounterpartyDisplayName prefers real name over email-derived label', () => {
  assert.equal(resolveCounterpartyDisplayName('Anna Example', 'anna@example.com'), 'Anna Example');
});

test('resolveCounterpartyDisplayName falls back to humanized email when name is only the address', () => {
  assert.equal(resolveCounterpartyDisplayName('anna@example.com', 'anna@example.com'), 'Anna');
});

test('humanizeCounterpartyEmail prefers domain label for generic sender local parts', () => {
  assert.equal(humanizeCounterpartyEmail('info@e.circlekextra.se'), 'Circlekextra Se');
  assert.equal(humanizeCounterpartyEmail('contact@dreamandbreathe.se'), 'Dreamandbreathe Se');
});

test('resolveCounterpartyIdentity keeps explicit sender names when they exist', () => {
  const counterparty = resolveCounterpartyIdentity(
    {
      direction: 'inbound',
      from: {
        address: 'service@vidaxl.se',
        name: 'Service Se',
      },
      mailboxId: 'egzona@hairtpclinic.com',
    },
    {
      direction: 'inbound',
      mailboxId: 'egzona@hairtpclinic.com',
    }
  );

  assert.equal(counterparty.email, 'service@vidaxl.se');
  assert.equal(counterparty.displayName, 'Service Se');
});

test('worklist read model uses shared counterparty truth for generic sender emails', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'egzona@hairtpclinic.com',
            mailboxAddress: 'egzona@hairtpclinic.com',
            userPrincipalName: 'egzona@hairtpclinic.com',
            mailboxConversationId: 'egzona@hairtpclinic.com:conv-circle-k',
            conversationId: 'conv-circle-k',
            graphMessageId: 'msg-circle-k',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Egzona, din månadsstatus är här',
            bodyPreview: 'Se dina aktuella besök, förmåner och rabatter.',
            from: {
              address: 'info@e.circlekextra.se',
              name: 'info@e.circlekextra.se',
            },
            receivedAt: '2026-04-02T08:00:00.000Z',
          },
        ];
      },
    },
  });

  const consumer = model.buildConsumerModel({
    mailboxIds: ['egzona@hairtpclinic.com'],
  });

  assert.equal(consumer.rows.length, 1);
  assert.equal(consumer.rows[0].customer.name, 'Circlekextra Se');
  assert.equal(consumer.rows[0].customer.email, 'info@e.circlekextra.se');
});

test('worklist read model bär vidare identity-envelope utan ny härledning', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'egzona@hairtpclinic.com',
            mailboxAddress: 'egzona@hairtpclinic.com',
            userPrincipalName: 'egzona@hairtpclinic.com',
            mailboxConversationId: 'egzona@hairtpclinic.com:conv-identity',
            conversationId: 'conv-identity',
            graphMessageId: 'msg-identity-1',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'QA Reply Kons Send [telefon]',
            bodyPreview: 'Tack, jag behöver hjälp med min bokning.',
            customerIdentity: {
              canonicalCustomerId: 'cust-identity-1',
              canonicalContactId: 'contact-identity-1',
              explicitMergeGroupId: 'merge-identity-1',
              verifiedPersonalEmailNormalized: 'patient@example.com',
              verifiedPhoneE164: '+46701234567',
              identitySource: 'backend',
              identityConfidence: 'strong',
              provenance: {
                source: 'backend',
                mailboxIds: ['egzona@hairtpclinic.com'],
                conversationIds: ['conv-identity'],
                sourceRecordIds: ['msg-identity-1'],
              },
            },
            hardConflictSignals: [
              {
                type: 'email',
                left: 'patient@example.com',
                right: 'patient@example.com',
                reason: 'match',
              },
            ],
            mergeReviewDecisionsByPairId: {
              'pair-identity-1': { decision: 'dismissed' },
            },
            identityProvenance: {
              source: 'backend',
              mailboxIds: ['egzona@hairtpclinic.com'],
              conversationIds: ['conv-identity'],
              sourceRecordIds: ['msg-identity-1'],
            },
            from: {
              address: 'patient@example.com',
              name: 'Patient Example',
            },
            receivedAt: '2026-04-02T08:00:00.000Z',
          },
        ];
      },
    },
  });

  const readModel = model.buildReadModel({
    mailboxIds: ['egzona@hairtpclinic.com'],
  });
  const consumer = model.buildConsumerModel({
    mailboxIds: ['egzona@hairtpclinic.com'],
  });

  assert.equal(readModel.rows.length, 1);
  assert.equal(readModel.rows[0].customerIdentity?.canonicalCustomerId, 'cust-identity-1');
  assert.equal(readModel.rows[0].hardConflictSignals?.length, 1);
  assert.equal(
    readModel.rows[0].mergeReviewDecisionsByPairId?.['pair-identity-1']?.decision,
    'dismissed'
  );
  assert.equal(readModel.rows[0].identityProvenance?.source, 'backend');
  assert.equal(consumer.rows[0].customerIdentity?.canonicalCustomerId, 'cust-identity-1');
  assert.equal(consumer.rows[0].customer.identity?.canonicalCustomerId, 'cust-identity-1');
  assert.equal(consumer.rows[0].hardConflictSignals?.length, 1);
  assert.equal(
    consumer.rows[0].mergeReviewDecisionsByPairId?.['pair-identity-1']?.decision,
    'dismissed'
  );
  assert.equal(consumer.rows[0].identityProvenance?.source, 'backend');
});

test('worklist read model backfyller säker identity från etablerad customer-state och lämnar weak/null tomt', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    customerState: {
      directory: {
        strong_customer: {
          name: 'Strong Customer',
          vip: false,
          emailCoverage: 1,
          duplicateCandidate: false,
          profileCount: 1,
          customerValue: 0,
          totalConversations: 1,
          totalMessages: 1,
        },
        weak_customer: {
          name: 'Weak Customer',
          vip: false,
          emailCoverage: 1,
          duplicateCandidate: false,
          profileCount: 1,
          customerValue: 0,
          totalConversations: 1,
          totalMessages: 1,
        },
      },
      details: {
        strong_customer: {
          emails: ['strong@example.com'],
          phone: '',
          mailboxes: ['kons'],
        },
        weak_customer: {
          emails: ['weak@example.com'],
          phone: '',
          mailboxes: ['contact'],
        },
      },
      primaryEmailByKey: {
        strong_customer: 'strong@example.com',
        weak_customer: 'weak@example.com',
      },
      identityByKey: {
        strong_customer: {
          customerKey: 'strong_customer',
          customerName: 'Strong Customer',
          canonicalCustomerId: 'cust-strong-1',
          identitySource: 'backend',
          identityConfidence: 'strong',
          provenance: {
            source: 'backend',
            mailboxIds: ['kons'],
            conversationIds: ['conv-strong'],
            sourceRecordIds: ['strong_customer'],
          },
        },
        weak_customer: {
          customerKey: 'weak_customer',
          customerName: 'Weak Customer',
          customerEmail: 'weak@example.com',
          identitySource: 'derived',
          identityConfidence: 'weak',
          provenance: {
            source: 'derived',
            mailboxIds: ['contact'],
            conversationIds: ['conv-weak'],
            sourceRecordIds: ['weak_customer'],
          },
        },
      },
    },
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'kons@hairtpclinic.com',
            mailboxAddress: 'kons@hairtpclinic.com',
            userPrincipalName: 'kons@hairtpclinic.com',
            mailboxConversationId: 'kons@hairtpclinic.com:conv-strong',
            conversationId: 'conv-strong',
            graphMessageId: 'msg-strong',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Strong customer',
            bodyPreview: 'Säker kundidentitet ska backfyllas.',
            from: {
              address: 'strong@example.com',
              name: 'Strong Customer',
            },
            receivedAt: '2026-04-02T08:00:00.000Z',
          },
          {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
            userPrincipalName: 'contact@hairtpclinic.com',
            mailboxConversationId: 'contact@hairtpclinic.com:conv-weak',
            conversationId: 'conv-weak',
            graphMessageId: 'msg-weak',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Weak customer',
            bodyPreview: 'Svag identitet ska lämnas tom.',
            from: {
              address: 'weak@example.com',
              name: 'Weak Customer',
            },
            receivedAt: '2026-04-02T09:00:00.000Z',
          },
          {
            mailboxId: 'fazli@hairtpclinic.com',
            mailboxAddress: 'fazli@hairtpclinic.com',
            userPrincipalName: 'fazli@hairtpclinic.com',
            mailboxConversationId: 'fazli@hairtpclinic.com:conv-null',
            conversationId: 'conv-null',
            graphMessageId: 'msg-null',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'No identity',
            bodyPreview: 'Saknar match i customer-state.',
            from: {
              address: 'no-match@example.com',
              name: 'No Match',
            },
            receivedAt: '2026-04-02T10:00:00.000Z',
          },
        ];
      },
    },
  });

  const readModel = model.buildReadModel({
    mailboxIds: ['kons@hairtpclinic.com', 'contact@hairtpclinic.com', 'fazli@hairtpclinic.com'],
  });
  const consumer = model.buildConsumerModel({
    mailboxIds: ['kons@hairtpclinic.com', 'contact@hairtpclinic.com', 'fazli@hairtpclinic.com'],
  });
  const rowsByConversationId = new Map(readModel.rows.map((row) => [row.conversationId, row]));
  const consumerRowsByConversationId = new Map(
    consumer.rows.map((row) => [row.conversation?.conversationId, row])
  );

  assert.equal(readModel.summary.rowCount, 3);
  assert.equal(readModel.summary.identityCount, 1);
  assert.equal(consumer.summary.identityCount, 1);
  assert.equal(
    rowsByConversationId.get('conv-strong')?.customerIdentity?.canonicalCustomerId,
    'cust-strong-1'
  );
  assert.equal(
    consumerRowsByConversationId.get('conv-strong')?.customerIdentity?.canonicalCustomerId,
    'cust-strong-1'
  );
  assert.equal(rowsByConversationId.get('conv-weak')?.customerIdentity, null);
  assert.equal(consumerRowsByConversationId.get('conv-weak')?.customerIdentity, null);
  assert.equal(rowsByConversationId.get('conv-null')?.customerIdentity, null);
  assert.equal(consumerRowsByConversationId.get('conv-null')?.customerIdentity, null);
});

test('C8: worklist consumer rolls the same confirmed customer up across mailbox boundaries into one operational row', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'egzona@hairtpclinic.com',
            mailboxAddress: 'egzona@hairtpclinic.com',
            userPrincipalName: 'egzona@hairtpclinic.com',
            mailboxConversationId: 'egzona@hairtpclinic.com:conv-safe-1',
            conversationId: 'conv-safe-1',
            graphMessageId: 'msg-safe-1',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'QA Reply Kons Send [telefon]',
            bodyPreview: 'Jag behöver hjälp med min bokning.',
            customerIdentity: {
              canonicalCustomerId: 'cust-safe-1',
              identitySource: 'backend',
              identityConfidence: 'strong',
              provenance: {
                source: 'backend',
                mailboxIds: ['egzona@hairtpclinic.com'],
                conversationIds: ['conv-safe-1'],
                sourceRecordIds: ['msg-safe-1'],
              },
            },
            from: {
              address: 'patient@example.com',
              name: 'Patient Example',
            },
            receivedAt: '2026-04-02T08:00:00.000Z',
          },
          {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
            userPrincipalName: 'contact@hairtpclinic.com',
            mailboxConversationId: 'contact@hairtpclinic.com:conv-safe-2',
            conversationId: 'conv-safe-2',
            graphMessageId: 'msg-safe-2',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'QA Reply Kons Send [telefon]',
            bodyPreview: 'Jag behöver följd på samma ärende.',
            customerIdentity: {
              canonicalCustomerId: 'cust-safe-1',
              identitySource: 'backend',
              identityConfidence: 'strong',
              provenance: {
                source: 'backend',
                mailboxIds: ['contact@hairtpclinic.com'],
                conversationIds: ['conv-safe-2'],
                sourceRecordIds: ['msg-safe-2'],
              },
            },
            from: {
              address: 'clinic@example.com',
              name: 'Clinic Ops',
            },
            receivedAt: '2026-04-02T09:00:00.000Z',
          },
          {
            mailboxId: 'fazli@hairtpclinic.com',
            mailboxAddress: 'fazli@hairtpclinic.com',
            userPrincipalName: 'fazli@hairtpclinic.com',
            mailboxConversationId: 'fazli@hairtpclinic.com:conv-separate',
            conversationId: 'conv-separate',
            graphMessageId: 'msg-separate',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Liknande ämne men separat spår',
            bodyPreview: 'Samma ämne räcker inte för merge.',
            from: {
              address: 'different@example.com',
              name: 'Different Person',
            },
            receivedAt: '2026-04-02T10:00:00.000Z',
          },
        ];
      },
    },
  });

  const readModel = model.buildReadModel({
    mailboxIds: ['egzona@hairtpclinic.com', 'contact@hairtpclinic.com', 'fazli@hairtpclinic.com'],
  });
  const consumer = model.buildConsumerModel({
    mailboxIds: ['egzona@hairtpclinic.com', 'contact@hairtpclinic.com', 'fazli@hairtpclinic.com'],
  });

  // Read-modellen är pre-rollup: 3 råa rader.
  assert.equal(readModel.summary.rowCount, 3);
  assert.equal(consumer.summary.rawRowCount, 3);
  // C8: cust-safe-1:s två mailbox-rader rollas upp till EN operativ kundrad;
  // den tredje (annan person, ingen bekräftad identitet) står kvar separat.
  assert.equal(consumer.summary.rowCount, 2);
  assert.equal(consumer.summary.rollupRowCount, 2);
  assert.equal(consumer.summary.rollupReductionCount, 1);

  const rolledCustomerRow = consumer.rows.find(
    (row) => row.customerIdentity?.canonicalCustomerId === 'cust-safe-1'
  );
  assert.ok(rolledCustomerRow, 'Förväntade en samlad kundrad för cust-safe-1.');
  assert.equal(rolledCustomerRow.rollup?.enabled, true, 'kundraden ska vara en rollup');
  assert.equal(rolledCustomerRow.rollup?.mailboxCount, 2, 'samlar två mailboxar');
  assert.deepEqual(
    [...rolledCustomerRow.rollup.underlyingMailboxIds].sort(),
    ['contact@hairtpclinic.com', 'egzona@hairtpclinic.com'],
    'mailbox-trail visar båda klinikadresserna'
  );
  assert.deepEqual(
    [...rolledCustomerRow.rollup.inboundMailboxIds].sort(),
    ['contact@hairtpclinic.com', 'egzona@hairtpclinic.com'],
    'kunden har mailat till båda adresserna'
  );

  const separateRow = consumer.rows.find(
    (row) => row.customerIdentity?.canonicalCustomerId !== 'cust-safe-1'
  );
  assert.ok(separateRow, 'Förväntade en separat rad för den andra personen.');
  assert.equal(separateRow.rollup?.enabled, false, 'olika person mergas inte in');
  assert.equal(separateRow.rollup?.count, 1);
});

test('history read adapter uses shared counterparty truth for generic sender emails', () => {
  const adapter = createCcoMailboxTruthReadAdapter({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'egzona@hairtpclinic.com',
            mailboxAddress: 'egzona@hairtpclinic.com',
            userPrincipalName: 'egzona@hairtpclinic.com',
            mailboxConversationId: 'egzona@hairtpclinic.com:conv-circle-k',
            conversationId: 'conv-circle-k',
            graphMessageId: 'msg-circle-k',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Egzona, din månadsstatus är här',
            bodyPreview: 'Se dina aktuella besök, förmåner och rabatter.',
            bodyHtml: '<p>Se dina aktuella besök, förmåner och rabatter.</p>',
            from: {
              address: 'info@e.circlekextra.se',
              name: 'info@e.circlekextra.se',
            },
            receivedAt: '2026-04-02T08:00:00.000Z',
          },
        ];
      },
      getCompletenessReport() {
        return {
          accountReports: [],
        };
      },
    },
  });

  const messages = adapter.listHistoryMessages({
    mailboxIds: ['egzona@hairtpclinic.com'],
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].counterpartyName, 'Circlekextra Se');
  assert.equal(messages[0].counterpartyEmail, 'info@e.circlekextra.se');
});

test('history read adapter carries safe attachment metadata from mailbox truth store into runtime history messages', () => {
  const adapter = createCcoMailboxTruthReadAdapter({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'fazli@hairtpclinic.com',
            mailboxAddress: 'fazli@hairtpclinic.com',
            userPrincipalName: 'fazli@hairtpclinic.com',
            mailboxConversationId: 'fazli@hairtpclinic.com:conv-attachment',
            conversationId: 'conv-attachment',
            graphMessageId: 'msg-attachment-1',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Leverans - Branschvinnare',
            bodyPreview: 'Här är ert fina sigill i olika format.',
            bodyHtml: '<p>Här är ert fina sigill i olika format.</p>',
            hasAttachments: true,
            attachments: [
              {
                id: 'att-1',
                name: 'sigill.pdf',
                contentType: 'application/pdf',
                isInline: false,
                size: 24000,
                sourceType: 'graph_file_attachment',
              },
              {
                id: 'att-inline-1',
                name: 'logo.png',
                contentType: 'image/png',
                contentId: 'logo@cid',
                isInline: true,
                size: 5120,
                sourceType: 'graph_file_attachment',
              },
            ],
            from: {
              address: 'camilla.sandin@branschvinnare.se',
              name: 'Camilla Sandin',
            },
            receivedAt: '2026-04-02T08:00:00.000Z',
          },
        ];
      },
      getCompletenessReport() {
        return {
          accountReports: [],
        };
      },
    },
  });

  const messages = adapter.listHistoryMessages({
    mailboxIds: ['fazli@hairtpclinic.com'],
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].hasAttachments, true);
  assert.equal(Array.isArray(messages[0].attachments), true);
  assert.equal(messages[0].attachments.length, 2);
  assert.equal(messages[0].attachments[0].name, 'sigill.pdf');
  assert.equal(messages[0].attachments[0].isInline, false);
  assert.equal(messages[0].attachments[1].contentId, 'logo@cid');
  assert.equal(messages[0].attachments[1].isInline, true);
});
