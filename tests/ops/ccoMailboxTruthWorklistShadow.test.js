const test = require('node:test');
const assert = require('node:assert/strict');

const { createCcoMailboxTruthWorklistShadow } = require('../../src/ops/ccoMailboxTruthWorklistShadow');

test('createCcoMailboxTruthWorklistShadow returns null without listMessages', () => {
  assert.equal(createCcoMailboxTruthWorklistShadow(), null);
  assert.equal(createCcoMailboxTruthWorklistShadow({ store: {} }), null);
});

test('buildLegacyRows dedupes by conversationKey and filters mailboxIds', () => {
  const shadow = createCcoMailboxTruthWorklistShadow({
    store: { listMessages: () => [] },
  });
  const rows = shadow.buildLegacyRows({
    legacyConversationWorklist: [
      {
        conversationId: 'dup',
        mailboxId: 'keep@clinic.se',
        subject: 'A',
        priorityLevel: 'high',
      },
      {
        conversationId: 'dup',
        mailboxId: 'keep@clinic.se',
        subject: 'B',
      },
      {
        conversationId: 'other',
        mailboxId: 'skip@clinic.se',
        subject: 'C',
      },
    ],
    mailboxIds: ['keep@clinic.se'],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].conversationId, 'dup');
  assert.equal(rows[0].mailboxId, 'keep@clinic.se');
  assert.ok(['sprint', 'act-now', 'all', 'review'].includes(rows[0].lane));
});

test('buildShadowRows delegates to mailbox truth messages', () => {
  const store = {
    listMessages: () => [
      {
        mailboxId: 'clinic@test.se',
        conversationId: 'conv-aa',
        mailboxConversationId: 'clinic@test.se:conv-aa',
        graphMessageId: 'gm-1',
        folderType: 'inbox',
        direction: 'inbound',
        isRead: false,
        subject: 'Oläst kund',
        receivedAt: '2026-06-15T09:00:00.000Z',
      },
    ],
  };
  const shadow = createCcoMailboxTruthWorklistShadow({ store });
  const rows = shadow.buildShadowRows({ mailboxIds: ['clinic@test.se'] });
  assert.ok(rows.length >= 1);
  const row = rows.find((r) => r.conversationId === 'conv-aa' || r.mailboxConversationId?.includes('conv-aa'));
  assert.ok(row);
  assert.equal(row.mailboxId, 'clinic@test.se');
});

test('buildDiffReport marks legacy_only when shadow has no matching thread', () => {
  const shadow = createCcoMailboxTruthWorklistShadow({
    store: { listMessages: () => [] },
  });
  const report = shadow.buildDiffReport({
    legacyConversationWorklist: [
      {
        conversationId: 'legacy-only-1',
        mailboxId: 'box@demo.se',
        subject: 'Legacy tråd',
        priorityLevel: 'low',
      },
    ],
    mailboxIds: ['box@demo.se'],
  });
  assert.equal(report.aggregate.legacyCount, 1);
  assert.equal(report.aggregate.shadowCount, 0);
  assert.equal(report.aggregate.legacyOnlyCount, 1);
  assert.equal(report.aggregate.shadowOnlyCount, 0);
  const diff = report.conversationDiffs.find((d) => d.presence === 'legacy_only');
  assert.ok(diff);
  assert.equal(diff.classification, 'mapping_gap');
});

test('buildDiffReport marks shadow_only when truth has thread not in legacy', () => {
  const store = {
    listMessages: () => [
      {
        mailboxId: 'box@demo.se',
        conversationId: 'truth-only',
        mailboxConversationId: 'box@demo.se:truth-only',
        graphMessageId: 'g-truth',
        folderType: 'inbox',
        direction: 'inbound',
        isRead: true,
        subject: 'Bara i truth',
        receivedAt: '2026-06-20T10:00:00.000Z',
      },
    ],
  };
  const shadow = createCcoMailboxTruthWorklistShadow({ store });
  const report = shadow.buildDiffReport({
    legacyConversationWorklist: [],
    mailboxIds: ['box@demo.se'],
  });
  assert.ok(report.aggregate.shadowCount >= 1);
  assert.equal(report.aggregate.legacyCount, 0);
  assert.ok(report.aggregate.shadowOnlyCount >= 1);
});
