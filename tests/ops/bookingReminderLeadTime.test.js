'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadBookingReminderLeadTimeMigrationDefaults,
  normalizeBookingReminderLeadTimeConfig,
  resolveBookingReminderLeadTimeHours,
  resolveMeetingChannel,
  isWithinReminderLeadWindow,
  computeMaxLeadTimeHours,
} = require('../../src/ops/bookingReminderLeadTime');

test('migration defaults match Cliento start values (4h online / 24h fysisk)', () => {
  const defaults = loadBookingReminderLeadTimeMigrationDefaults();
  assert.equal(defaults.globalDefaultHours, 24);
  assert.equal(defaults.channelDefaults.online, 4);
  assert.equal(defaults.channelDefaults.physical, 24);
  assert.match(defaults.migrationSource, /booking-reminder-lead-time-defaults\.json/);
});

test('resolveBookingReminderLeadTimeHours prioritizes service > resource > channel > global', () => {
  const config = normalizeBookingReminderLeadTimeConfig({
    globalDefaultHours: 24,
    channelDefaults: { online: 4, physical: 24, default: 24 },
    serviceOverrides: { 'consultation-online': 6 },
    resourceOverrides: { fazli: 12 },
  });

  assert.equal(
    resolveBookingReminderLeadTimeHours({
      config,
      service: { id: 'consultation-online', meetingMode: 'online' },
    }),
    6
  );

  assert.equal(
    resolveBookingReminderLeadTimeHours({
      config,
      service: { id: 'followup-transplant', meetingMode: 'physical' },
      resourceId: 'fazli',
    }),
    12
  );

  assert.equal(
    resolveBookingReminderLeadTimeHours({
      config,
      service: { id: 'consultation-online', meetingMode: 'online' },
      resourceId: 'fazli',
    }),
    6
  );

  assert.equal(
    resolveBookingReminderLeadTimeHours({
      config,
      service: { id: 'prp-hair', meetingMode: 'physical' },
    }),
    24
  );
});

test('resolveMeetingChannel infers online from service id', () => {
  assert.equal(resolveMeetingChannel({ id: 'consultation-online' }), 'online');
  assert.equal(resolveMeetingChannel({ id: 'consultation-physical' }), 'physical');
});

test('isWithinReminderLeadWindow accepts visits near configured lead time', () => {
  assert.equal(
    isWithinReminderLeadWindow({ hoursUntilVisit: 24.2, leadTimeHours: 24, toleranceHours: 1 }),
    true
  );
  assert.equal(
    isWithinReminderLeadWindow({ hoursUntilVisit: 12, leadTimeHours: 24, toleranceHours: 1 }),
    false
  );
});

test('computeMaxLeadTimeHours scans overrides', () => {
  const max = computeMaxLeadTimeHours({
    globalDefaultHours: 24,
    channelDefaults: { online: 4, physical: 24, default: 24 },
    serviceOverrides: { 'prp-hair': 48 },
  });
  assert.equal(max, 48);
});
