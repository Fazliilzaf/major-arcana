'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAssetSignalsIndex,
  buildKunderReadout,
  computeSegmentStats,
  matchSegment,
  getPatientOwnerName,
  buildOwnerFieldInventory,
  ownerMatchesAssigned,
  computeOwnerCoverage,
  maskEmail,
  maskPhone,
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
        matchStatus: 'unmatched',
        flags: [],
        fileSummary: {},
        updatedAt: new Date().toISOString(),
      },
    ];
    const stats = computeSegmentStats(patients, new Map());
    assert.ok(stats.counts.needs_review >= 1);
    assert.ok(stats.counts.new >= 1);
    assert.equal(stats.panel.totalPatients, 2);
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
});
