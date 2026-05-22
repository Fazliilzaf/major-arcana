const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BASE_MINUTES_BY_INTENT,
  estimateConversationWorkload,
} = require('../../src/intelligence/workloadEngine');

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

test('Workload engine treats null input like empty defaults', () => {
  const result = estimateConversationWorkload(null);
  assert.deepEqual(result.breakdown, {
    base: 4,
    toneAdjustment: 0,
    priorityAdjustment: 0,
    warmthAdjustment: 0,
    lengthAdjustment: 0,
  });
});

test('Workload engine treats array input like empty defaults', () => {
  const fromArray = estimateConversationWorkload([]);
  const fromObject = estimateConversationWorkload({});
  assert.deepEqual(fromArray, fromObject);
});

test('Workload engine uses default base weight for anxiety_pre_op intent', () => {
  const result = estimateConversationWorkload({
    intent: 'anxiety_pre_op',
    tone: 'anxious',
    priorityLevel: 'High',
    warmth: 'new',
    messageLength: 0,
  });

  assert.equal(result.breakdown.base, 4);
  assert.equal(result.estimatedMinutes, 9);
});

test('Workload engine maps active_dialogue warmth to returning band', () => {
  const result = estimateConversationWorkload({
    intent: 'pricing_question',
    tone: 'stressed',
    priorityLevel: 'medium',
    warmth: 'active_dialogue',
    messageLength: 400,
  });

  assert.equal(result.breakdown.warmthAdjustment, 0);
});

test('Workload engine length adjustment steps at 800 and 1200 characters', () => {
  const below = estimateConversationWorkload({ intent: 'follow_up', messageLength: 799 });
  const mid = estimateConversationWorkload({ intent: 'follow_up', messageLength: 800 });
  const high = estimateConversationWorkload({ intent: 'follow_up', messageLength: 1199 });
  const top = estimateConversationWorkload({ intent: 'follow_up', messageLength: 1200 });

  assert.equal(below.breakdown.lengthAdjustment, 0);
  assert.equal(mid.breakdown.lengthAdjustment, 2);
  assert.equal(high.breakdown.lengthAdjustment, 2);
  assert.equal(top.breakdown.lengthAdjustment, 3);
});

test('Workload engine keeps extreme stacked inputs within global bounds', () => {
  const result = estimateConversationWorkload({
    intent: 'complaint',
    tone: 'frustrated',
    priorityLevel: 'critical',
    warmth: 'dormant',
    messageLength: 99999,
  });
  assert.equal(result.estimatedMinutes, 18);
  assert.equal(result.estimatedMinutes <= 25, true);
});

test('Workload engine rounds/clamps numeric inputs defensively', () => {
  const result = estimateConversationWorkload({
    intent: 'booking_request',
    tone: 'urgent',
    priorityLevel: 'high',
    warmth: 'pre_treatment',
    messageLength: '800.9',
  });
  assert.equal(result.breakdown.lengthAdjustment, 2);
  assert.equal(result.breakdown.warmthAdjustment, 1);
  assert.equal(result.estimatedMinutes, 12);
});

test('Workload engine maps post_treatment warmth to loyal adjustment', () => {
  const result = estimateConversationWorkload({
    intent: 'cancellation',
    tone: 'neutral',
    priorityLevel: 'low',
    warmth: 'post_treatment',
    messageLength: 100,
  });
  assert.equal(result.breakdown.warmthAdjustment, -1);
  assert.equal(result.estimatedMinutes, 2);
});

test('Workload engine maps unclear intent till default base och stressed tone', () => {
  const result = estimateConversationWorkload({
    intent: 'legacy_xyz',
    tone: 'STRESSED',
    priorityLevel: 'Low',
    warmth: 'default',
    messageLength: 0,
  });
  assert.equal(result.breakdown.base, 4);
  assert.equal(result.breakdown.toneAdjustment, 1);
  assert.equal(result.estimatedMinutes, 5);
});

test('Workload engine maps new_lead warmth till new band', () => {
  const result = estimateConversationWorkload({
    intent: 'cancellation',
    tone: 'neutral',
    priorityLevel: 'Low',
    warmth: 'NEW_LEAD',
    messageLength: 0,
  });
  assert.equal(result.breakdown.warmthAdjustment, 1);
  assert.equal(result.estimatedMinutes, 4);
});

test('Workload engine maps urgent tone med medium prioritet', () => {
  const result = estimateConversationWorkload({
    intent: 'unclear',
    tone: 'urgent',
    priorityLevel: 'medium',
    warmth: 'returning',
    messageLength: 0,
  });
  assert.equal(result.breakdown.toneAdjustment, 2);
  assert.equal(result.breakdown.priorityAdjustment, 1);
  assert.equal(result.estimatedMinutes, 7);
});

test('BASE_MINUTES_BY_INTENT ar fruset', () => {
  assert.equal(Object.isFrozen(BASE_MINUTES_BY_INTENT), true);
});

test('estimateConversationWorkload undefined matches empty object', () => {
  assert.deepEqual(estimateConversationWorkload(undefined), estimateConversationWorkload({}));
});

test('estimateConversationWorkload string input matches null defaults', () => {
  assert.deepEqual(estimateConversationWorkload('x'), estimateConversationWorkload(null));
});

test('estimateConversationWorkload trims critical priority level', () => {
  const r = estimateConversationWorkload({
    intent: 'booking_request',
    tone: 'neutral',
    priorityLevel: '  CRITICAL  ',
    warmth: 'default',
    messageLength: 0,
  });
  assert.equal(r.breakdown.priorityAdjustment, 3);
  assert.equal(r.estimatedMinutes, 8);
});

test('estimateConversationWorkload normalizes spaced uppercase intent', () => {
  const r = estimateConversationWorkload({
    intent: '  BOOKING_REQUEST  ',
    tone: 'neutral',
    priorityLevel: 'low',
    warmth: 'default',
    messageLength: 0,
  });
  assert.equal(r.breakdown.base, 5);
});

test('estimateConversationWorkload treats NaN messageLength as zero length adjustment', () => {
  const r = estimateConversationWorkload({
    intent: 'follow_up',
    messageLength: Number.NaN,
  });
  assert.equal(r.breakdown.lengthAdjustment, 0);
});
