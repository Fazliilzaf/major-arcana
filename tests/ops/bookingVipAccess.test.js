'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveBookingVipToken,
  isServiceAllowedForVipToken,
} = require('../../src/ops/bookingVipAccess');

test('VIP seed token resolves followup-transplant', () => {
  const token = resolveBookingVipToken('followup-transplant-v1');
  assert.ok(token);
  assert.ok(token.serviceIds.includes('followup-transplant'));
  assert.ok(isServiceAllowedForVipToken('followup-transplant', token));
  assert.equal(isServiceAllowedForVipToken('consultation-online', token), false);
});
