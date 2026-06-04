const test = require('node:test');
const assert = require('node:assert/strict');

const { mergeWorklistEnrichmentOutput } = require('../../src/routes/capabilities');

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
