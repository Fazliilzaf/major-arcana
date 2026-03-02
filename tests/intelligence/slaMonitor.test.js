const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateSlaMonitor } = require('../../src/intelligence/slaMonitor');

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

test('SLA monitor skips configured holidays during business-hour calculation', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-03-02T09:00:00.000Z',
    lastOutboundAt: null,
    nowMs: Date.parse('2026-03-03T10:00:00.000Z'),
    openingHours: {
      holidays: ['2026-03-02'],
    },
  });

  assert.equal(result.hoursSinceInbound, 2);
  assert.equal(result.slaStatus, 'safe');
  assert.equal(result.withinOpeningHours, true);
});

test('SLA monitor treats holiday as closed even inside weekday window', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-03-02T08:00:00.000Z',
    lastOutboundAt: null,
    nowMs: Date.parse('2026-03-02T10:00:00.000Z'),
    openingHours: {
      holidays: ['2026-03-02'],
    },
  });

  assert.equal(result.withinOpeningHours, false);
  assert.equal(result.hoursSinceInbound, 0);
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

test('SLA monitor applies built-in Swedish holidays when no explicit list is provided', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-04-30T19:00:00.000Z',
    nowMs: Date.parse('2026-05-01T10:00:00.000Z'),
  });

  // 1h Thursday evening only; May 1st is treated as closed holiday.
  assert.equal(result.hoursSinceInbound, 1);
  assert.equal(result.withinOpeningHours, false);
  assert.equal(result.slaStatus, 'safe');
});

test('SLA monitor can disable built-in holiday calendar explicitly', () => {
  const result = evaluateSlaMonitor({
    priorityLevel: 'High',
    lastInboundAt: '2026-04-30T19:00:00.000Z',
    nowMs: Date.parse('2026-05-01T10:00:00.000Z'),
    openingHours: {
      includeDefaultHolidays: false,
      holidayRegion: 'SE',
    },
  });

  // 1h Thursday evening + 2h Friday morning.
  assert.equal(result.hoursSinceInbound, 3);
  assert.equal(result.withinOpeningHours, true);
  assert.equal(result.slaStatus, 'safe');
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
