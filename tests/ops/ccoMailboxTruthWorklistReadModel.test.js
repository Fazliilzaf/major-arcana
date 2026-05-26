const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toCanonicalMailboxConversationKey,
  isOutOfScopeDraftReview,
  createCcoMailboxTruthWorklistReadModel,
} = require('../../src/ops/ccoMailboxTruthWorklistReadModel');

test('toCanonicalMailboxConversationKey prefers mailboxConversationId with mailbox prefix normalization', () => {
  assert.equal(
    toCanonicalMailboxConversationKey({
      mailboxId: 'Clinic@Demo.SE',
      mailboxConversationId: 'Clinic@Demo.SE:thread-42',
      conversationId: 'other',
    }),
    'clinic@demo.se:thread-42',
  );
});

test('toCanonicalMailboxConversationKey uses conversationId when mailboxConversationId absent', () => {
  assert.equal(
    toCanonicalMailboxConversationKey({
      mailboxId: 'a@b.co',
      conversationId: 'orphan-id',
    }),
    'a@b.co:orphan-id',
  );
});

test('toCanonicalMailboxConversationKey falls back to mailboxId + graph messageId', () => {
  assert.equal(
    toCanonicalMailboxConversationKey({
      mailboxId: 'Box@Clinic.SE',
      messageId: 'graph-msg-7',
    }),
    'box@clinic.se:graph:graph-msg-7',
  );
});

test('toCanonicalMailboxConversationKey returns empty when insufficient fields', () => {
  assert.equal(toCanonicalMailboxConversationKey({}), '');
  assert.equal(toCanonicalMailboxConversationKey({ conversationId: 'only-global' }), 'only-global');
});

test('isOutOfScopeDraftReview true only for drafts-only queue posture', () => {
  assert.equal(
    isOutOfScopeDraftReview({
      hasDrafts: true,
      hasUnreadInbound: false,
      needsReply: false,
    }),
    true,
  );
  assert.equal(
    isOutOfScopeDraftReview({
      hasDrafts: true,
      hasUnreadInbound: true,
      needsReply: false,
    }),
    false,
  );
  assert.equal(
    isOutOfScopeDraftReview({
      hasDrafts: true,
      hasUnreadInbound: false,
      needsReply: true,
    }),
    false,
  );
  assert.equal(isOutOfScopeDraftReview({ hasDrafts: false }), false);
});

test('worklist read model suppresses needsReply for classified system mail', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
            userPrincipalName: 'contact@hairtpclinic.com',
            mailboxConversationId: 'contact@hairtpclinic.com:conv-billing',
            conversationId: 'conv-billing',
            graphMessageId: 'msg-billing-1',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: true,
            subject: 'Påminnelse: Faktura förfaller snart',
            bodyPreview: 'Din faktura förfaller 2026-05-25. Betala via Klarna.',
            from: {
              address: 'noreply@billing.example.com',
              name: 'Billing',
            },
            receivedAt: '2026-06-15T09:00:00.000Z',
          },
        ];
      },
    },
  });

  const readModel = model.buildReadModel({
    mailboxIds: ['contact@hairtpclinic.com'],
  });
  const consumer = model.buildConsumerModel({
    mailboxIds: ['contact@hairtpclinic.com'],
  });

  assert.equal(readModel.rows.length, 0);
  assert.equal(consumer.rows.length, 0);
});

test('worklist read model keeps human replies actionable even after automated reminders', () => {
  const model = createCcoMailboxTruthWorklistReadModel({
    store: {
      listMessages() {
        return [
          {
            mailboxId: 'contact@hairtpclinic.com',
            mailboxAddress: 'contact@hairtpclinic.com',
            userPrincipalName: 'contact@hairtpclinic.com',
            mailboxConversationId: 'contact@hairtpclinic.com:conv-human',
            conversationId: 'conv-human',
            graphMessageId: 'msg-human-1',
            folderType: 'inbox',
            direction: 'inbound',
            isRead: false,
            subject: 'Påminnelse om bokning',
            bodyPreview: 'Hej, jag kan inte komma på fredag. Kan vi omboka konsultationen?',
            from: {
              address: 'patient@example.com',
              name: 'Patient',
            },
            receivedAt: '2026-06-15T09:00:00.000Z',
          },
        ];
      },
    },
  });

  const consumer = model.buildConsumerModel({
    mailboxIds: ['contact@hairtpclinic.com'],
  });

  assert.equal(consumer.rows.length, 1);
  assert.equal(consumer.rows[0].state.needsReply, true);
  assert.equal(consumer.rows[0].state.messageClassification, 'actionable');
});
