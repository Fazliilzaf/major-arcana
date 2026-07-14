const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mergeWorklistEnrichmentOutput,
  resolveLatestWorklistEnrichmentBaseline,
} = require('../../src/routes/capabilities');

test('mergeWorklistEnrichmentOutput matches scoped and raw conversation ids', () => {
  const baseOutput = {
    generatedAt: '2026-05-01T00:00:00.000Z',
    conversationWorklist: [
      { conversationId: 'kons@hairtpclinic.com:AAQkOld', intent: 'consultation' },
      { conversationId: 'AAQkKeep', intent: 'admin' },
    ],
    needsReplyToday: [],
  };
  const deltaOutput = {
    conversationWorklist: [
      { conversationId: 'AAQkOld', intent: 'operation', workflowLane: 'act-now' },
    ],
    needsReplyToday: [],
  };

  const merged = mergeWorklistEnrichmentOutput(baseOutput, deltaOutput, {
    scopeConversationIds: ['AAQkOld'],
  });

  assert.equal(merged.conversationWorklist.length, 2);
  const updated = merged.conversationWorklist.find((row) => row.conversationId === 'AAQkOld');
  const untouched = merged.conversationWorklist.find((row) => row.conversationId === 'AAQkKeep');
  assert.equal(updated?.intent, 'operation');
  assert.equal(updated?.workflowLane, 'act-now');
  assert.equal(untouched?.intent, 'admin');
});

test('mergeWorklistEnrichmentOutput preserves base enrichment when delta lacks signals', () => {
  const baseOutput = {
    generatedAt: '2026-05-01T00:00:00.000Z',
    conversationWorklist: [
      {
        conversationId: 'AAQkOld',
        intent: 'consultation',
        workflowLane: 'action_now',
        slaStatus: 'warning',
      },
    ],
    needsReplyToday: [],
  };
  const deltaOutput = {
    conversationWorklist: [
      { conversationId: 'AAQkOld', intent: 'unknown', subject: 'Updated subject' },
    ],
    needsReplyToday: [],
  };

  const merged = mergeWorklistEnrichmentOutput(baseOutput, deltaOutput, {
    scopeConversationIds: ['kons@hairtpclinic.com:AAQkOld'],
  });

  assert.equal(merged.conversationWorklist.length, 1);
  const updated = merged.conversationWorklist[0];
  assert.equal(updated?.subject, 'Updated subject');
  assert.equal(updated?.intent, 'consultation');
  assert.equal(updated?.workflowLane, 'action_now');
  assert.equal(updated?.slaStatus, 'warning');
});

test('mergeWorklistEnrichmentOutput applies Graph rows scoped by contact-form rollup key', () => {
  const baseOutput = {
    generatedAt: '2026-05-01T00:00:00.000Z',
    conversationWorklist: [{ conversationId: 'AAQkKeep', intent: 'admin' }],
    needsReplyToday: [],
  };
  const deltaOutput = {
    conversationWorklist: [
      { conversationId: 'AAQkContactForm', intent: 'booking_request', workflowLane: 'action_now' },
    ],
    needsReplyToday: [],
  };

  const merged = mergeWorklistEnrichmentOutput(baseOutput, deltaOutput, {
    scopeConversationIds: [
      'kons@hairtpclinic.com:AAQkContactForm::contact-form:patient%40example.com',
    ],
  });

  assert.equal(merged.conversationWorklist.length, 2);
  const enriched = merged.conversationWorklist.find(
    (row) => row.conversationId === 'AAQkContactForm'
  );
  assert.equal(enriched?.intent, 'booking_request');
  assert.equal(enriched?.workflowLane, 'action_now');
});

test('latest complete mailbox baseline replaces a larger stale baseline', async () => {
  const enrichedRow = (conversationId, intent) => ({
    conversationId,
    mailboxId: 'kons@hairtpclinic.com',
    intent,
    workflowLane: 'action_now',
  });
  const staleRows = Array.from({ length: 153 }, (_, index) =>
    enrichedRow(`stale-${index}`, 'booking_request')
  );
  const freshRows = Array.from({ length: 103 }, (_, index) =>
    enrichedRow(index === 0 ? 'dennis' : `fresh-${index}`, index === 0 ? 'cancellation' : 'follow_up')
  );
  const entries = [
    {
      id: 'fresh-entry',
      ts: '2026-07-14T10:30:00.000Z',
      input: { mailboxIds: ['kons@hairtpclinic.com'] },
      output: { data: { generatedAt: '2026-07-14T10:30:00.000Z', conversationWorklist: freshRows } },
    },
    {
      id: 'stale-entry',
      ts: '2026-07-13T08:38:00.000Z',
      input: { mailboxIds: ['kons@hairtpclinic.com'] },
      output: { data: { generatedAt: '2026-07-13T08:38:00.000Z', conversationWorklist: staleRows } },
    },
  ];
  const capabilityAnalysisStore = {
    async list({ capabilityName }) {
      return capabilityName === 'AnalyzeInbox' ? entries : [];
    },
  };

  const baseline = await resolveLatestWorklistEnrichmentBaseline({
    capabilityAnalysisStore,
    tenantId: 'hair-tp-clinic',
    mailboxIds: ['kons@hairtpclinic.com'],
  });

  assert.equal(baseline.selection.selectedEntryId, 'fresh-entry');
  assert.equal(baseline.selection.strategy, 'latest_widest_scope_match');
  assert.equal(baseline.selectedConversationWorklist.length, 103);
  assert.equal(baseline.selectedConversationWorklist[0]?.intent, 'cancellation');
});

test('partial scoped checkpoint never replaces a complete global baseline', async () => {
  const entry = ({ id, generatedAt, mailboxIds, count }) => ({
    id,
    ts: generatedAt,
    input: { mailboxIds },
    output: {
      data: {
        generatedAt,
        conversationWorklist: Array.from({ length: count }, (_, index) => ({
          conversationId: `${id}-${index}`,
          mailboxId: mailboxIds[0],
          intent: 'follow_up',
        })),
      },
    },
  });
  const completeMailboxIds = [
    'kons@hairtpclinic.com',
    'contact@hairtpclinic.com',
    'halso@hairtpclinic.com',
    'egzona@hairtpclinic.com',
    'fazli@hairtpclinic.com',
    'marknad@hairtpclinic.com',
    'kvitto@hairtpclinic.com',
  ];
  const entries = [
    entry({ id: 'partial-checkpoint', generatedAt: '2026-07-14T11:00:00.000Z', mailboxIds: ['kons@hairtpclinic.com'], count: 25 }),
    entry({ id: 'complete-refresh', generatedAt: '2026-07-14T10:00:00.000Z', mailboxIds: completeMailboxIds, count: 21 }),
  ];
  const capabilityAnalysisStore = {
    async list({ capabilityName }) {
      return capabilityName === 'AnalyzeInbox' ? entries : [];
    },
  };

  const baseline = await resolveLatestWorklistEnrichmentBaseline({
    capabilityAnalysisStore,
    tenantId: 'hair-tp-clinic',
    mailboxIds: ['kons@hairtpclinic.com'],
  });

  assert.equal(baseline.selection.selectedEntryId, 'complete-refresh');
  assert.deepEqual(baseline.selection.selectedMailboxIds, completeMailboxIds);
});
