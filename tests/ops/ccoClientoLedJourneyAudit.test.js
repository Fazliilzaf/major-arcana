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

  it('does not fabricate missing documents for an American-spelled cancelled booking', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'b-canceled',
          startsAt: '2026-05-21T17:15:00.000Z',
          serviceLabel: 'PRP hår',
          status: 'canceled',
          source: 'cliento_csv',
        },
      ],
    });

    assert.equal(row.stage, 'cancelled_only');
    assert.equal(row.cancelledCount, 1);
    assert.deepEqual(row.gaps, []);
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

  it('does not require FF for attended PRP (Notion: FF only before HT)', () => {
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
    assert.equal(upcoming.requirements.fitnessCertificate.status, 'not_expected');

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
    assert.deepEqual(attended.gaps, ['healthDeclaration', 'offer']);
    assert.equal(attended.requirements.fitnessCertificate.status, 'not_expected');
    assert.equal(
      attended.requirements.fitnessCertificate.reason,
      'prp_or_non_ht_treatment_ff_not_required'
    );
  });

  it('requires HD and offer after an attended consultation', () => {
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
    assert.deepEqual(row.gaps, ['healthDeclaration', 'offer']);
    assert.equal(row.requirements.offer.status, 'missing');
    assert.equal(row.requirements.offer.reason, 'attended_cliento_consultation');
    assert.equal(row.requirements.agreement.status, 'not_expected');
  });

  it('does not require an offer from a consultation notification without attendance proof', () => {
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
    assert.equal(row.requirements.offer.status, 'not_expected');
  });

  it('requires HD and offer for attended PRP but not FF or hair-transplant agreement', () => {
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
    assert.equal(row.requirements.fitnessCertificate.status, 'not_expected');
    assert.equal(row.requirements.agreement.status, 'not_expected');
  });

  it('keeps FF not_expected across multiple PRP sessions even without an FF asset', () => {
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
          sourceSystem: 'pipedrive_import',
          patientCardSection: 'offert',
          originalFileName: 'Offert PRP.pdf',
        }),
      ],
    });
    assert.equal(row.requirements.fitnessCertificate.status, 'not_expected');
    assert.deepEqual(row.gaps, []);
  });

  it('requires FF after attended hair transplant (Notion steg 8)', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'b-fue',
          startsAt: '2026-06-10T08:00:00.000Z',
          serviceLabel: 'FUE hårtransplantation',
          status: 'completed',
        },
      ],
    });
    assert.equal(row.requirements.fitnessCertificate.status, 'missing');
    assert.equal(
      row.requirements.fitnessCertificate.reason,
      'attended_hair_transplant_operation_day'
    );
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

  it('accepts VISIBLE GetAccept agreements as agreement evidence for a hair-transplant journey', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
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
        asset({
          sourceSystem: 'pipedrive_import',
          patientCardSection: 'offert',
          originalFileName: 'Offert FUE.pdf',
        }),
        asset({
          sourceSystem: 'getaccept_import',
          category: 'agreement',
          patientCardSection: 'samtycken_avtal',
          treatmentType: 'FUE',
          displayName: '2025-07-31 · Avtal · FUE · signerad · GetAccept legacy',
          originalFileName: 'getaccept-x66z9hzxzv3d-2025-07-31.pdf',
        }),
      ],
    });
    assert.equal(row.requirements.agreement.status, 'verified');
    assert.equal(row.evidence.agreement, true);
    assert.deepEqual(row.gaps, []);
  });

  it('accepts VERIFIED_IN_CCO GetAccept agreements but ignores NEEDS_REVIEW stubs', () => {
    const verified = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'b-fue',
          startsAt: '2026-06-10T08:00:00.000Z',
          serviceLabel: 'FUE hårtransplantation',
          status: 'completed',
        },
      ],
      assets: [
        asset({
          sourceSystem: 'getaccept_import',
          category: 'agreement',
          status: 'VERIFIED_IN_CCO',
          treatmentType: 'DHI',
          displayName: 'Avtal · DHI · signerad · GetAccept legacy',
          originalFileName: 'getaccept-verified.pdf',
        }),
      ],
    });
    assert.equal(verified.requirements.agreement.status, 'verified');

    const needsReview = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'b-fue',
          startsAt: '2026-06-10T08:00:00.000Z',
          serviceLabel: 'FUE hårtransplantation',
          status: 'completed',
        },
      ],
      assets: [
        asset({
          sourceSystem: 'getaccept_import',
          category: 'agreement',
          status: 'NEEDS_REVIEW',
          treatmentType: 'FUE',
          originalFileName: 'getaccept-stub.pdf',
        }),
      ],
    });
    assert.equal(needsReview.requirements.agreement.status, 'missing');
    assert.ok(needsReview.gaps.includes('agreement'));
  });

  it('keeps the hair-transplant agreement gap when GetAccept is for another treatment journey', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'b-fue',
          startsAt: '2026-06-10T08:00:00.000Z',
          serviceLabel: 'FUE hårtransplantation',
          status: 'completed',
        },
      ],
      assets: [
        asset({
          sourceSystem: 'getaccept_import',
          category: 'agreement',
          patientCardSection: 'samtycken_avtal',
          treatmentType: 'PRP',
          displayName: '2025-07-31 · Avtal · PRP · signerad · GetAccept legacy',
          originalFileName: 'getaccept-prp-other-journey.pdf',
        }),
        asset({
          sourceSystem: 'getaccept_import',
          category: 'agreement',
          patientCardSection: 'samtycken_avtal',
          treatmentType: 'Ögonlock',
          displayName: '2025-08-01 · Avtal · Curatiio ögonlock · signerad',
          originalFileName: 'getaccept-curatiio-other-journey.pdf',
        }),
      ],
    });
    assert.equal(row.evidence.agreement, false);
    assert.equal(row.requirements.agreement.status, 'missing');
    assert.ok(row.gaps.includes('agreement'));
  });

  it('fails closed when GetAccept agreement has no classifiable treatment journey', () => {
    const row = auditPatientJourney({
      patient: { id: 'p1' },
      bookings: [
        {
          bookingId: 'b-fue',
          startsAt: '2026-06-10T08:00:00.000Z',
          serviceLabel: 'FUE hårtransplantation',
          status: 'completed',
        },
      ],
      assets: [
        asset({
          sourceSystem: 'getaccept_import',
          category: 'agreement',
          displayName: '2023-11-22 · Avtal · Behandling · signerad · GetAccept legacy',
          treatmentType: 'Behandling',
          originalFileName: 'getaccept-92259u6qyzy5-2023-11-22.pdf',
        }),
      ],
    });
    assert.equal(row.evidence.agreement, false);
    assert.ok(row.gaps.includes('agreement'));
  });

  it('scopes GetAccept agreement evidence to the canonical patient only', () => {
    const result = buildClientoLedJourneyAudit({
      patients: [
        {
          id: 'p-ht',
          displayName: 'HT Patient',
          primaryEmail: 'ht@example.com',
        },
        {
          id: 'p-other',
          displayName: 'Other Patient',
          primaryEmail: 'other@example.com',
        },
      ],
      clientoBookings: [
        {
          bookingId: 'fue-1',
          customerEmail: 'ht@example.com',
          startsAt: '2026-06-10T08:00:00.000Z',
          serviceLabel: 'FUE hårtransplantation',
          status: 'completed',
          source: 'cliento_csv',
        },
      ],
      assets: [
        asset({
          patientId: 'p-other',
          sourceSystem: 'getaccept_import',
          category: 'agreement',
          treatmentType: 'FUE',
          displayName: 'Avtal · FUE · signerad · GetAccept legacy',
          originalFileName: 'getaccept-wrong-patient.pdf',
        }),
      ],
    });
    const htRow = result.rows.find((row) => row.patientId === 'p-ht');
    const otherRow = result.rows.find((row) => row.patientId === 'p-other');
    assert.equal(htRow.bookingCount, 1);
    assert.equal(htRow.evidence.agreement, false);
    assert.ok(htRow.gaps.includes('agreement'));
    assert.equal(otherRow.evidence.agreement, true);
    assert.equal(otherRow.requirements.agreement.status, 'not_expected');
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
