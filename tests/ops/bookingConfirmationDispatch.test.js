'use strict';

/**
 * Skyddar mot en verklig incident: personalen kunde stänga av "Automatisk
 * bokningsbekräftelse" i inställningarna (toggles.automaticBookingConfirmation),
 * men ingen backend-kod läste flaggan — bekräftelsemail fortsatte gå ut till
 * kunderna ändå. Flaggan fanns bara som defaultvärde i ccoSettingsStore.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { dispatchBookingConfirmation } = require('../../src/ops/bookingConfirmationDispatch');

function fakeGraph() {
  const sent = [];
  return {
    sent,
    sendMail: async (mail) => {
      sent.push(mail);
      return { messageId: 'msg-1' };
    },
    createCalendarEvent: async () => ({ id: 'evt-1' }),
  };
}

const baseBooking = {
  bookingId: 'b1',
  slot: { startsAt: '2026-09-01T10:00:00Z', serviceLabel: 'Konsultation' },
};

test('dispatchBookingConfirmation skickar bekräftelse när flaggan är på (default)', async () => {
  const graph = fakeGraph();
  const result = await dispatchBookingConfirmation({
    booking: baseBooking,
    customerEmail: 'kund@exempel.se',
    customerName: 'Kund Test',
    graphSendConnector: graph,
  });
  assert.equal(graph.sent.length, 1);
  assert.equal(result.email.ok, true);
  assert.equal(result.skipped, false);
});

test('dispatchBookingConfirmation avstår när automaticBookingConfirmation är av', async () => {
  const graph = fakeGraph();
  const result = await dispatchBookingConfirmation({
    booking: baseBooking,
    customerEmail: 'kund@exempel.se',
    customerName: 'Kund Test',
    graphSendConnector: graph,
    automaticBookingConfirmation: false,
  });
  assert.equal(graph.sent.length, 0);
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, 'automatic_booking_confirmation_disabled');
});
