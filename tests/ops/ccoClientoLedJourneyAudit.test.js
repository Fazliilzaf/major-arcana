'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  auditPatientJourney,
  buildClientoLedJourneyAudit,
  classifyService,
} = require('../../src/ops/ccoClientoLedJourneyAudit');

function asset(overrides = {}) {
  return {
    id: `asset-${Math.random()}`,
    patientId: 'p1',
    status: 'VISIBLE_ON_PATIENT_CARD',
    ...overrides,
  };
}

describe('ccoClientoLedJourneyAudit', () => {
  it('classifies consultation, PRP and hair-transplant services', () => {
    assert.equal(classifyService('Online konsultation'), 'consultation');
    assert.equal(classifyService('PRP hår 2/3'), 'prp');
    assert.equal(classifyService('FUE 1500 grafts'), 'hair_transplant');
  });

  it('does not fabricate missing documents for a no-show-only consultation', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'b1',
          startsAt: '2026-05-21T17:15:00.000Z',
          serviceLabel: 'Online konsultation',
          status: 'no_show',
          notes: 'Dök inte upp',
        },
      ],
    });
    assert.equal(row.stage, 'no_show_only');
    assert.equal(row.noShowCount, 1);
    assert.deepEqual(row.gaps, []);
    assert.equal(row.notes[0].note, 'Dök inte upp');
  });

  it('prefers authoritative CSV status over Microsoft booking-notification inference', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'mail-1',
          startsAt: '2026-05-21T17:15:00.000Z',
          serviceLabel: 'Online konsultation',
          status: 'completed',
          source: 'cliento_web_mail',
        },
        {
          bookingId: 'csv-1',
          startsAt: '2026-05-21T17:15:00.000Z',
          serviceLabel: 'Online konsultation',
          status: 'no_show',
          source: 'cliento_csv',
        },
      ],
    });
    assert.equal(row.bookingCount, 1);
    assert.equal(row.stage, 'no_show_only');
    assert.deepEqual(row.gaps, []);
  });

  it('does not treat a Microsoft booking notification alone as proof of attendance', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'mail-only',
          startsAt: '2026-05-21T17:15:00.000Z',
          serviceLabel: 'Online konsultation',
          status: 'completed',
          source: 'cliento_web_mail',
        },
      ],
    });
    assert.equal(row.stage, 'booking_history_only');
    assert.equal(row.attendanceUnverifiedCount, 1);
    assert.deepEqual(row.gaps, []);
  });

  it('expects HD, offer and agreement for an upcoming hair-transplant booking, but defers FF to treatment day', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'future-fue',
          startsAt: '2099-06-10T08:00:00.000Z',
          serviceLabel: 'FUE hårtransplantation',
          status: 'upcoming',
          source: 'cliento_csv',
        },
      ],
    });
    assert.deepEqual(row.gaps, ['healthDeclaration', 'offer', 'agreement']);
    assert.equal(row.requirements.fitnessCertificate.status, 'not_expected');
  });

  it('expects HD after a scheduled consultation', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'future-consultation',
          startsAt: '2099-06-10T08:00:00.000Z',
          serviceLabel: 'Online konsultation',
          status: 'upcoming',
          source: 'cliento_csv',
        },
      ],
    });
    assert.deepEqual(row.gaps, ['healthDeclaration']);
  });

  it('requires FF only once PRP treatment has been attended', () => {
    const upcoming = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'future-prp',
          startsAt: '2099-06-10T08:00:00.000Z',
          serviceLabel: 'PRP hår',
          status: 'upcoming',
        },
      ],
    });
    assert.deepEqual(upcoming.gaps, ['healthDeclaration', 'offer']);

    const attended = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'attended-prp',
          startsAt: '2026-05-22T10:00:00.000Z',
          serviceLabel: 'PRP hår',
          status: 'completed',
        },
      ],
    });
    assert.deepEqual(attended.gaps, ['healthDeclaration', 'fitnessCertificate', 'offer']);
  });

  it('requires HD after an attended consultation but not treatment documents yet', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'b1',
          startsAt: '2026-05-21T17:15:00.000Z',
          serviceLabel: 'Konsultation',
          status: 'completed',
        },
      ],
    });
    assert.equal(row.stage, 'consultation_only');
    assert.deepEqual(row.gaps, ['healthDeclaration']);
    assert.equal(row.requirements.offer.status, 'not_expected');
    assert.equal(row.requirements.agreement.status, 'not_expected');
  });

  it('requires HD, FF and offer for attended PRP but not hair-transplant agreement', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'b-prp',
          startsAt: '2026-05-22T10:00:00.000Z',
          serviceLabel: 'PRP hår',
          status: 'completed',
        },
      ],
      assets: [
        asset({ sourceSystem: 'm365_halso', category: 'form', originalFileName: 'HD.pdf' }),
        asset({
          sourceSystem: 'm365_halso',
          category: 'other',
          originalFileName: 'Friskförsäkran.pdf',
        }),
        asset({
          sourceSystem: 'pipedrive_import',
          patientCardSection: 'offert',
          originalFileName: 'Offert PRP.pdf',
        }),
      ],
    });
    assert.equal(row.stage, 'prp');
    assert.deepEqual(row.gaps, []);
    assert.equal(row.requirements.agreement.status, 'not_expected');
  });

  it('does not create a new FF gap for a later PRP session once the patient has signed it', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'prp-1',
          startsAt: '2026-05-22T10:00:00.000Z',
          serviceLabel: 'PRP hår 1/3',
          status: 'completed',
        },
        {
          bookingId: 'prp-2',
          startsAt: '2026-06-22T10:00:00.000Z',
          serviceLabel: 'PRP hår 2/3',
          status: 'completed',
        },
      ],
      assets: [
        asset({ sourceSystem: 'm365_halso', category: 'form', originalFileName: 'HD.pdf' }),
        asset({
          sourceSystem: 'm365_halso',
          category: 'other',
          originalFileName: 'Friskförsäkran.pdf',
        }),
        asset({
          sourceSystem: 'pipedrive_import',
          patientCardSection: 'offert',
          originalFileName: 'Offert PRP.pdf',
        }),
      ],
    });
    assert.equal(row.requirements.fitnessCertificate.status, 'verified');
    assert.deepEqual(row.gaps, []);
  });

  it('flags missing agreement for attended hair transplant and does not accept a deal as a PDF', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1', pipedrive: { deals: [{ id: 'deal-1', value: 46000 }] } },
      bookings: [
        {
          bookingId: 'b-fue',
          startsAt: '2026-06-10T08:00:00.000Z',
          serviceLabel: 'FUE hårtransplantation',
          status: 'completed',
        },
      ],
      assets: [
        asset({ sourceSystem: 'm365_halso', category: 'form', originalFileName: 'HD.pdf' }),
        asset({
          sourceSystem: 'm365_halso',
          category: 'other',
          originalFileName: 'Friskförsäkran.pdf',
        }),
      ],
    });
    assert.equal(row.evidence.pipedriveDeal, true);
    assert.deepEqual(row.gaps, ['offer', 'agreement']);
  });

  it('audits every patient and matches Cliento history by phone when email differs', () => {
    const result = buildClientoLedJourneyAudit({
      patients: [
        {
          id: 'p1',
          displayName: 'Testkund Ett',
          primaryEmail: 'one@example.com',
          primaryPhone: '+46701234567',
        },
        { id: 'p2', primaryEmail: 'two@example.com' },
      ],
      clientoBookings: [
        {
          bookingId: 'phone-match',
          customerEmail: 'old@example.com',
          customerPhone: '070-123 45 67',
          startsAt: '2026-05-21T17:15:00.000Z',
          serviceLabel: 'Konsultation',
          status: 'completed',
        },
      ],
    });
    assert.equal(result.summary.patientsScanned, 2);
    assert.equal(result.summary.patientsWithClientoHistory, 1);
    assert.equal(result.summary.patientsWithoutClientoHistory, 1);
    assert.equal(result.rows.find((row) => row.patientId === 'p1').bookingCount, 1);
    assert.equal(result.rows.find((row) => row.patientId === 'p1').patientName, 'Testkund Ett');
    assert.equal(result.rows.find((row) => row.patientId === 'p2').stage, 'no_cliento_history');
  });
});
