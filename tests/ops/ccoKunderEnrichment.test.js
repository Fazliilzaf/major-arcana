'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAssetSignalsIndex,
  buildKunderReadout,
  computeSegmentStats,
  isHealthDeclarationAsset,
  matchSegment,
  getPatientOwnerName,
  buildOwnerFieldInventory,
  ownerMatchesAssigned,
  computeOwnerCoverage,
  maskEmail,
  maskPhone,
  enrichPatientCardPreTreatmentForms,
} = require('../../src/ops/ccoKunderEnrichment');
const { emptyBookingSignals } = require('../../src/ops/ccoKunderBookingEnrichment');

describe('ccoKunderEnrichment', () => {
  it('masks contact fields', () => {
    assert.equal(maskEmail('anna@example.com'), 'an***@example.com');
    assert.equal(maskPhone('0701234567'), '***4567');
  });

  it('builds asset signals per patient', () => {
    const index = buildAssetSignalsIndex([
      {
        patientId: 'p1',
        category: 'form',
        status: 'VISIBLE_ON_PATIENT_CARD',
        sourceSystem: 'm365_halso',
      },
      {
        patientId: 'p1',
        category: 'photo_before',
        status: 'NEEDS_REVIEW',
        photoReviewRequired: true,
      },
    ]);
    const sig = index.get('p1');
    assert.equal(sig.hasForm, true);
    assert.equal(sig.hasHalso, true);
    assert.equal(sig.needsPhotoReview, true);
  });

  it('ORD-29 Phase 1 counts m365_halso form/other as health declaration', () => {
    const index = buildAssetSignalsIndex([
      {
        id: 'asset-hd-1',
        patientId: 'p-halso',
        category: 'other',
        status: 'VISIBLE_ON_PATIENT_CARD',
        sourceSystem: 'm365_halso',
        originalFileName: 'halsodeklaration-2024.html',
        importedAt: '2026-01-15T10:00:00.000Z',
      },
    ]);
    const sig = index.get('p-halso');
    assert.equal(sig.healthDeclarationViewUrl, '/api/v1/cco/assets/asset-hd-1/download?inline=1');
    const readout = buildKunderReadout(
      {
        id: 'p-halso',
        displayName: 'Halso Import',
        matchStatus: 'matched',
        flags: [],
        fileSummary: {},
      },
      index
    );
    assert.equal(readout.hasHalso, true);
    assert.equal(readout.hasForm, true);
    assert.equal(readout.missingHealthDeclaration, false);
  });

  it('ORD-29 Phase 1 does not clear missingHealthDeclaration for m365_halso journal assets', () => {
    const index = buildAssetSignalsIndex([
      {
        patientId: 'p-journal-only',
        category: 'journal',
        status: 'VISIBLE_ON_PATIENT_CARD',
        sourceSystem: 'm365_halso',
      },
    ]);
    const readout = buildKunderReadout(
      {
        id: 'p-journal-only',
        displayName: 'Journal Only',
        matchStatus: 'matched',
        flags: [],
        fileSummary: {},
      },
      index
    );
    assert.equal(readout.hasHalso, true);
    assert.equal(readout.hasForm, false);
    assert.equal(readout.missingHealthDeclaration, true);
  });

  it('isHealthDeclarationAsset rejects injektions-journal filenames', () => {
    assert.equal(
      isHealthDeclarationAsset({
        category: 'other',
        sourceSystem: 'm365_halso',
        originalFileName: '[Injektions-journal/Webb] patient.html',
      }),
      false
    );
  });

  it('enrichPatientCardPreTreatmentForms attaches viewUrl from asset index', () => {
    const index = buildAssetSignalsIndex([
      {
        id: 'fc-asset-1',
        patientId: 'p1',
        category: 'other',
        sourceSystem: 'm365_halso',
        originalFileName: 'friskforsakran-2024.pdf',
        importedAt: '2026-02-01T10:00:00.000Z',
      },
    ]);
    const card = enrichPatientCardPreTreatmentForms(
      { patientId: 'p1' },
      {
        id: 'p1',
        fitnessCertificate: { signedAt: '2026-02-01T09:00:00.000Z', source: 'halso_mailbox' },
      },
      index
    );
    assert.equal(
      card.fitnessCertificate.viewUrl,
      '/api/v1/cco/assets/fc-asset-1/download?inline=1'
    );
    assert.equal(card.fitnessCertificate.documentTitle, 'Friskförsäkran');
  });

  it('matches VIP from pipedrive deals', () => {
    const patient = {
      id: 'vip1',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      pipedrive: { deals: [{ status: 'won', value: '30 000' }] },
      updatedAt: new Date().toISOString(),
    };
    assert.equal(matchSegment(patient, 'vip', null), true);
  });

  it('ORD-22 fas 5 matches VIP from Swedish Pipedrive export status', () => {
    const patient = {
      id: 'vip-sv',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      pipedrive: { deals: [{ status: 'Vunnen', value: '35 000 kr' }] },
      updatedAt: new Date().toISOString(),
    };
    assert.equal(matchSegment(patient, 'vip', null), true);
  });

  it('buildKunderReadout sums pipedrive won deals as lifetimeValue', () => {
    const readout = buildKunderReadout(
      {
        id: 'p-ltv',
        displayName: 'LTV Patient',
        matchStatus: 'matched',
        flags: [],
        fileSummary: {},
        pipedrive: {
          deals: [
            { status: 'won', value: '12 500' },
            { status: 'open', value: '8 000' },
            { status: 'won', value: '7 500' },
          ],
        },
        updatedAt: new Date().toISOString(),
      },
      null
    );
    assert.equal(readout.lifetimeValue, 20000);
    assert.equal(readout.dealValue, 20000);
    assert.equal(readout.lifetimeValueLabel, '2 vunna affärer');
  });

  it('buildKunderReadout exposes enrichment fields', () => {
    const index = buildAssetSignalsIndex([
      { patientId: 'p2', category: 'journal', status: 'IMPORTED_TO_CCO' },
    ]);
    const readout = buildKunderReadout(
      {
        id: 'p2',
        displayName: 'Test Patient',
        primaryEmail: 't@example.com',
        matchStatus: 'matched',
        flags: [],
        fileSummary: { journalPdfs: 1, totalFiles: 2, images: 0 },
        updatedAt: new Date().toISOString(),
      },
      index
    );
    assert.equal(readout.patientId, 'p2');
    assert.equal(readout.hasJournal, true);
    assert.equal(readout.emailMasked, 't***@example.com');
    assert.ok(readout.nextStep);
  });

  it('computeSegmentStats returns counts', () => {
    const patients = [
      {
        id: 'a',
        matchStatus: 'needs_review',
        flags: ['needs_review'],
        fileSummary: {},
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'b',
        matchStatus: 'matched',
        flags: [],
        fileSummary: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const stats = computeSegmentStats(patients, new Map());
    assert.ok(stats.counts.needs_review >= 1);
    assert.ok(stats.counts.new >= 1);
    assert.equal(stats.panel.totalPatients, 2);
  });

  it('ORD-22 active segment uses booking signals when coverage is real', () => {
    const recentBooking = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const patient = {
      id: 'active-booking',
      matchStatus: 'matched',
      flags: [],
      fileSummary: { journalPdfs: 5 },
      updatedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const bookingIndex = new Map([
      ['active-booking', { ...emptyBookingSignals(), lastBookingAt: recentBooking }],
    ]);
    assert.equal(matchSegment(patient, 'active', null, bookingIndex, 'real'), true);
    assert.equal(matchSegment(patient, 'active', null, bookingIndex, 'real', {}), true);
    assert.equal(
      matchSegment(
        { ...patient, updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
        'active',
        null,
        null,
        'missing'
      ),
      true
    );
    assert.equal(matchSegment(patient, 'active', null, bookingIndex, 'real'), true);
    const staleBooking = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const staleIndex = new Map([
      ['active-booking', { ...emptyBookingSignals(), lastBookingAt: staleBooking }],
    ]);
    assert.equal(matchSegment(patient, 'active', null, staleIndex, 'real'), false);
  });

  it('ORD-22 active segment matches lastVisitAt within window', () => {
    const patient = {
      id: 'active-visit',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      updatedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const recentVisit = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString();
    const bookingIndex = new Map([
      ['active-visit', { ...emptyBookingSignals(), lastVisitAt: recentVisit }],
    ]);
    assert.equal(matchSegment(patient, 'active', null, bookingIndex, 'real'), true);
  });

  it('ORD-22 active segment matches upcoming booking', () => {
    const patient = {
      id: 'active-upcoming',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      updatedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const bookingIndex = new Map([
      [
        'active-upcoming',
        {
          ...emptyBookingSignals(),
          hasUpcomingBooking: true,
          nextBookingAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    ]);
    assert.equal(matchSegment(patient, 'active', null, bookingIndex, 'real'), true);
  });

  it('ORD-22 risk segment is separate from needs_review', () => {
    const reviewPatient = {
      id: 'review-only',
      matchStatus: 'needs_review',
      flags: ['needs_review'],
      fileSummary: {},
      updatedAt: new Date().toISOString(),
    };
    assert.equal(matchSegment(reviewPatient, 'needs_review', null), true);
    assert.equal(matchSegment(reviewPatient, 'risk', null, null, 'missing'), false);

    const noShowPatient = {
      id: 'risk-noshow',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      noShowCount: 2,
      updatedAt: new Date().toISOString(),
    };
    assert.equal(matchSegment(noShowPatient, 'risk', null, null, 'missing'), true);

    const bookingNoShowIndex = new Map([
      ['risk-booking-noshow', { ...emptyBookingSignals(), noShowCount: 2 }],
    ]);
    const bookingNoShowPatient = {
      id: 'risk-booking-noshow',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      updatedAt: new Date().toISOString(),
    };
    assert.equal(
      matchSegment(bookingNoShowPatient, 'risk', null, bookingNoShowIndex, 'real'),
      true
    );

    const assetIndex = buildAssetSignalsIndex([
      {
        patientId: 'risk-form',
        category: 'journal',
        status: 'NEEDS_REVIEW',
      },
    ]);
    const bookingIndex = new Map([
      [
        'risk-form',
        {
          ...emptyBookingSignals(),
          hasUpcomingBooking: true,
          nextBookingAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    ]);
    const missingFormPatient = {
      id: 'risk-form',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      updatedAt: new Date().toISOString(),
    };
    assert.equal(
      matchSegment(missingFormPatient, 'risk', assetIndex.get('risk-form'), bookingIndex, 'real'),
      true
    );

    const assetReviewPatient = {
      id: 'risk-asset',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      updatedAt: new Date().toISOString(),
    };
    const assetReviewIndex = buildAssetSignalsIndex([
      {
        patientId: 'risk-asset',
        category: 'photo_before',
        status: 'NEEDS_REVIEW',
      },
    ]);
    const assetBookingIndex = new Map([
      [
        'risk-asset',
        {
          ...emptyBookingSignals(),
          hasUpcomingBooking: true,
          nextBookingAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        },
      ],
    ]);
    assert.equal(
      matchSegment(
        assetReviewPatient,
        'risk',
        assetReviewIndex.get('risk-asset'),
        assetBookingIndex,
        'real'
      ),
      true
    );
  });

  it('ORD-22 new segment uses source createdAt with origin fallback', () => {
    const recent = {
      id: 'new-recent',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      cliento: {
        clientoCreatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    assert.equal(matchSegment(recent, 'new', null), true);

    const old = {
      id: 'new-old',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      cliento: {
        clientoCreatedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      },
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    assert.equal(matchSegment(old, 'new', null), false);

    const importOnlyCreatedAt = {
      id: 'new-import-ts',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    assert.equal(matchSegment(importOnlyCreatedAt, 'new', null), false);

    const webBooking = {
      id: 'new-web',
      matchStatus: 'web_booking',
      flags: [],
      fileSummary: {},
      updatedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
    assert.equal(matchSegment(webBooking, 'new', null), true);
  });

  it('ORD-22 dormant segment uses booking history and updatedDays fallback', () => {
    const staleBooking = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const patient = {
      id: 'dormant-booking',
      matchStatus: 'matched',
      flags: [],
      fileSummary: { journalPdfs: 3 },
      updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const bookingIndex = new Map([
      ['dormant-booking', { ...emptyBookingSignals(), lastBookingAt: staleBooking }],
    ]);
    assert.equal(matchSegment(patient, 'dormant', null, bookingIndex, 'real'), true);

    const recentBooking = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const activeIndex = new Map([
      ['dormant-booking', { ...emptyBookingSignals(), lastBookingAt: recentBooking }],
    ]);
    assert.equal(matchSegment(patient, 'dormant', null, activeIndex, 'real'), false);

    const neverBooked = {
      id: 'dormant-never',
      matchStatus: 'matched',
      flags: [],
      fileSummary: { journalPdfs: 1 },
      updatedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const neverBookedIndex = new Map([['dormant-never', { ...emptyBookingSignals() }]]);
    assert.equal(matchSegment(neverBooked, 'dormant', null, neverBookedIndex, 'real'), true);

    const neverEngaged = {
      id: 'dormant-lead',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      cliento: {
        clientoCreatedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
      },
      updatedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const leadIndex = new Map([['dormant-lead', { ...emptyBookingSignals() }]]);
    assert.equal(matchSegment(neverEngaged, 'dormant', null, leadIndex, 'real'), false);

    const fallbackPatient = {
      id: 'dormant-fallback',
      matchStatus: 'matched',
      flags: [],
      fileSummary: { journalPdfs: 2 },
      updatedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    };
    assert.equal(matchSegment(fallbackPatient, 'dormant', null, null, 'missing'), true);
  });

  it('ORD-22 dormant segment excludes never-engaged imports without activity', () => {
    const neverBooked = {
      id: 'dormant-cliento-old',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      cliento: {
        clientoCreatedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
      },
      updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const bookingIndex = new Map([['dormant-cliento-old', { ...emptyBookingSignals() }]]);
    assert.equal(matchSegment(neverBooked, 'dormant', null, bookingIndex, 'real'), false);
  });

  it('ORD-22 dormant segment marks engaged stale patients inactive', () => {
    const staleVisit = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const engagedStale = {
      id: 'dormant-engaged',
      matchStatus: 'matched',
      flags: [],
      fileSummary: { journalPdfs: 2 },
      updatedAt: staleVisit,
    };
    const bookingIndex = new Map([
      [
        'dormant-engaged',
        {
          ...emptyBookingSignals(),
          lastVisitAt: staleVisit,
          lastActivityAt: staleVisit,
          completedVisitCount: 1,
        },
      ],
    ]);
    assert.equal(matchSegment(engagedStale, 'dormant', null, bookingIndex, 'real'), true);
  });

  it('mine segment uses pipedrive owner when assignedOwner set', () => {
    const patient = {
      id: 'mine1',
      matchStatus: 'matched',
      flags: [],
      fileSummary: {},
      pipedrive: { owner: 'Egzona Krasniqi' },
      updatedAt: new Date().toISOString(),
    };
    assert.equal(getPatientOwnerName(patient), 'Egzona Krasniqi');
    assert.equal(ownerMatchesAssigned('Egzona Krasniqi', 'egzona'), true);
    assert.equal(
      matchSegment(patient, 'mine', null, null, 'missing', { assignedOwner: 'Egzona Krasniqi' }),
      true
    );
    const stats = computeSegmentStats([patient], new Map(), null, 'missing', {
      assignedOwner: 'Egzona Krasniqi',
    });
    const mine = stats.segments.find((s) => s.id === 'mine');
    assert.equal(mine.status, 'real');
    assert.equal(mine.count, 1);
  });

  it('mine segment disabled when no owner on patients', () => {
    const patients = [
      {
        id: 'x',
        matchStatus: 'matched',
        flags: [],
        fileSummary: {},
        updatedAt: new Date().toISOString(),
      },
    ];
    assert.equal(computeOwnerCoverage(patients).coverage, 'none');
    const stats = computeSegmentStats(patients, new Map());
    const mine = stats.segments.find((s) => s.id === 'mine');
    assert.equal(mine.status, 'disabled');
    assert.equal(mine.reason, 'Kräver ägare per kund · P1');
    assert.equal(mine.count, null);
    assert.ok(stats.mineKunder);
    assert.equal(stats.mineKunder.status, 'disabled');
  });

  it('computeSegmentStats includes aggInsights', () => {
    const today = new Date().toISOString();
    const patients = [
      {
        id: 'p-today',
        displayName: 'Anna Test',
        matchStatus: 'matched',
        flags: [],
        fileSummary: {},
        updatedAt: today,
      },
      {
        id: 'p-vip',
        displayName: 'VIP Old',
        matchStatus: 'matched',
        flags: [],
        fileSummary: {},
        pipedrive: { deals: [{ status: 'won', value: '30000' }] },
        updatedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    const assetIndex = buildAssetSignalsIndex([]);
    const bookingIndex = new Map([
      ['p-today', { ...emptyBookingSignals(), todayVisit: true }],
      [
        'p-vip',
        {
          ...emptyBookingSignals(),
          lastVisitAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    ]);
    const stats = computeSegmentStats(patients, assetIndex, bookingIndex, 'real', {}, {});
    assert.ok(stats.aggInsights);
    assert.equal(stats.aggInsights.idag.count, 1);
    assert.equal(stats.aggInsights.idag.names[0], 'Anna Test');
    assert.equal(stats.aggInsights.opp.count, 1);
  });

  it('computeSegmentStats includes upcomingTreatment from nearest booking', () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const later = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const patients = [
      { id: 'p1', displayName: 'Eva K', matchStatus: 'matched', flags: [], fileSummary: {} },
      { id: 'p2', displayName: 'Senare', matchStatus: 'matched', flags: [], fileSummary: {} },
    ];
    const assetIndex = buildAssetSignalsIndex([]);
    const bookingIndex = new Map([
      [
        'p1',
        {
          ...emptyBookingSignals(),
          hasUpcomingBooking: true,
          nextBookingAt: future,
          nextBookingType: 'Konsultation',
          nextBookingResourceLabel: 'Egzona',
        },
      ],
      [
        'p2',
        {
          ...emptyBookingSignals(),
          hasUpcomingBooking: true,
          nextBookingAt: later,
          nextBookingType: 'PRP',
          nextBookingResourceLabel: 'Anna',
        },
      ],
    ]);
    const stats = computeSegmentStats(patients, assetIndex, bookingIndex, 'real');
    assert.equal(stats.upcomingTreatment.empty, false);
    assert.equal(stats.upcomingTreatment.patientId, 'p1');
    assert.equal(stats.upcomingTreatment.patientName, 'Eva K');
    assert.equal(stats.upcomingTreatment.treatmentLabel, 'Konsultation');
    assert.equal(stats.upcomingTreatment.practitionerLabel, 'Egzona');
    assert.equal(stats.upcomingTreatment.remindNow, true);
  });

  it('computeSegmentStats upcomingTreatment empty when booking missing', () => {
    const stats = computeSegmentStats([], new Map(), null, 'missing');
    assert.equal(stats.upcomingTreatment.empty, true);
    assert.equal(stats.upcomingTreatment.reason, 'Inga kommande');
  });
});
