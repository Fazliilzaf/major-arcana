const test = require('node:test');
const assert = require('node:assert/strict');

const { estimateConversationWorkload } = require('../../src/intelligence/workloadEngine');

test('Workload engine estimates complaint/frustrated/critical/new with long message', () => {
  const result = estimateConversationWorkload({
    intent: 'complaint',
    tone: 'frustrated',
    priorityLevel: 'Critical',
    warmth: 'new',
    messageLength: 1000,
  });

  assert.equal(result.estimatedMinutes, 17);
  assert.deepEqual(result.breakdown, {
    base: 8,
    toneAdjustment: 3,
    priorityAdjustment: 3,
    warmthAdjustment: 1,
    lengthAdjustment: 2,
  });
});

test('Workload engine uses compact estimate for follow-up with positive loyal context', () => {
  const result = estimateConversationWorkload({
    intent: 'follow_up',
    tone: 'positive',
    priorityLevel: 'Low',
    warmth: 'loyal',
    messageLength: 220,
  });

  assert.equal(result.estimatedMinutes, 2);
  assert.deepEqual(result.breakdown, {
    base: 3,
    toneAdjustment: -1,
    priorityAdjustment: 0,
    warmthAdjustment: -1,
    lengthAdjustment: 0,
  });
});

test('Workload engine raises estimate for pricing/medium/dormant with very long message', () => {
  const result = estimateConversationWorkload({
    intent: 'pricing_question',
    tone: 'neutral',
    priorityLevel: 'Medium',
    warmth: 'dormant',
    messageLength: 1300,
  });

  assert.equal(result.estimatedMinutes, 9);
  assert.deepEqual(result.breakdown, {
    base: 4,
    toneAdjustment: 0,
    priorityAdjustment: 1,
    warmthAdjustment: 1,
    lengthAdjustment: 3,
  });
});

test('Workload engine handles booking/anxious/high with returning context', () => {
  const result = estimateConversationWorkload({
    intent: 'booking_request',
    tone: 'anxious',
    priorityLevel: 'High',
    warmth: 'returning',
    messageLength: 500,
  });

  assert.equal(result.estimatedMinutes, 9);
  assert.deepEqual(result.breakdown, {
    base: 5,
    toneAdjustment: 2,
    priorityAdjustment: 2,
    warmthAdjustment: 0,
    lengthAdjustment: 0,
  });
});

test('Workload engine falls back safely for unknown values', () => {
  const result = estimateConversationWorkload({
    intent: 'unknown_intent',
    tone: 'unknown_tone',
    priorityLevel: 'unknown_priority',
    warmth: 'unknown_warmth',
    messageLength: -100,
  });

  assert.equal(result.estimatedMinutes, 4);
  assert.deepEqual(result.breakdown, {
    base: 4,
    toneAdjustment: 0,
    priorityAdjustment: 0,
    warmthAdjustment: 0,
    lengthAdjustment: 0,
  });
});
