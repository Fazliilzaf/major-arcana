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

test('Timing engine delays pricing questions with pricing reason', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-02T10:00:00.000Z',
    intent: 'pricing_question',
    tone: 'neutral',
    tempoProfile: 'reflective',
    warmthScore: 0.5,
    timezone: 'Europe/Stockholm',
  });

  assert.equal(result.reasoning.includes('pricing_2_3_days'), true);
  assert.equal(result.intentAdjusted, true);
});

test('Timing engine schedules cancellation follow-up next day', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-02T10:00:00.000Z',
    intent: 'cancellation',
    tone: 'neutral',
    tempoProfile: 'reflective',
    warmthScore: 0.5,
    timezone: 'Europe/Stockholm',
  });

  assert.equal(result.reasoning.includes('cancellation_next_day'), true);
  assert.equal(result.intentAdjusted, true);
});

test('Timing engine lowers urgency for low_engagement tempo on neutral intent', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-02T10:00:00.000Z',
    intent: 'follow_up',
    tone: 'neutral',
    tempoProfile: 'low_engagement',
    warmthScore: 0.5,
    tenantBusinessHours: { startHour: 8, endHour: 18 },
    timezone: 'Europe/Stockholm',
  });

  assert.equal(result.urgencyLevel, 'low');
  assert.equal(result.reasoning.includes('tempo_low_engagement'), true);
});

test('Timing engine handles undefined input with defaults', () => {
  const result = suggestFollowUpTiming(undefined);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.suggestedDateTime));
  assert.equal(result.timezone, 'Europe/Stockholm');
  assert.equal(result.manualApprovalRequired, true);
});

test('Timing engine handles null input med samma defaults som undefined', () => {
  const a = suggestFollowUpTiming(null);
  const b = suggestFollowUpTiming(undefined);
  assert.equal(a.timezone, b.timezone);
  assert.equal(a.manualApprovalRequired, b.manualApprovalRequired);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(a.suggestedDateTime));
});

test('Timing engine sätter normal urgency för booking med låg warmth', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-02T10:00:00.000Z',
    intent: 'booking_request',
    tone: 'neutral',
    tempoProfile: 'reflective',
    warmthScore: 0.5,
    recommendedFollowUpDelayDays: 1,
    timezone: 'Europe/Stockholm',
  });
  assert.equal(result.urgencyLevel, 'normal');
  assert.equal(result.reasoning.includes('booking_next_weekday'), true);
});

test('Timing engine markerar hesitant tempo i reasoning', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-02T10:00:00.000Z',
    intent: 'follow_up',
    tone: 'neutral',
    tempoProfile: 'hesitant',
    warmthScore: 0.5,
    timezone: 'Europe/Stockholm',
  });
  assert.equal(result.reasoning.includes('tempo_hesitant'), true);
});

test('Timing engine kopplar anxious tone till hesitant reasoning', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-02T10:00:00.000Z',
    intent: 'follow_up',
    tone: 'anxious',
    tempoProfile: 'reflective',
    warmthScore: 0.5,
    timezone: 'Europe/Stockholm',
  });
  assert.ok(result.reasoning.includes('tempo_hesitant'));
});

test('Timing engine clamps complaint delayHours and keeps business window', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-03T06:00:00.000Z',
    intent: 'complaint',
    delayHours: 99,
    tenantBusinessHours: { startHour: 9, endHour: 17 },
  });
  const scheduled = new Date(result.suggestedDateTime);
  assert.equal(scheduled.getUTCHours() >= 9, true);
  assert.equal(scheduled.getUTCHours() <= 17, true);
  assert.equal(result.reasoning.includes('same_day_complaint_window'), true);
});

test('Timing engine preserves anxiety window and pushes from late night to next weekday', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-06T19:30:00.000Z',
    intent: 'anxiety_pre_op',
    tone: 'anxious',
  });
  const scheduled = new Date(result.suggestedDateTime);
  assert.equal(scheduled.getUTCDay(), 1);
  assert.equal(scheduled.getUTCHours(), 17);
  assert.equal(result.reasoning.includes('weekday_window'), true);
});

test('Timing engine normalizes invalid tempo/intent and keeps default reflective flow', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-02T10:00:00.000Z',
    intent: 'unknown-intent',
    tempoProfile: 'weird',
    recommendedFollowUpDelayDays: -4,
  });
  assert.equal(result.intentAdjusted, false);
  assert.equal(result.urgencyLevel, 'normal');
  assert.equal(result.reason, 'weekday_window');
});

test('Timing engine clamps warmthScore above 1 so booking stays high urgency', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-02T10:00:00.000Z',
    intent: 'booking_request',
    tone: 'neutral',
    tempoProfile: 'reflective',
    warmthScore: 9,
    recommendedFollowUpDelayDays: 1,
    timezone: 'Europe/Stockholm',
  });
  assert.equal(result.urgencyLevel, 'high');
});

test('Timing engine clamps warmthScore below threshold for booking', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-02T10:00:00.000Z',
    intent: 'booking_request',
    tone: 'neutral',
    tempoProfile: 'reflective',
    warmthScore: -5,
    recommendedFollowUpDelayDays: 1,
    timezone: 'Europe/Stockholm',
  });
  assert.equal(result.urgencyLevel, 'normal');
});

test('Timing engine uses NaN warmthScore fallback 0.4', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-02T10:00:00.000Z',
    intent: 'booking_request',
    warmthScore: Number.NaN,
    recommendedFollowUpDelayDays: 1,
  });
  assert.equal(result.urgencyLevel, 'normal');
});

test('Timing engine treats array or string input like empty options', () => {
  const fromArr = suggestFollowUpTiming([]);
  const fromStr = suggestFollowUpTiming('not-an-object');
  assert.equal(fromArr.timezone, 'Europe/Stockholm');
  assert.equal(fromStr.timezone, 'Europe/Stockholm');
  assert.equal(fromArr.manualApprovalRequired, true);
});

test('Timing engine clamps tenantBusinessHours start and end', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-03T10:00:00.000Z',
    intent: 'complaint',
    delayHours: 0,
    tenantBusinessHours: { startHour: 2, endHour: 30 },
  });
  const scheduled = new Date(result.suggestedDateTime);
  assert.equal(scheduled.getUTCHours() >= 6, true);
  assert.equal(scheduled.getUTCHours() <= 22, true);
});

test('Timing engine ignores icke-objekt tenantBusinessHours for complaint window', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-03T10:00:00.000Z',
    intent: 'complaint',
    delayHours: 0,
    tenantBusinessHours: ['8', '17'],
  });
  const scheduled = new Date(result.suggestedDateTime);
  assert.equal(scheduled.getUTCHours() >= 8, true);
});

test('Timing engine blank timezone falls back to Europe/Stockholm', () => {
  const result = suggestFollowUpTiming({
    currentTimestamp: '2026-03-02T10:00:00.000Z',
    timezone: '   \t',
  });
  assert.equal(result.timezone, 'Europe/Stockholm');
});
