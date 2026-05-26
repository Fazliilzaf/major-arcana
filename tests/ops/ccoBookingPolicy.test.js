'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertCancellationAllowed,
  capAvailabilityToDate,
  isSlotWithinBookingPolicy,
  resolveServiceBookingPolicy,
} = require('../../src/ops/ccoBookingPolicy');

test('resolveServiceBookingPolicy defaults online notice to 120 minutes', () => {
  const policy = resolveServiceBookingPolicy({ meetingMode: 'online' });
  assert.equal(policy.minNoticeMinutes, 120);
  assert.equal(policy.maxBookingDaysAhead, 180);
  assert.equal(policy.cancellationPolicyHours, 24);
});

test('isSlotWithinBookingPolicy rejects slots inside min notice', () => {
  const nowMs = Date.parse('2026-05-20T10:00:00.000Z');
  const service = { meetingMode: 'physical', minNoticeMinutes: 60 };
  const slot = { startsAt: '2026-05-20T10:30:00.000Z' };
  assert.equal(isSlotWithinBookingPolicy(slot, service, nowMs), false);
});

test('capAvailabilityToDate caps beyond max booking horizon', () => {
  const nowMs = Date.parse('2026-05-20T00:00:00.000Z');
  const capped = capAvailabilityToDate('2027-01-01', 180, nowMs);
  assert.equal(capped, '2026-11-16');
});

test('assertCancellationAllowed blocks late cancellation', () => {
  const nowMs = Date.parse('2026-05-20T10:00:00.000Z');
  const booking = { slot: { startsAt: '2026-05-20T20:00:00.000Z' } };
  const service = { cancellationPolicyHours: 24 };
  const result = assertCancellationAllowed(booking, service, nowMs);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /24 timmar/);
});
