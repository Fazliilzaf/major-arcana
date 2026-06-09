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
  it('flags upcoming engine booking with treatment label', () => {
    const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
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
    assert.equal(sig.thisWeekVisit, true);
    assert.equal(sig.hasUpcomingBooking, true);
    assert.equal(sig.treatmentTypes.includes('DHI'), true);
    assert.equal(sig.nextBookingResourceLabel, 'Fazli');
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

  it('maps Cliento bookings into upcoming visit signals', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const patients = [
      { id: 'p3', primaryEmail: 'c@example.com', emails: [], flags: [], fileSummary: {} },
    ];
    const { index } = buildBookingSignalsIndex({
      patients,
      engineBookings: [],
      bookingCases: [],
      encounters: [],
      clientoBookings: [
        {
          bookingId: 'cl-1',
          customerEmail: 'c@example.com',
          startsAt: future,
          status: 'upcoming',
          serviceLabel: 'Konsultation',
          staffName: 'Egzona',
        },
      ],
    });
    const sig = getBookingSignals(index, 'p3');
    assert.equal(sig.hasUpcomingBooking, true);
    assert.equal(sig.nextBookingType, 'Konsultation');
    assert.equal(sig.nextBookingResourceLabel, 'Egzona');
    assert.equal(sig.engineBookingId, 'cl-1');
    assert.equal(sig.upcomingBookings.length, 1);
    assert.equal(sig.upcomingBookings[0].serviceName, 'Konsultation');
  });

  it('exposes internal upcomingBookings and dedupes internal over Cliento', () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const patients = [
      { id: 'p37', primaryEmail: 'ord37@example.com', emails: [], flags: [], fileSummary: {} },
    ];
    const { index } = buildBookingSignalsIndex({
      patients,
      engineBookings: [],
      bookingCases: [
        {
          tenantId: 't1',
          bookingCaseId: 'case-37',
          customerEmail: 'ord37@example.com',
          status: 'confirmed_external',
          selectedSlots: [
            {
              slotId: 'slot-37',
              startsAt: future,
              serviceLabel: 'PRP',
              resourceLabel: 'Fazli',
            },
          ],
        },
      ],
      encounters: [],
      clientoBookings: [
        {
          bookingId: 'cl-37',
          customerEmail: 'ord37@example.com',
          startsAt: future,
          status: 'upcoming',
          serviceLabel: 'PRP',
          staffName: 'Egzona',
        },
      ],
    });
    const sig = getBookingSignals(index, 'p37');
    assert.equal(sig.hasUpcomingBooking, true);
    assert.equal(sig.upcomingBookings.length, 1);
    assert.equal(sig.upcomingBookings[0].source, 'cco_booking_store');
    assert.equal(sig.upcomingBookings[0].staff, 'Fazli');
    assert.equal(sig.historyBookings.length, 0);
  });

  it('exposes empty booking lists for patient without bookings', () => {
    const patients = [
      { id: 'p-empty', primaryEmail: 'empty@example.com', emails: [], flags: [], fileSummary: {} },
    ];
    const { index } = buildBookingSignalsIndex({
      patients,
      engineBookings: [],
      bookingCases: [],
      encounters: [],
      clientoBookings: [],
    });
    const sig = getBookingSignals(index, 'p-empty');
    assert.deepEqual(sig.upcomingBookings, []);
    assert.deepEqual(sig.historyBookings, []);
  });

  it('counts Cliento no_show without treating as completed visit', () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const patients = [
      { id: 'p4', primaryEmail: 'd@example.com', emails: [], flags: [], fileSummary: {} },
    ];
    const { index } = buildBookingSignalsIndex({
      patients,
      engineBookings: [],
      bookingCases: [],
      encounters: [],
      clientoBookings: [
        {
          bookingId: 'cl-ns-1',
          customerEmail: 'd@example.com',
          startsAt: past,
          status: 'no_show',
          serviceLabel: 'Konsultation',
        },
      ],
    });
    const sig = getBookingSignals(index, 'p4');
    assert.equal(sig.noShowCount, 1);
    assert.equal(sig.completedVisitCount, 0);
    assert.equal(sig.lastVisitAt, null);
  });

  it('derives activity from pipedrive treatment dates on patient', () => {
    const treatmentDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const patients = [
      {
        id: 'p5',
        primaryEmail: 'e@example.com',
        emails: [],
        flags: [],
        fileSummary: {},
        pipedrive: {
          deals: [{ status: 'Vunnen', value: '40000', treatmentDate }],
        },
      },
    ];
    const { index } = buildBookingSignalsIndex({
      patients,
      engineBookings: [],
      bookingCases: [],
      encounters: [],
      clientoBookings: [],
    });
    const sig = getBookingSignals(index, 'p5');
    assert.equal(sig.lastVisitAt, treatmentDate);
    assert.equal(sig.lastActivityAt, treatmentDate);
    assert.equal(sig.completedVisitCount, 1);
  });
});
