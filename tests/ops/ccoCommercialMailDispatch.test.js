'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  dispatchOfferEmail,
  dispatchTreatmentPlanEmail,
  dispatchBookingConfirmationEmail,
  buildOfferReminderKey,
  buildPlanReminderKey,
  buildBookingConfirmationReminderKey,
} = require('../../src/ops/ccoCommercialMailDispatch');

function createFakePatientCareStateStore() {
  const seen = new Map();
  return {
    seen,
    async wasReminderSent({ tenantId, reminderKey }) {
      return seen.has(`${tenantId}::${reminderKey}`);
    },
    async logReminder({ tenantId, reminderKey, reminderType, patientId, channel, metadata }) {
      seen.set(`${tenantId}::${reminderKey}`, {
        reminderType,
        patientId,
        channel,
        metadata,
      });
    },
  };
}

function createFakeGraphSendConnector() {
  const calls = [];
  return {
    calls,
    async sendNewMessage(input) {
      calls.push(input);
      return { sendMode: 'send_mail', mailboxId: input.mailboxId };
    },
  };
}

test('dispatchOfferEmail loggar reminder och hoppar över reserved-domän vid andra försök', async () => {
  const patientCareStateStore = createFakePatientCareStateStore();
  const graphSendConnector = createFakeGraphSendConnector();

  const result = await dispatchOfferEmail({
    tenantId: 'hair-tp-clinic',
    conversationId: 'conv-1',
    offer: {
      offerId: 'offer-123',
      customerName: 'Anna Test',
      offerType: 'FUE 3000 grafts',
      amount: 65000,
      signUrl: 'https://example.com/o/abc',
    },
    recipient: 'anna@example.com',
    graphSendConnector,
    patientCareStateStore,
    patientId: 'patient-1',
  });

  assert.equal(result.skipped, false);
  assert.equal(result.recipient, 'anna@example.com');
  assert.equal(graphSendConnector.calls.length, 0);
  assert.ok(patientCareStateStore.seen.has('hair-tp-clinic::offer_email:hair-tp-clinic:offer-123'));

  const second = await dispatchOfferEmail({
    tenantId: 'hair-tp-clinic',
    conversationId: 'conv-1',
    offer: { offerId: 'offer-123' },
    recipient: 'anna@example.com',
    graphSendConnector,
    patientCareStateStore,
  });
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'already_sent');
  assert.equal(graphSendConnector.calls.length, 0);
});

test('dispatchTreatmentPlanEmail skickar och loggar', async () => {
  const patientCareStateStore = createFakePatientCareStateStore();
  const graphSendConnector = createFakeGraphSendConnector();
  const result = await dispatchTreatmentPlanEmail({
    tenantId: 'hair-tp-clinic',
    plan: {
      planId: 'plan-1',
      customerName: 'Anna Test',
      method: 'FUE',
      graftsTotal: 3000,
      zones: ['front'],
    },
    recipient: 'anna@example.com',
    graphSendConnector,
    patientCareStateStore,
    viewUrl: 'https://example.com/plan/abc',
  });
  assert.equal(result.skipped, false);
  assert.equal(graphSendConnector.calls.length, 0);
  assert.ok(patientCareStateStore.seen.has('hair-tp-clinic::treatment_plan_email:hair-tp-clinic:plan-1'));
});

test('dispatchBookingConfirmationEmail skickar med ICS-bilaga och loggar', async () => {
  const patientCareStateStore = createFakePatientCareStateStore();
  const graphSendConnector = createFakeGraphSendConnector();
  const result = await dispatchBookingConfirmationEmail({
    tenantId: 'hair-tp-clinic',
    booking: {
      bookingId: 'b-1',
      customerEmail: 'anna@example.com',
      customerName: 'Anna Test',
      slot: {
        serviceId: 'consultation-physical',
        serviceLabel: 'Fysisk konsultation',
        startsAt: '2026-06-01T09:00:00.000Z',
        resourceLabel: 'Dr. Test',
      },
    },
    graphSendConnector,
    patientCareStateStore,
  });
  assert.equal(result.skipped, false);
  assert.equal(graphSendConnector.calls.length, 0);
  const logged = patientCareStateStore.seen.get('hair-tp-clinic::booking_confirmation:hair-tp-clinic:b-1');
  assert.equal(logged?.metadata?.includesIcs, true);
});

test('dispatchOfferEmail returnerar skipped vid ogiltig mottagare', async () => {
  const result = await dispatchOfferEmail({
    tenantId: 'hair-tp-clinic',
    offer: { offerId: 'x' },
    recipient: 'not-an-email',
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'no_recipient');
});

test('reminderKeys är deterministiska och bär tenant + id', () => {
  assert.match(
    buildOfferReminderKey({ tenantId: 't', offer: { offerId: 'a' }, recipient: 'x@y.se' }),
    /^offer_email:t:a$/
  );
  assert.match(
    buildPlanReminderKey({ tenantId: 't', plan: { planId: 'p' }, recipient: 'x@y.se' }),
    /^treatment_plan_email:t:p$/
  );
  assert.match(
    buildBookingConfirmationReminderKey({ tenantId: 't', booking: { bookingId: 'b' } }),
    /^booking_confirmation:t:b$/
  );
});
