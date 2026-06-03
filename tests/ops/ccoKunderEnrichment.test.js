'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAssetSignalsIndex,
  buildKunderReadout,
  computeSegmentStats,
  matchSegment,
  maskEmail,
  maskPhone,
} = require('../../src/ops/ccoKunderEnrichment');

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
});
