const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toCanonicalMailboxConversationKey,
  isOutOfScopeDraftReview,
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
