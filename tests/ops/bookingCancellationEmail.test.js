'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBookingCancellationEmail,
} = require('../../src/templates/bookingCancellationEmail');
const {
  dispatchBookingCancellationEmail,
} = require('../../src/ops/ccoPatientCareOps');

test('buildBookingCancellationEmail svenska — innehåller mötestyp, tid och rebook-instruktion', () => {
  const content = buildBookingCancellationEmail({
    customerName: 'Anna Andersson',
    serviceId: 'consultation-physical',
    serviceLabel: 'Fysisk konsultation',
    slotStart: '2026-06-02T08:30:00.000Z',
    resourceLabel: 'Dr. Arya Emami',
    reason: 'Kunden behövde en annan dag',
    locale: 'sv',
  });
  assert.match(content.subject, /Din bokning är avbokad/);
  assert.match(content.text, /Hej Anna/);
  assert.match(content.text, /Fysisk konsultation/);
  assert.match(content.text, /Dr. Arya Emami/);
  assert.match(content.text, /Kunden behövde en annan dag/);
  assert.match(content.html, /Din bokning är avbokad/);
  assert.match(content.html, /Fysisk konsultation/);
});

test('buildBookingCancellationEmail english — locale=en uses english subject/body', () => {
  const content = buildBookingCancellationEmail({
    customerName: 'Bob',
    serviceId: 'consultation-online',
    serviceLabel: 'Online möte',
    slotStart: '2026-06-02T08:30:00.000Z',
    locale: 'en',
  });
  assert.match(content.subject, /Your appointment is cancelled/);
  assert.match(content.text, /Hi Bob/);
});

test('dispatchBookingCancellationEmail skickar via graph-send fallback och loggar reminder', async () => {
  const sentEmails = [];
  const reminderLog = [];
  let wasSentCalled = 0;
  const graphSendConnector = {
    sendNewMessage: async (input) => {
      sentEmails.push(input);
      return { mailboxId: input.mailboxId };
    },
  };
  const patientCareStateStore = {
    wasReminderSent: async () => {
      wasSentCalled += 1;
      return false;
    },
    logReminder: async (input) => {
      reminderLog.push(input);
    },
  };

  const result = await dispatchBookingCancellationEmail({
    booking: {
      bookingId: 'book-1',
      tenantId: 'tenant-a',
      customerEmail: 'anna@hairtpclinic.se',
      customerName: 'Anna',
      slot: {
        serviceId: 'consultation-physical',
        serviceLabel: 'Fysisk konsultation',
        startsAt: '2026-06-02T08:30:00.000Z',
        resourceLabel: 'Dr. Arya',
        locationLabel: 'Hair TP Clinic',
      },
    },
    graphSendConnector,
    patientCareStateStore,
    fromEmail: 'kons@hairtpclinic.com',
    reason: 'Kunden vill omboka',
    tenantId: 'tenant-a',
  });

  assert.equal(result.skipped, false);
  assert.equal(result.recipient, 'anna@hairtpclinic.se');
  assert.equal(wasSentCalled, 1);
  assert.equal(sentEmails.length, 1);
  assert.match(sentEmails[0].subject, /Din bokning är avbokad/);
  assert.equal(reminderLog.length, 1);
  assert.equal(reminderLog[0].reminderType, 'booking_cancellation');
  assert.equal(reminderLog[0].reminderKey, 'booking_cancellation:book-1');
  assert.equal(reminderLog[0].channel, 'patient_email');
});

test('dispatchBookingCancellationEmail är idempotent — wasReminderSent=true ⇒ skippa', async () => {
  const sent = [];
  const graphSendConnector = {
    sendNewMessage: async (input) => {
      sent.push(input);
    },
  };
  const patientCareStateStore = {
    wasReminderSent: async () => true,
    logReminder: async () => {
      throw new Error('logReminder should not be called when already sent');
    },
  };
  const result = await dispatchBookingCancellationEmail({
    booking: {
      bookingId: 'book-2',
      tenantId: 'tenant-a',
      customerEmail: 'foo@hairtpclinic.se',
      slot: { serviceId: 'x', startsAt: '2026-06-02T08:30:00.000Z' },
    },
    graphSendConnector,
    patientCareStateStore,
    tenantId: 'tenant-a',
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'already_sent');
  assert.equal(sent.length, 0);
});

test('dispatchBookingCancellationEmail hoppar om mottagare saknas', async () => {
  const result = await dispatchBookingCancellationEmail({
    booking: { bookingId: 'b', slot: { startsAt: '' } },
    graphSendConnector: { sendNewMessage: async () => {} },
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'no_recipient');
});
