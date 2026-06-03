'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBookingSignalsIndex,
  getBookingSignals,
  isTodayVisit,
  isThisWeekVisit,
} = require('../../src/ops/ccoKunderBookingEnrichment');

describe('ccoKunderBookingEnrichment', () => {
  it('flags today and week visits from engine booking', () => {
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const patients = [
      {
        id: 'p1',
        primaryEmail: 'a@example.com',
        emails: [],
        flags: [],
        fileSummary: {},
      },
    ];
    const { index } = buildBookingSignalsIndex({
      patients,
      engineBookings: [
        {
          tenantId: 't1',
          customerEmail: 'a@example.com',
          conversationId: 'c1',
          status: 'confirmed',
          slot: {
            startsAt,
            serviceId: 'dhi',
            resourceLabel: 'Fazli',
          },
        },
      ],
      bookingCases: [],
      encounters: [],
    });
    const sig = getBookingSignals(index, 'p1');
    assert.equal(sig.todayVisit, true);
    assert.equal(sig.thisWeekVisit, true);
    assert.equal(sig.hasUpcomingBooking, true);
    assert.equal(sig.treatmentTypes.includes('DHI'), true);
  });

  it('waitlist from booking case status', () => {
    const patients = [
      { id: 'p2', primaryEmail: 'b@example.com', emails: [], flags: [], fileSummary: {} },
    ];
    const { index } = buildBookingSignalsIndex({
      patients,
      engineBookings: [],
      bookingCases: [
        {
          tenantId: 't1',
          customerEmail: 'b@example.com',
          conversationId: 'c2',
          status: 'waiting_customer',
          selectedSlots: [],
        },
      ],
      encounters: [],
    });
    assert.equal(getBookingSignals(index, 'p2').onWaitlist, true);
  });

  it('isTodayVisit helper', () => {
    const today = new Date().toISOString();
    assert.equal(isTodayVisit(today), true);
    assert.equal(isTodayVisit('1999-01-01T10:00:00.000Z'), false);
  });

  it('isThisWeekVisit within 7 days', () => {
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    assert.equal(isThisWeekVisit(inThreeDays), true);
  });
});
