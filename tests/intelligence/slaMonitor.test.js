const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateSlaMonitor,
  evaluateSlaStatus,
  evaluateStagnation,
  evaluateUnansweredStatus,
  resolveSlaThreshold,
  resolveUnansweredThreshold,
  normalizeOpeningHours,
  computeBusinessHoursBetween,
} = require('../../src/intelligence/slaMonitor');

test('SLA monitor marks Critical 5h as breach during opening hours', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'Critical',
    lastInboundAt: '2026-03-02T09:00:00.000Z',
    lastOutboundAt: null,
    nowMs: Date.parse('2026-03-02T14:00:00.000Z'),
  });

  assert.equal(result.slaStatus, 'breach');
  assert.equal(result.slaThreshold, 4);
  assert.equal(result.hoursRemaining, -1);
});

test('SLA monitor pauses outside opening hours and starts next opening slot', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-03-06T21:30:00.000Z', // fredag efter stängning
    lastOutboundAt: null,
    nowMs: Date.parse('2026-03-07T09:00:00.000Z'), // lördag 09:00 => 1h öppettid
  });

  assert.equal(result.hoursSinceInbound, 1);
  assert.equal(result.slaStatus, 'safe');
  assert.equal(result.hoursRemaining, 11);
});

test('SLA monitor pauses Saturday after 18:00 and skips Sunday entirely', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'Medium',
    lastInboundAt: '2026-03-07T17:50:00.000Z', // lördag
    lastOutboundAt: null,
    nowMs: Date.parse('2026-03-09T09:00:00.000Z'), // måndag
  });

  // 10 min på lördag + 1h på måndag
  assert.equal(result.hoursSinceInbound, 1.2);
  assert.equal(result.slaStatus, 'safe');
});

test('SLA monitor marks High 9h as warning', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-03-02T08:00:00.000Z',
    lastOutboundAt: null,
    nowMs: Date.parse('2026-03-02T17:00:00.000Z'),
  });

  assert.equal(result.slaStatus, 'warning');
  assert.equal(result.slaThreshold, 12);
  assert.equal(result.hoursRemaining, 3);
});

test('SLA monitor marks Medium 10h as safe', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'Medium',
    lastInboundAt: '2026-03-02T08:00:00.000Z',
    lastOutboundAt: null,
    nowMs: Date.parse('2026-03-02T18:00:00.000Z'),
  });

  assert.equal(result.slaStatus, 'safe');
  assert.equal(result.slaThreshold, 24);
  assert.equal(result.hoursRemaining, 14);
});

test('SLA monitor sets safe when outbound is newer than inbound', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-03-02T09:00:00.000Z',
    lastOutboundAt: '2026-03-02T10:00:00.000Z',
    nowMs: Date.parse('2026-03-02T16:00:00.000Z'),
  });

  assert.equal(result.answered, true);
  assert.equal(result.slaStatus, 'safe');
  assert.equal(result.isUnanswered, false);
});

test('SLA monitor marks outbound-without-new-inbound over threshold as stagnated', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-03-02T08:00:00.000Z',
    lastOutboundAt: '2026-03-02T09:00:00.000Z',
    nowMs: Date.parse('2026-03-03T16:00:00.000Z'),
  });

  assert.equal(result.stagnated, true);
  assert.equal(result.followUpSuggested, true);
  assert.equal(result.stagnationHours >= 12, true);
});

test('SLA monitor defers follow-up suggestion outside opening hours', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-03-06T08:00:00.000Z',
    lastOutboundAt: null,
    nowMs: Date.parse('2026-03-06T22:00:00.000Z'),
  });

  assert.equal(result.stagnated, true);
  assert.equal(result.followUpSuggested, false);
  assert.equal(result.followUpDeferred, true);
});

test('SLA monitor marks complaint unanswered after 6h', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'Low',
    intent: 'complaint',
    needsReplyStatus: 'needs_reply',
    lastInboundAt: '2026-03-02T08:00:00.000Z',
    nowMs: Date.parse('2026-03-02T14:12:00.000Z'),
  });

  assert.equal(result.unansweredThresholdHours, 6);
  assert.equal(result.isUnanswered, true);
});

test('SLA monitor keeps booking request below unanswered threshold', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    intent: 'booking_request',
    needsReplyStatus: 'needs_reply',
    lastInboundAt: '2026-03-02T08:00:00.000Z',
    nowMs: Date.parse('2026-03-02T18:30:00.000Z'),
  });

  assert.equal(result.unansweredThresholdHours, 12);
  assert.equal(result.isUnanswered, false);
});

test('SLA monitor treats handled conversation as not unanswered', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'Medium',
    intent: 'pricing_question',
    needsReplyStatus: 'handled',
    lastInboundAt: '2026-03-02T08:00:00.000Z',
    nowMs: Date.parse('2026-03-03T16:00:00.000Z'),
  });

  assert.equal(result.unansweredThresholdHours, 24);
  assert.equal(result.isUnanswered, false);
});

test('SLA monitor skips Swedish public holidays in business-hour calculation', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-01-05T19:00:00.000Z',
    nowMs: Date.parse('2026-01-07T09:00:00.000Z'),
  });

  // Jan 6 (Trettondedag jul) should be treated as closed day.
  // 1h on Jan 5 evening + 1h on Jan 7 morning.
  assert.equal(result.hoursSinceInbound, 2);
  assert.equal(result.slaStatus, 'safe');
});

test('SLA monitor respects custom holiday dates override', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-03-02T10:00:00.000Z',
    nowMs: Date.parse('2026-03-03T10:00:00.000Z'),
    openingHours: {
      holidayDates: ['2026-03-03'],
    },
  });

  // Mar 3 is configured as holiday, only previous day business hours should count.
  assert.equal(result.hoursSinceInbound, 10);
});

test('SLA monitor skips Christmas holiday window automatically', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-12-24T19:00:00.000Z',
    nowMs: Date.parse('2026-12-26T09:00:00.000Z'),
  });

  // Dec 24-26 are holiday/closed in Swedish calendar. No open business hours should accrue.
  assert.equal(result.hoursSinceInbound, 0);
  assert.equal(result.slaStatus, 'safe');
  assert.equal(result.hoursRemaining, 12);
});

test('SLA monitor can ignore opening hours when respectOpeningHours=false', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-03-06T21:30:00.000Z',
    nowMs: Date.parse('2026-03-07T09:00:00.000Z'),
    respectOpeningHours: false,
  });

  assert.equal(result.withinOpeningHours, true);
  assert.equal(result.hoursSinceInbound, 11.5);
  assert.equal(result.slaStatus, 'warning');
});

test('SLA monitor applies threshold clamps for invalid overrides', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'Critical',
    thresholds: { Critical: 0 },
    hoursSinceInbound: 2,
  });

  assert.equal(result.slaThreshold, 1);
  assert.equal(result.slaStatus, 'breach');
});

test('SLA monitor unanswered uses default threshold for unknown intent with overrides', () => {
  const result = evaluateSlaMonitor({
    intent: 'totally_unknown',
    needsReplyStatus: 'needs_reply',
    unansweredThresholds: {
      default: 3,
      unclear: 9,
    },
    hoursSinceInbound: 4,
  });

  assert.equal(result.unansweredThresholdHours, 9);
  assert.equal(result.isUnanswered, false);
});

test('SLA monitor normalizes explicit windows and invalid nowMs fallback', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'Low',
    lastInboundAt: '2026-03-02T06:30:00.000Z',
    nowMs: 'not-a-number',
    openingHours: {
      windows: {
        1: { startMinutes: 600, endMinutes: 600 }, // invalid equal bounds -> closed
      },
      autoHolidayCalendar: false,
    },
    hoursSinceInbound: 2,
  });

  assert.equal(result.withinOpeningHours, false);
  assert.equal(result.hoursSinceInbound, 0);
  assert.equal(result.slaStatus, 'safe');
});

test('resolveSlaThreshold normaliserar prioritet och clampar extrema overrides', () => {
  assert.equal(resolveSlaThreshold('critical'), 4);
  assert.equal(resolveSlaThreshold('HIGH'), 12);
  assert.equal(resolveSlaThreshold('Medium', { Medium: 999 }), 336);
  assert.equal(resolveSlaThreshold('Low', { Low: 0 }), 1);
});

test('resolveUnansweredThreshold mappar intent och default', () => {
  assert.equal(resolveUnansweredThreshold('complaint'), 6);
  assert.equal(resolveUnansweredThreshold('BOOKING_REQUEST'), 12);
  assert.equal(resolveUnansweredThreshold('legacy_xyz', { default: 10 }), 10);
});

test('normalizeOpeningHours läser tz-alias och kan stänga av helgdagskalender', () => {
  const oh = normalizeOpeningHours({ tz: 'UTC', autoHolidayCalendar: false });
  assert.equal(oh.timezone, 'UTC');
  assert.equal(oh.autoHolidayCalendar, false);
  assert.equal(oh.windows[0], null);
  assert.ok(oh.windows[1]);
});

test('computeBusinessHoursBetween räknar öppettid inom samma UTC-dag', () => {
  const start = Date.parse('2026-03-02T08:00:00.000Z');
  const end = Date.parse('2026-03-02T10:00:00.000Z');
  assert.equal(computeBusinessHoursBetween(start, end, null), 2);
});

test('computeBusinessHoursBetween returnerar 0 när end ligger före start', () => {
  const start = Date.parse('2026-03-02T10:00:00.000Z');
  const end = Date.parse('2026-03-02T08:00:00.000Z');
  assert.equal(computeBusinessHoursBetween(start, end, null), 0);
});

test('resolveSlaThreshold ignorerar overrides som inte är ett plain object', () => {
  assert.equal(resolveSlaThreshold('High', []), 12);
  assert.equal(resolveSlaThreshold('High', 'not-object'), 12);
});

test('resolveUnansweredThreshold ignorerar ogiltiga overrides-typer', () => {
  assert.equal(resolveUnansweredThreshold('complaint', []), 6);
  assert.equal(resolveUnansweredThreshold('complaint', null), 6);
  assert.equal(resolveUnansweredThreshold('complaint', 'x'), 6);
});

test('resolveUnansweredThreshold klampar override till 1..336', () => {
  assert.equal(resolveUnansweredThreshold('pricing_question', { pricing_question: 72 }), 72);
  assert.equal(resolveUnansweredThreshold('pricing_question', { pricing_question: 0 }), 1);
  assert.equal(resolveUnansweredThreshold('pricing_question', { pricing_question: 999 }), 336);
});

test('evaluateSlaStatus sätter safe och full återstående timmar när answered är true', () => {
  const r = evaluateSlaStatus({
    hoursSinceInbound: 99,
    priorityLevel: 'High',
    answered: true,
  });
  assert.equal(r.slaStatus, 'safe');
  assert.equal(r.slaThreshold, 12);
  assert.equal(r.hoursRemaining, 12);
});

test('evaluateUnansweredStatus markerar inte obesvarat när answered eller handled', () => {
  const answered = evaluateUnansweredStatus({
    hoursSinceInbound: 200,
    intent: 'complaint',
    needsReplyStatus: 'needs_reply',
    answered: true,
  });
  assert.equal(answered.isUnanswered, false);
  assert.equal(answered.unansweredThresholdHours, 6);

  const handled = evaluateUnansweredStatus({
    hoursSinceInbound: 200,
    intent: 'complaint',
    needsReplyStatus: '  HANDLED ',
    answered: false,
  });
  assert.equal(handled.isUnanswered, false);
});

test('evaluateStagnation använder väggklocka för outbound-ålder när respectOpeningHours är false', () => {
  const nowMs = Date.parse('2026-03-02T19:00:00.000Z');
  const r = evaluateStagnation({
    lastInboundAt: '2026-03-02T06:00:00.000Z',
    lastOutboundAt: '2026-03-02T07:00:00.000Z',
    priorityLevel: 'High',
    nowMs,
    respectOpeningHours: false,
  });
  assert.equal(r.stagnated, true);
  assert.equal(r.stagnationHours, 12);
  assert.equal(r.followUpSuggested, true);
});

test('evaluateStagnation ingen stagnation när nytt inkommande efter utgående', () => {
  const r = evaluateStagnation({
    lastInboundAt: '2026-03-02T12:00:00.000Z',
    lastOutboundAt: '2026-03-02T10:00:00.000Z',
    priorityLevel: 'High',
    nowMs: Date.parse('2026-03-02T19:00:00.000Z'),
  });
  assert.equal(r.stagnated, false);
  assert.equal(r.stagnationHours, 0);
});
