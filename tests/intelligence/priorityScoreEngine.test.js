const test = require('node:test');
const assert = require('node:assert/strict');

const { computePriorityScore, mapPriorityLevel } = require('../../src/intelligence/priorityScoreEngine');

test('PriorityScore engine maps high weighted signal mix to Critical', () => {
  const result = computePriorityScore({
    hoursSinceInbound: 80,
    intent: 'complaint',
    tone: 'frustrated',
    customerContext: {
      openCommitments: true,
      repeatCustomer: true,
      estimatedRevenueBand: 'high',
    },
  });

  assert.equal(result.priorityScore, 100);
  assert.equal(result.priorityLevel, 'Critical');
  assert.equal(result.priorityReasons.includes('SLA_AGE:+40'), true);
  assert.equal(result.priorityReasons.includes('INTENT_COMPLAINT:+25'), true);
  assert.equal(result.priorityReasons.includes('TONE_FRUSTRATED:+20'), true);
  assert.equal(result.priorityReasons.includes('CUSTOMER_OPEN_COMMITMENTS:+15'), true);
});

test('PriorityScore engine yields Medium for mixed medium factors', () => {
  const result = computePriorityScore({
    hoursSinceInbound: 30,
    intent: 'follow_up',
    tone: 'anxious',
    customerContext: {
      repeatCustomer: true,
    },
  });

  assert.equal(result.priorityScore, 48);
  assert.equal(result.priorityLevel, 'Medium');
  assert.equal(result.priorityReasons.includes('INTENT_FOLLOW_UP:+8'), true);
  assert.equal(result.priorityReasons.includes('TONE_ANXIOUS:+15'), true);
  assert.equal(result.priorityReasons.includes('CUSTOMER_REPEAT:+5'), true);
});

test('PriorityScore engine yields Low for fresh low-risk pricing question', () => {
  const result = computePriorityScore({
    hoursSinceInbound: 8,
    intent: 'pricing_question',
    tone: 'neutral',
  });

  assert.equal(result.priorityScore, 15);
  assert.equal(result.priorityLevel, 'Low');
  assert.deepEqual(result.priorityReasons, ['SLA_AGE:+5', 'INTENT_PRICING_QUESTION:+10']);
});

test('PriorityScore engine handles missing or unknown factors with fail-safe behavior', () => {
  const result = computePriorityScore({
    hoursSinceInbound: 'not-a-number',
    intent: 'unknown_intent',
    tone: 'unknown_tone',
    customerContext: null,
  });

  assert.equal(result.priorityScore, 10);
  assert.equal(result.priorityLevel, 'Low');
  assert.equal(result.priorityReasons.includes('SLA_AGE:+5'), true);
  assert.equal(result.priorityReasons.includes('INTENT_UNCLEAR:+5'), true);
  assert.equal(mapPriorityLevel(result.priorityScore), 'Low');
});

test('PriorityScore engine adds explainable history weights for repeat multi-mailbox contact', () => {
  const result = computePriorityScore({
    hoursSinceInbound: 26,
    intent: 'booking_request',
    tone: 'neutral',
    historySignals: {
      pattern: 'reschedule',
      mailboxCount: 2,
      recentMessageCount: 5,
    },
  });

  assert.equal(result.priorityScore, 54);
  assert.equal(result.priorityReasons.includes('HISTORY_PATTERN_RESCHEDULE:+8'), true);
  assert.equal(result.priorityReasons.includes('HISTORY_MULTI_MAILBOX:+6'), true);
  assert.equal(result.priorityReasons.includes('HISTORY_RECENT_ACTIVITY:+5'), true);
});

test('PriorityScore engine adds explainable outcome weights for no-response history', () => {
  const result = computePriorityScore({
    hoursSinceInbound: 26,
    intent: 'follow_up',
    tone: 'neutral',
    historySignals: {
      outcomeCode: 'no_response',
    },
  });

  assert.equal(result.priorityReasons.includes('HISTORY_OUTCOME_NO_RESPONSE:+6'), true);
});

test('PriorityScore engine adds calibration weights for repeated negative outcomes', () => {
  const result = computePriorityScore({
    hoursSinceInbound: 26,
    intent: 'follow_up',
    tone: 'neutral',
    historySignals: {
      negativeOutcomeCount: 3,
      dominantFailureOutcome: 'no_response',
      dominantFailureRisk: 'relationship',
    },
  });

  assert.equal(result.priorityReasons.includes('HISTORY_CALIBRATION_REPEAT_NEGATIVE:+4'), true);
  assert.equal(result.priorityReasons.includes('HISTORY_CALIBRATION_NO_RESPONSE:+4'), true);
  assert.equal(result.priorityReasons.includes('HISTORY_CALIBRATION_RELATIONSHIP:+4'), true);
});

test('mapPriorityLevel hanterar gransvarden exakt', () => {
  assert.equal(mapPriorityLevel(24), 'Low');
  assert.equal(mapPriorityLevel(25), 'Medium');
  assert.equal(mapPriorityLevel(49), 'Medium');
  assert.equal(mapPriorityLevel(50), 'High');
  assert.equal(mapPriorityLevel(74), 'High');
  assert.equal(mapPriorityLevel(75), 'Critical');
});

test('PriorityScore engine stodjer alias i customerContext och historySignals', () => {
  const result = computePriorityScore({
    hoursSinceInbound: 26,
    intent: 'follow_up',
    tone: 'neutral',
    customerContext: {
      hasOpenCommitments: 1,
      isRepeatCustomer: 'true',
      revenueBand: 'VIP',
    },
    historySignals: {
      pattern: 'booking',
      mailboxCount: 2,
      recentMessageCount: 4,
      outcomeCode: 'escalated',
      dominantFailureOutcome: 'escalated',
      dominantFailureRisk: 'follow_up',
    },
  });

  assert.equal(result.priorityReasons.includes('CUSTOMER_OPEN_COMMITMENTS:+15'), true);
  assert.equal(result.priorityReasons.includes('CUSTOMER_REPEAT:+5'), true);
  assert.equal(result.priorityReasons.includes('CUSTOMER_REVENUE_HIGH:+10'), true);
  assert.equal(result.priorityReasons.includes('HISTORY_PATTERN_BOOKING:+5'), true);
  assert.equal(result.priorityReasons.includes('HISTORY_OUTCOME_ESCALATED:+5'), true);
  assert.equal(result.priorityReasons.includes('HISTORY_CALIBRATION_ESCALATED:+5'), true);
  assert.equal(result.priorityReasons.includes('HISTORY_CALIBRATION_FOLLOW_UP:+3'), true);
});

test('PriorityScore engine begransar priorityReasons till max 12', () => {
  const result = computePriorityScore({
    hoursSinceInbound: 80,
    intent: 'complaint',
    tone: 'frustrated',
    customerContext: {
      openCommitments: true,
      repeatCustomer: true,
      estimatedRevenueBand: 'high',
    },
    historySignals: {
      pattern: 'complaint',
      mailboxCount: 4,
      recentMessageCount: 7,
      outcomeCode: 'no_response',
      negativeOutcomeCount: 4,
      dominantFailureOutcome: 'escalated',
      dominantFailureRisk: 'relationship',
    },
  });

  assert.equal(result.priorityReasons.length, 12);
  assert.equal(result.priorityReasons.includes('SLA_AGE:+40'), true);
});

test('mapPriorityLevel ogiltiga tal faller tillbaka till Low', () => {
  assert.equal(mapPriorityLevel(NaN), 'Low');
  assert.equal(mapPriorityLevel(null), 'Low');
  assert.equal(mapPriorityLevel(undefined), 'Low');
});

test('mapPriorityLevel score 100 ar Critical', () => {
  assert.equal(mapPriorityLevel(100), 'Critical');
});

test('computePriorityScore utan argument ger minimal Low-poang', () => {
  const r = computePriorityScore();
  assert.equal(r.priorityScore, 10);
  assert.equal(r.priorityLevel, 'Low');
  assert.deepEqual(r.priorityReasons, ['SLA_AGE:+5', 'INTENT_UNCLEAR:+5']);
});

test('computePriorityScore ignorerar customerContext och historySignals nar de ar array', () => {
  const base = computePriorityScore({ hoursSinceInbound: 8 });
  const withArrays = computePriorityScore({
    hoursSinceInbound: 8,
    customerContext: [],
    historySignals: [],
  });
  assert.deepEqual(withArrays, base);
});

test('PriorityScore engine SLA age weight steps at 72 hour boundary', () => {
  const at71 = computePriorityScore({ hoursSinceInbound: 71, intent: 'unclear', tone: 'neutral' });
  const at72 = computePriorityScore({ hoursSinceInbound: 72, intent: 'unclear', tone: 'neutral' });
  assert.ok(at71.priorityReasons.some((r) => r === 'SLA_AGE:+30'));
  assert.ok(at72.priorityReasons.some((r) => r === 'SLA_AGE:+40'));
});

test('PriorityScore engine treats hog revenue band as high value', () => {
  const r = computePriorityScore({
    hoursSinceInbound: 10,
    intent: 'follow_up',
    tone: 'neutral',
    customerContext: { estimatedRevenueBand: 'hog' },
  });
  assert.ok(r.priorityReasons.includes('CUSTOMER_REVENUE_HIGH:+10'));
});

test('PriorityScore engine adds urgent tone weight', () => {
  const r = computePriorityScore({
    hoursSinceInbound: 10,
    intent: 'follow_up',
    tone: 'urgent',
  });
  assert.ok(r.priorityReasons.includes('TONE_URGENT:+15'));
});

test('PriorityScore engine adds mixed history pattern weight', () => {
  const r = computePriorityScore({
    hoursSinceInbound: 10,
    intent: 'unclear',
    tone: 'neutral',
    historySignals: { pattern: 'mixed' },
  });
  assert.ok(r.priorityReasons.includes('HISTORY_PATTERN_MIXED:+6'));
});
