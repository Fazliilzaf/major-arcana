'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeBookingPolicySettings,
  applyBookingPolicyMigrationToServices,
  resolveServicePolicyFields,
} = require('../../src/ops/bookingPolicySettings');

test('booking policy migration defaults use Cliento min-notice values', () => {
  const settings = normalizeBookingPolicySettings({});
  assert.equal(settings.globalDefaults.minNoticeOnlineMinutes, 120);
  assert.equal(settings.globalDefaults.minNoticePhysicalMinutes, 60);
  assert.equal(settings.globalDefaults.maxBookingDaysAhead, 180);
  assert.equal(settings.globalDefaults.cancellationPolicyHours, 24);
});

test('resolveServicePolicyFields applies per-service overrides', () => {
  const fields = resolveServicePolicyFields(
    { id: 'consultation-online', meetingMode: 'online' },
    normalizeBookingPolicySettings({})
  );
  assert.equal(fields.minNoticeMinutes, 120);
  assert.equal(fields.cancellationPolicyHours, 24);
  assert.equal(fields.vipTokenRequired, false);

  const followup = resolveServicePolicyFields({ id: 'followup-transplant' }, normalizeBookingPolicySettings({}));
  assert.equal(followup.vipTokenRequired, true);
});

test('applyBookingPolicyMigrationToServices stamps policy fields', () => {
  const services = applyBookingPolicyMigrationToServices([
    { id: 'consultation-physical', label: 'Fysisk', durationMinutes: 30, active: true },
  ]);
  assert.equal(services[0].minNoticeMinutes, 60);
  assert.equal(services[0].maxBookingDaysAhead, 180);
});
