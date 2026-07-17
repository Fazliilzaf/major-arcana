'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  composeConversionFunnel,
  offersFromCommercialCases,
} = require('../../src/ops/clinicConversionFunnel');

const NOW = new Date(Date.UTC(2026, 5, 15)); // 15 juni 2026

test('offersFromCommercialCases tar sent/accepted med quoteSentAt och patientKey', () => {
  const offers = offersFromCommercialCases(
    [
      {
        tenantId: 'hair-tp-clinic',
        customerId: 'p1',
        quoteStatus: 'sent',
        quoteSentAt: '2026-06-02T10:00:00Z',
      },
      {
        tenantId: 'hair-tp-clinic',
        customerId: 'p2',
        quoteStatus: 'draft',
        quoteSentAt: '2026-06-02T10:00:00Z',
      },
      {
        tenantId: 'other',
        customerId: 'p3',
        quoteStatus: 'sent',
        quoteSentAt: '2026-06-02T10:00:00Z',
      },
      {
        tenantId: 'hair-tp-clinic',
        customerId: '',
        quoteStatus: 'accepted',
        quoteSentAt: '2026-06-03T10:00:00Z',
      },
    ],
    { tenantId: 'hair-tp-clinic' }
  );
  assert.equal(offers.length, 2);
  assert.equal(offers[0].patientKey, 'p1');
  assert.equal(offers[1].patientKey, null);
});

test('tratt: konsultation → offert → behandling + stoppedAtOffer', () => {
  const bookings = [
    {
      patientId: 'p-show',
      startsAt: '2026-06-02T09:00:00Z',
      status: 'completed',
      bookingKind: 'consultation',
      serviceLabel: 'Konsultation',
    },
    {
      patientId: 'p-noshow',
      startsAt: '2026-06-03T09:00:00Z',
      status: 'no_show',
      bookingKind: 'consultation',
      serviceLabel: 'Konsultation',
    },
    {
      patientId: 'p-treat',
      startsAt: '2026-06-01T09:00:00Z',
      status: 'completed',
      bookingKind: 'consultation',
      serviceLabel: 'Konsultation',
    },
    {
      patientId: 'p-treat',
      startsAt: '2026-06-10T09:00:00Z',
      status: 'completed',
      bookingKind: 'paying',
      serviceLabel: 'FUE hårtransplantation',
    },
    {
      patientId: 'p-stop',
      startsAt: '2026-03-01T09:00:00Z',
      status: 'completed',
      bookingKind: 'consultation',
      serviceLabel: 'Konsultation',
    },
  ];
  const offers = [
    { patientKey: 'p-show', sentAt: '2026-06-05T10:00:00Z', status: 'sent' },
    { patientKey: 'p-treat', sentAt: '2026-06-05T10:00:00Z', status: 'sent' },
    { patientKey: 'p-stop', sentAt: '2026-03-10T10:00:00Z', status: 'sent' },
  ];
  const funnel = composeConversionFunnel({
    bookings,
    offers,
    resolvePatientKey: (b) => b.patientId || null,
    now: NOW,
    stoppedAtOfferDays: 60,
  });

  assert.equal(funnel.period.consultations.booked, 3);
  assert.equal(funnel.period.consultations.show, 2);
  assert.equal(funnel.period.consultations.noShow, 1);
  assert.equal(funnel.period.offersSent, 2);
  assert.equal(funnel.period.proceededToTreatment, 1);
  assert.equal(funnel.period.stoppedAtOffer, 0);
  assert.equal(funnel.period.rates.offerToTreatment, 0.5);
  assert.ok(funnel.period.rates.consultToOffer != null);

  // p-stop offert i rolling 90d (från ~17 mars) — 15 juni - 90d ≈ 17 mars; 10 mars är utanför.
  // Använd äldre stopped: rolling ska fånga offerten om den ligger i fönstret.
  assert.ok(funnel.rolling90d);
  assert.equal(typeof funnel.rolling90d.offersSent, 'number');
});

test('stoppedAtOffer räknas när offert är äldre än tröskel utan behandling', () => {
  const bookings = [
    {
      patientId: 'p1',
      startsAt: '2026-01-10T09:00:00Z',
      status: 'completed',
      bookingKind: 'consultation',
      serviceLabel: 'Konsultation',
    },
  ];
  const offers = [{ patientKey: 'p1', sentAt: '2026-01-15T10:00:00Z', status: 'sent' }];
  const wide = composeConversionFunnel({
    bookings,
    offers,
    resolvePatientKey: (b) => b.patientId,
    now: NOW,
    stoppedAtOfferDays: 60,
    rollingDays: 200,
  });
  assert.equal(wide.period.offersSent, 0);
  assert.equal(wide.rolling90d.offersSent, 1);
  assert.equal(wide.rolling90d.stoppedAtOffer, 1);
  assert.equal(wide.rolling90d.proceededToTreatment, 0);
  assert.match(wide.dataNote || '', /stannat vid offert/i);
});

test('okänd patientkoppling räknas i coverage men inte i offersSent', () => {
  const funnel = composeConversionFunnel({
    bookings: [
      {
        startsAt: '2026-06-02T09:00:00Z',
        status: 'completed',
        bookingKind: 'consultation',
        serviceLabel: 'Konsultation',
      },
    ],
    offers: [{ patientKey: null, sentAt: '2026-06-03T10:00:00Z', status: 'sent' }],
    resolvePatientKey: () => null,
    now: NOW,
  });
  assert.equal(funnel.period.offersSent, 0);
  assert.equal(funnel.period.coverage.offersTotal, 1);
  assert.equal(funnel.period.coverage.offersMatched, 0);
  assert.equal(funnel.period.coverage.bookingsMatched, 0);
  assert.equal(funnel.period.coverage.bookingsTotal, 1);
  assert.match(funnel.dataNote || '', /utan patientkoppling/i);
});

test('payload innehåller ingen PII — bara aggregatnycklar', () => {
  const funnel = composeConversionFunnel({
    bookings: [
      {
        patientId: 'secret-patient',
        customerEmail: 'hemlig@exempel.se',
        startsAt: '2026-06-02T09:00:00Z',
        status: 'completed',
        bookingKind: 'consultation',
        serviceLabel: 'Konsultation',
      },
    ],
    offers: [{ patientKey: 'secret-patient', sentAt: '2026-06-03T10:00:00Z', status: 'sent' }],
    resolvePatientKey: (b) => b.patientId,
    now: NOW,
  });
  const json = JSON.stringify(funnel);
  assert.equal(json.includes('hemlig@exempel.se'), false);
  assert.equal(json.includes('secret-patient'), false);
  assert.ok(funnel.period.consultations);
  assert.ok(funnel.period.rates);
});

test('betald konsultation via tjänstenamn räknas trots bookingKind=paying', () => {
  const funnel = composeConversionFunnel({
    bookings: [
      {
        patientId: 'p1',
        startsAt: '2026-06-02T09:00:00Z',
        status: 'completed',
        bookingKind: 'paying',
        serviceLabel: 'Konsultation online',
      },
    ],
    offers: [],
    resolvePatientKey: (b) => b.patientId,
    now: NOW,
  });
  assert.equal(funnel.period.consultations.booked, 1);
  assert.equal(funnel.period.consultations.show, 1);
});

test('ORD-77 komplettering: konsult→behandling via bokningshistorik utan offert', () => {
  const funnel = composeConversionFunnel({
    bookings: [
      {
        clientoCustomerId: 'cliento-42',
        startsAt: '2026-06-02T09:00:00Z',
        status: 'completed',
        bookingKind: 'consultation',
        serviceLabel: 'Fysisk konsultation',
      },
      {
        clientoCustomerId: 'cliento-42',
        startsAt: '2026-06-12T09:00:00Z',
        status: 'completed',
        bookingKind: 'paying',
        serviceLabel: 'FUE hårtransplantation',
      },
      {
        customerEmail: 'paket@exempel.se',
        startsAt: '2026-06-03T09:00:00Z',
        status: 'completed',
        bookingKind: 'consultation',
        serviceLabel: 'Online konsultation',
      },
      {
        customerEmail: 'paket@exempel.se',
        startsAt: '2026-06-14T09:00:00Z',
        status: 'confirmed',
        bookingKind: 'included_in_package',
        serviceLabel: 'PRP efter TP',
      },
    ],
    offers: [],
    resolvePatientKey: () => null,
    now: NOW,
  });
  assert.equal(funnel.period.offersSent, 0);
  assert.equal(funnel.period.proceededToTreatment, 0);
  assert.equal(funnel.period.coverage.via_offer, 0);
  assert.equal(funnel.period.coverage.via_booking_history, 2);
  assert.equal(funnel.period.rates.consultToTreatment, 1);
  assert.match(funnel.dataNote || '', /via bokningshistorik/i);
  const json = JSON.stringify(funnel);
  assert.equal(json.includes('cliento-42'), false);
  assert.equal(json.includes('paket@exempel.se'), false);
});

test('ORD-77 komplettering: via_offer prioriteras framför via_booking_history', () => {
  const funnel = composeConversionFunnel({
    bookings: [
      {
        patientId: 'p1',
        startsAt: '2026-06-01T09:00:00Z',
        status: 'completed',
        bookingKind: 'consultation',
        serviceLabel: 'Konsultation',
      },
      {
        patientId: 'p1',
        startsAt: '2026-06-10T09:00:00Z',
        status: 'completed',
        bookingKind: 'paying',
        serviceLabel: 'FUE',
      },
      {
        patientId: 'p2',
        startsAt: '2026-06-02T09:00:00Z',
        status: 'completed',
        bookingKind: 'consultation',
        serviceLabel: 'Konsultation',
      },
      {
        patientId: 'p2',
        startsAt: '2026-06-11T09:00:00Z',
        status: 'completed',
        bookingKind: 'paying',
        serviceLabel: 'FUE',
      },
    ],
    offers: [{ patientKey: 'p1', sentAt: '2026-06-05T10:00:00Z', status: 'sent' }],
    resolvePatientKey: (b) => b.patientId,
    now: NOW,
  });
  assert.equal(funnel.period.coverage.via_offer, 1);
  assert.equal(funnel.period.coverage.via_booking_history, 1);
  assert.equal(funnel.period.rates.consultToTreatment, 1);
  assert.equal(funnel.period.proceededToTreatment, 1);
  assert.equal(funnel.period.rates.offerToTreatment, 1);
});
