'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { payloadChecksums } = require('../../src/ops/clientoCrossTenantCoverage');
const {
  buildBookingSignalsIndex,
  collectBookingReadouts,
  getBookingSignals,
  isTodayVisit,
  isThisWeekVisit,
  buildPatientLookupMaps,
  buildUnlinkedClientoBookingReview,
  buildCanonicalBookingIntegrityReport,
  resolvePatientIdFromClientoBooking,
} = require('../../src/ops/ccoKunderBookingEnrichment');

function checksum(label) {
  return crypto.createHash('sha256').update(`shadow:${label}`).digest('hex');
}

function sourceRef(booking) {
  const sums = payloadChecksums(booking);
  return {
    tenantId: booking.tenantId,
    bookingId: booking.bookingId,
    sourceSnapshotChecksum: checksum(`${booking.tenantId}:source`),
    coreChecksum: sums.coreChecksum,
    notesChecksum: sums.notesChecksum,
  };
}

function approvedHistoricalLink(left, right, overrides = {}) {
  return {
    ledgerEventId: 'ledger-approved-1',
    linkId: 'shadow-link-1',
    state: 'approved',
    sourceRefs: [sourceRef(left), sourceRef(right)],
    canonicalPatientId: 'p-shadow',
    canonicalEncounterId: null,
    linkType: 'exact_booking_duplicate',
    reasonCode: 'historical_booking_without_encounter',
    compareAndSwap: { sourceRefsChecksum: checksum('source-refs') },
    ...overrides,
  };
}

describe('ccoKunderBookingEnrichment', () => {
  it('does not guess a canonical patient when Cliento identity is ambiguous', () => {
    const lookup = buildPatientLookupMaps([
      { id: 'p-a', primaryEmail: 'shared@example.com', cliento: { sourceId: 'shared-cliento' } },
      { id: 'p-b', primaryEmail: 'shared@example.com', cliento: { sourceId: 'shared-cliento' } },
    ]);
    assert.equal(
      resolvePatientIdFromClientoBooking(
        { customerEmail: 'shared@example.com', clientoCustomerId: 'shared-cliento' },
        lookup
      ),
      null
    );
    assert.equal(lookup.ambiguous.emails.has('shared@example.com'), true);
    assert.equal(lookup.ambiguous.clientoIds.has('shared-cliento'), true);
  });

  it('excludes a uniquely matched booking from the unlinked review report', () => {
    const report = buildUnlinkedClientoBookingReview({
      patients: [{ id: 'p-unique', primaryEmail: 'unique@example.com' }],
      clientoBookings: [
        {
          bookingId: 'booking-unique',
          customerEmail: 'unique@example.com',
          startsAt: '2024-07-01T09:00:00.000Z',
        },
      ],
    });
    assert.equal(report.zeroWrites, true);
    assert.equal(report.total, 0);
    assert.deepEqual(report.rows, []);
  });

  it('reports an identity collision with masked basis and no patient suggestion', () => {
    const report = buildUnlinkedClientoBookingReview({
      patients: [
        { id: 'p-a', primaryEmail: 'shared@example.com' },
        { id: 'p-b', primaryEmail: 'shared@example.com' },
      ],
      clientoBookings: [
        {
          bookingId: 'booking-collision',
          customerEmail: 'shared@example.com',
          startsAt: '2024-07-02T09:00:00.000Z',
        },
      ],
    });
    assert.equal(report.total, 1);
    assert.equal(report.rows[0].reasonCode, 'identity_collision');
    assert.equal(report.rows[0].identityBasis[0].masked, 's***@e***.com');
    assert.equal(report.rows[0].patientId, null);
    assert.equal(report.rows[0].linkAllowed, false);
    assert.doesNotMatch(JSON.stringify(report.rows[0]), /shared@example\.com|p-a|p-b/);
  });

  it('keeps a missing-identity review row explicitly unlinked', () => {
    const report = buildUnlinkedClientoBookingReview({
      patients: [{ id: 'p-any', primaryEmail: 'any@example.com' }],
      clientoBookings: [
        {
          bookingId: 'booking-unlinked',
          startsAt: '2024-07-03T09:00:00.000Z',
        },
      ],
    });
    assert.equal(report.total, 1);
    assert.equal(report.rows[0].bookingId, 'booking-unlinked');
    assert.equal(report.rows[0].date, '2024-07-03');
    assert.equal(report.rows[0].reasonCode, 'missing_identity');
    assert.deepEqual(report.rows[0].identityBasis, [{ type: 'none', masked: 'saknas' }]);
    assert.equal(report.rows[0].patientId, null);
    assert.equal(report.rows[0].encounterId, null);
    assert.equal(report.rows[0].readOnly, true);
    assert.equal(report.rows[0].linkAllowed, false);
  });

  it('reports canonical booking integrity without exposing raw patient or booking ids', () => {
    const report = buildCanonicalBookingIntegrityReport({
      patients: [{ id: 'patient-secret-123' }],
      byPatient: new Map([
        [
          'patient-secret-123',
          {
            upcomingBookings: [],
            historyBookings: [
              {
                id: 'booking-secret-456',
                patientId: 'patient-secret-123',
                startsAt: 'not-a-date',
                status: 'secret-status@example.com',
                source: 'secret-source@example.com',
                encounterId: 'encounter-secret-789',
                bookingNotes: 'bevarad',
                internalNotes: 'bevarad',
              },
            ],
          },
        ],
      ]),
      encounters: [{ encounterId: 'encounter-secret-789', patientId: 'patient-other' }],
    });

    assert.equal(report.zeroWrites, true);
    assert.equal(report.readOnly, true);
    assert.equal(report.ok, false);
    assert.equal(report.totalVisits, 1);
    assert.equal(report.byIssue.invalid_starts_at, 1);
    assert.equal(report.byIssue.invalid_status, 1);
    assert.equal(report.byIssue.encounter_patient_mismatch, 1);
    assert.equal(report.noteCoverage.bookingNotes, 1);
    assert.equal(report.noteCoverage.internalNotes, 1);
    assert.doesNotMatch(
      JSON.stringify(report),
      /patient-secret-123|booking-secret-456|encounter-secret-789|patient-other|secret-status|secret-source/
    );
  });
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
            durationMinutes: 45,
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
    assert.equal(sig.upcomingBookings[0].durationLabel, '45 min');
    assert.equal(sig.upcomingBookings[0].practitioner, 'Fazli');
  });

  it('keeps the canonical service catalog displayName on patient booking rows', () => {
    const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const { index } = buildBookingSignalsIndex({
      patients: [
        {
          id: 'patient-physical-consultation',
          primaryEmail: 'physical@example.com',
          emails: [],
          flags: [],
          fileSummary: {},
        },
      ],
      services: [
        {
          id: 'consultation-physical',
          label: 'Fysisk konsultation',
        },
      ],
      engineBookings: [
        {
          bookingId: 'booking-physical-consultation',
          tenantId: 't1',
          patientId: 'patient-physical-consultation',
          customerEmail: 'physical@example.com',
          status: 'confirmed',
          slot: {
            startsAt,
            serviceId: 'consultation-physical',
            serviceLabel: 'Konsultation',
            resourceLabel: 'Fazli Krasniqi',
          },
        },
      ],
    });

    const booking = getBookingSignals(index, 'patient-physical-consultation').upcomingBookings[0];
    assert.equal(booking.bookingId, 'booking-physical-consultation');
    assert.equal(booking.serviceId, 'consultation-physical');
    assert.equal(booking.serviceDisplayName, 'Fysisk konsultation');
    assert.equal(booking.title, 'Fysisk konsultation');
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

  it('keeps cancelled and no-show visits in canonical history with notes and encounter link', () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const patients = [
      {
        id: 'p-history',
        primaryEmail: 'history@example.com',
        emails: [],
        flags: [],
        fileSummary: {},
      },
    ];
    const { index } = buildBookingSignalsIndex({
      patients,
      engineBookings: [],
      bookingCases: [],
      encounters: [
        {
          patientId: 'p-history',
          encounterId: 'enc-history',
          bookingId: 'cancelled-history',
          startsAt: past,
        },
      ],
      clientoBookings: [
        {
          bookingId: 'cancelled-history',
          customerEmail: 'history@example.com',
          startsAt: past,
          status: 'cancelled',
          serviceLabel: 'PRP',
          bookingNotes: 'Avbokad per telefon',
          internalNotes: 'Behöver ny tid',
          treatmentNotes: 'Ingen behandling utförd',
        },
      ],
    });
    const [visit] = getBookingSignals(index, 'p-history').historyBookings;
    assert.equal(visit.patientId, 'p-history');
    assert.equal(visit.encounterId, 'enc-history');
    assert.equal(visit.status, 'cancelled');
    assert.equal(visit.bookingNotes, 'Avbokad per telefon');
    assert.equal(visit.internalNotes, 'Behöver ny tid');
    assert.equal(visit.treatmentNotes, 'Ingen behandling utförd');
  });

  it('folds an approved historical sidecar link into one read-only history booking with both source records', () => {
    const left = {
      tenantId: 'hair_tp',
      bookingId: 'dup-1',
      customerEmail: 'shadow@example.com',
      startsAt: '2026-01-10T09:00:00.000Z',
      endsAt: '2026-01-10T09:30:00.000Z',
      status: 'completed',
      serviceLabel: 'Fysisk konsultation',
      staffName: 'Fazli',
      internalNotes: 'Intern not från hair_tp',
    };
    const right = {
      ...left,
      tenantId: 'hair-tp-clinic',
      treatmentNotes: 'Behandlingsnot från hair-tp-clinic',
    };
    const byPatient = collectBookingReadouts({
      patients: [{ id: 'p-shadow', primaryEmail: 'shadow@example.com' }],
      clientoBookings: [left, right],
      historicalShadowClientoBookings: [left, right],
      historicalShadowLedgerEvents: [approvedHistoricalLink(left, right)],
    });

    const history = byPatient.get('p-shadow').historyBookings;
    assert.equal(history.length, 1);
    assert.equal(history[0].source, 'cliento_historical_shadow');
    assert.equal(history[0].shadowReadmodel, true);
    assert.equal(history[0].readOnly, true);
    assert.equal(history[0].linkAllowed, false);
    assert.equal(history[0].encounterId, null);
    assert.equal(history[0].historicalReason, 'historical_booking_without_encounter');
    assert.equal(history[0].title, 'Fysisk konsultation');
    assert.equal(history[0].resourceLabel, 'Fazli');
    assert.equal(history[0].sourceRecords.length, 2);
    assert.equal(history[0].sourceRecords[0].noteSegments.internalNotes, 'Intern not från hair_tp');
    assert.equal(
      history[0].sourceRecords[1].noteSegments.treatmentNotes,
      'Behandlingsnot från hair-tp-clinic'
    );

    const { index } = buildBookingSignalsIndex({
      patients: [{ id: 'p-shadow', primaryEmail: 'shadow@example.com' }],
      clientoBookings: [left, right],
      historicalShadowClientoBookings: [left, right],
      historicalShadowLedgerEvents: [approvedHistoricalLink(left, right)],
    });
    const signals = getBookingSignals(index, 'p-shadow');
    assert.equal(signals.completedVisitCount, 1);
    assert.equal(signals.lastVisitAt, '2026-01-10T09:00:00.000Z');
  });

  it('does not shadow-merge revoked historical links', () => {
    const left = {
      tenantId: 'hair_tp',
      bookingId: 'revoked-1',
      customerEmail: 'revoked@example.com',
      startsAt: '2026-01-10T09:00:00.000Z',
      status: 'completed',
      serviceLabel: 'Konsultation',
    };
    const right = { ...left, tenantId: 'hair-tp-clinic' };
    const byPatient = collectBookingReadouts({
      patients: [{ id: 'p-shadow', primaryEmail: 'revoked@example.com' }],
      clientoBookings: [left, right],
      historicalShadowClientoBookings: [left, right],
      historicalShadowLedgerEvents: [
        approvedHistoricalLink(left, right, { state: 'revoked', reasonCode: 'manual_revoke' }),
      ],
    });
    const history = byPatient.get('p-shadow').historyBookings;
    assert.equal(history.length, 1);
    assert.equal(history[0].source, 'cliento');
    assert.equal(history[0].shadowReadmodel, undefined);
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
