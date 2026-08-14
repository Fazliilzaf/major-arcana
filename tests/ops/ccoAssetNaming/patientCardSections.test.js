'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolvePatientCardSection,
  SECTION_META,
} = require('../../../src/ops/ccoAssetNaming/patientCardSections');

test('resolvePatientCardSection: osäkert namn hamnar i needs_review', () => {
  const asset = {
    id: 'a1',
    category: 'journal',
    namingStatus: 'needs_review_for_naming',
    originalFileName: 'x.pdf',
  };
  const result = resolvePatientCardSection(asset);
  assert.equal(result.section, 'needs_review');
  assert.equal(result.tabId, 'review');
  assert.equal(result.confidence, 'medium');
  assert.deepEqual(result.signals, ['naming_needs_review']);
});

test('resolvePatientCardSection: redan manuellt löst hamnar i rätt sektion', () => {
  const asset = {
    id: 'a1',
    category: 'journal',
    subCategory: 'journal',
    namingStatus: 'manual_resolved',
    originalFileName: 'x.pdf',
  };
  const result = resolvePatientCardSection(asset);
  assert.equal(result.section, 'journaler');
  assert.equal(result.tabId, 'journal');
});

test('resolvePatientCardSection: statisk NEEDS_REVIEW-status prioriteras före namingStatus', () => {
  const asset = {
    id: 'a1',
    category: 'photo_during',
    status: 'NEEDS_REVIEW',
    namingStatus: 'needs_review_for_naming',
  };
  const result = resolvePatientCardSection(asset);
  assert.equal(result.section, 'needs_review');
  assert.equal(result.confidence, 'high');
  assert.deepEqual(result.signals, ['status_needs_review']);
});

test('SECTION_META har en review-sektion', () => {
  assert.equal(SECTION_META.needs_review.id, 'needs_review');
  assert.equal(SECTION_META.needs_review.label, 'Behöver granskning');
  assert.equal(SECTION_META.needs_review.tabId, 'review');
});

test('resolvePatientCardSection: bilder hamnar i bilder-sektionen', () => {
  const asset = { id: 'a1', category: 'photo_before', originalFileName: 'x.jpg' };
  const result = resolvePatientCardSection(asset);
  assert.equal(result.section, 'bilder');
  assert.equal(result.tabId, 'photo');
});
