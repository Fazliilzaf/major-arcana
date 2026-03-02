const test = require('node:test');
const assert = require('node:assert/strict');

const { suggestFollowUpTiming } = require('../../src/intelligence/timingEngine');

test('Timing engine schedules complaint same day with high urgency', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-01T09:00:00.000Z',
    intent: 'complaint',
    tone: 'frustrated',
    tempoProfile: 'hesitant',
    warmthScore: 0.7,
    recommendedFollowUpDelayDays: 2,
    timezone: 'Europe/Stockholm',
  });

  assert.equal(result.urgencyLevel, 'high');
  assert.equal(result.reasoning.includes('complaint_same_day'), true);
  assert.equal(typeof result.suggestedDateTime, 'string');
});

test('Timing engine blocks Sunday for booking and moves to weekday window', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-01T08:00:00.000Z',
    intent: 'booking_request',
    tone: 'neutral',
    tempoProfile: 'responsive',
    warmthScore: 0.8,
    recommendedFollowUpDelayDays: 1,
    timezone: 'Europe/Stockholm',
  });

  const scheduled = new Date(result.suggestedDateTime);
  const weekday = scheduled.getUTCDay();
  assert.equal(weekday >= 1 && weekday <= 5, true);
  assert.equal(result.reasoning.includes('booking_next_weekday'), true);
  assert.equal(result.reasoning.includes('weekday_window'), true);
});

test('Timing engine applies anxiety same-day evening window', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-03T10:00:00.000Z',
    intent: 'anxiety_pre_op',
    tone: 'anxious',
    tempoProfile: 'hesitant',
    warmthScore: 0.7,
    timezone: 'Europe/Stockholm',
  });

  const scheduled = new Date(result.suggestedDateTime);
  assert.equal(scheduled.getUTCHours(), 17);
  assert.equal(result.reasoning.includes('anxiety_evening_window'), true);
});
