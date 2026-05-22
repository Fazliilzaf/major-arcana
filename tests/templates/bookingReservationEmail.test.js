const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBookingReservationEmail,
  buildOperatorNotificationEmail,
  resolveMeetingTypeCopy,
} = require('../../src/templates/bookingReservationEmail');

test('resolveMeetingTypeCopy maps Plan A online meeting', () => {
  const copy = resolveMeetingTypeCopy({
    serviceId: 'consultation-online',
    locale: 'sv',
  });
  assert.equal(copy.meetingType, 'Online möte');
  assert.match(copy.channel, /videomöte/i);
  assert.match(copy.instruction, /videolänk/i);
});

test('resolveMeetingTypeCopy maps Plan A physical consultation', () => {
  const copy = resolveMeetingTypeCopy({
    serviceId: 'consultation-physical',
    locationLabel: 'Hair TP Clinic',
    locale: 'sv',
  });
  assert.equal(copy.meetingType, 'Fysisk konsultation');
  assert.equal(copy.channel, 'Hair TP Clinic');
});

test('resolveMeetingTypeCopy maps Plan A follow-up transplant', () => {
  const copy = resolveMeetingTypeCopy({
    serviceId: 'followup-transplant',
    locale: 'en',
  });
  assert.equal(copy.meetingType, 'Hair transplant follow-up');
});

test('buildBookingReservationEmail includes meeting type and online instruction', () => {
  const email = buildBookingReservationEmail({
    patientName: 'Anna Test',
    slotStart: '2026-06-01T09:30:00+02:00',
    expiresAt: '2026-06-01T09:45:00+02:00',
    resourceLabel: 'Egzona Krasniqi',
    serviceId: 'consultation-online',
    locale: 'sv',
  });
  assert.match(email.subject, /reserverad/i);
  assert.match(email.text, /Online möte/);
  assert.match(email.text, /videolänk/i);
  assert.match(email.text, /15 minuter/);
  assert.match(email.html, /Mötestyp/);
});

test('buildOperatorNotificationEmail includes surgery date from leadContext', () => {
  const email = buildOperatorNotificationEmail({
    patientName: 'Anna Test',
    patientEmail: 'anna@example.com',
    patientPhone: '+46701234567',
    slotStart: '2026-06-01T09:30:00+02:00',
    serviceId: 'followup-transplant',
    leadContext: { surgeryDate: '2025-11-12' },
  });
  assert.match(email.text, /Uppföljning hårtransplantation/);
  assert.match(email.text, /2025-11-12/);
});
