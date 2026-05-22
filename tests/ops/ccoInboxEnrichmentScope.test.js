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
