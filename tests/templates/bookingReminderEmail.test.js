'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBookingReminderEmail,
  buildIcsCalendarInvite,
} = require('../../src/templates/bookingReminderEmail');

test('buildBookingReminderEmail includes ICS calendar payload', () => {
  const startsAt = '2026-06-01T09:00:00.000Z';
  const result = buildBookingReminderEmail({
    customerName: 'Anna Test',
    serviceLabel: 'Fysisk konsultation',
    startsAt,
    leadTimeHours: 24,
  });
  assert.match(result.subject, /Påminnelse/i);
  assert.match(result.html, /Anna/);
  assert.match(result.ics, /BEGIN:VCALENDAR/);
  assert.match(result.ics, /BEGIN:VEVENT/);
});

test('buildIcsCalendarInvite formats UTC timestamps', () => {
  const ics = buildIcsCalendarInvite({
    uid: 'test-1',
    startsAt: '2026-06-01T09:00:00.000Z',
    durationMinutes: 30,
    summary: 'Test',
  });
  assert.match(ics, /DTSTART:20260601T090000Z/);
});
