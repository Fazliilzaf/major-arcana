'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBookingConfirmationEmail,
} = require('../../src/templates/bookingConfirmationEmail');

test('buildBookingConfirmationEmail bygger svensk bekräftelse med ICS', () => {
  const result = buildBookingConfirmationEmail({
    customerName: 'Anna Test',
    serviceId: 'consultation-physical',
    serviceLabel: 'Fysisk konsultation',
    slotStart: '2026-06-01T09:00:00.000Z',
    resourceLabel: 'Dr. Test',
  });
  assert.match(result.subject, /Din bokning är bekräftad/i);
  assert.match(result.html, /Anna/);
  assert.match(result.html, /Fysisk konsultation/);
  assert.match(result.ics, /BEGIN:VCALENDAR/);
  assert.match(result.ics, /BEGIN:VEVENT/);
  assert.match(result.text, /Anna/);
});

test('buildBookingConfirmationEmail engelsk variant', () => {
  const result = buildBookingConfirmationEmail({
    customerName: 'John Smith',
    serviceId: 'consultation-online',
    slotStart: '2026-06-01T09:00:00.000Z',
    locale: 'en',
  });
  assert.match(result.subject, /Your appointment is confirmed/);
  assert.match(result.html, /Online meeting/);
});
