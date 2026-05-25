'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  notifyStaffBookingCancelled,
  notifyStaffBookingConfirmed,
} = require('../../src/ops/ccoBookingStaffNotify');

test('notifyStaffBookingConfirmed sends graph message', async () => {
  let payload = null;
  const result = await notifyStaffBookingConfirmed({
    graphSendConnector: {
      sendNewMessage: async (input) => {
        payload = input;
      },
    },
    booking: {
      customerName: 'Anna',
      slot: { serviceLabel: 'Konsultation', startsAt: '2026-05-21T08:00:00.000Z' },
    },
    toEmail: 'ops@example.com',
    fromEmail: 'kons@hairtpclinic.com',
  });
  assert.equal(result.skipped, false);
  assert.match(payload.subject, /bekräftad/i);
  assert.equal(payload.to[0].emailAddress.address, 'ops@example.com');
});

test('notifyStaffBookingCancelled skips without connector', async () => {
  const result = await notifyStaffBookingCancelled({
    booking: { customerName: 'Anna' },
    toEmail: 'ops@example.com',
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'graph_send_unavailable');
});
