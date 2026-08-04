'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildJourneySourceEvidence } = require('../../src/routes/ccoPatientMaster');

test('keeps Cliento consultation and Pipedrive offer as separate source evidence', () => {
  const evidence = buildJourneySourceEvidence({
    patient: {
      pipedrive: {
        deals: [
          {
            id: 'deal-4795',
            stage: 'Offert TP',
            value: '46000',
            currency: 'SEK',
            updatedAt: '2026-05-28T10:00:00.000Z',
          },
        ],
      },
    },
    bookings: [
      {
        bookingId: 'booking-1',
        startsAt: '2026-05-21T17:15:00.000Z',
        status: 'completed',
        serviceLabel: 'Online konsultation',
        source: 'cliento',
        notes: 'Offert skickad',
      },
    ],
  });

  assert.deepEqual(evidence.booking, {
    source: 'cliento',
    bookingId: 'booking-1',
    occurredAt: '2026-05-21T17:15:00.000Z',
    status: 'completed',
    serviceLabel: 'Online konsultation',
    notes: 'Offert skickad',
  });
  assert.equal(evidence.offer.dealId, 'deal-4795');
  assert.equal(evidence.offer.stage, 'Offert TP');
  assert.equal(evidence.bookingConfirmation, null);
});

test('does not turn a booking notification or an ordinary deal into journey proof', () => {
  const evidence = buildJourneySourceEvidence({
    patient: { pipedrive: { deals: [{ id: 'deal-1', stage: 'Lead' }] } },
    bookings: [
      {
        bookingId: 'mail-only',
        status: 'completed',
        serviceLabel: 'Konsultation',
        source: 'cliento_web_mail',
      },
    ],
  });

  assert.equal(evidence.booking, null);
  assert.equal(evidence.offer, null);
  assert.equal(evidence.bookingConfirmation, null);
});
