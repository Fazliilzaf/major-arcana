'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  countTreatmentSession,
  resolveEncounterNaming,
  treatmentSessionLabel,
} = require('../../src/ops/ccoAssetNaming/encounterNameResolver');

test('treatmentSessionLabel formats PRP/FUE/DHI with session number', () => {
  assert.equal(treatmentSessionLabel('PRP', 2), 'PRP 2');
  assert.equal(treatmentSessionLabel('FUE', 3), 'FUE 3');
  assert.equal(treatmentSessionLabel('DHI', 1), 'DHI 1');
  assert.equal(treatmentSessionLabel('consultation', null), 'consultation');
  assert.equal(treatmentSessionLabel('', 1), null);
});

test('countTreatmentSession returns null sessionNumber without a treatment type', () => {
  const result = countTreatmentSession({ id: 'a1' }, []);
  assert.equal(result.sessionNumber, null);
  assert.equal(result.usedFallbackDate, false);
});

test('countTreatmentSession: real documentDate on every sibling -> usedFallbackDate false', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'FUE', documentDate: '2026-01-01' },
    { id: 'a2', treatmentType: 'FUE', documentDate: '2026-02-01' },
    { id: 'a3', treatmentType: 'FUE', documentDate: '2026-03-01' },
  ];
  const result = countTreatmentSession(siblings[1], siblings);
  assert.equal(result.sessionNumber, 2);
  assert.equal(result.usedFallbackDate, false);
});

test('countTreatmentSession: missing documentDate on the asset itself -> usedFallbackDate true', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'FUE', importedAt: '2026-01-01T10:00:00Z' },
    { id: 'a2', treatmentType: 'FUE', importedAt: '2026-02-01T10:00:00Z' },
  ];
  const result = countTreatmentSession(siblings[0], siblings);
  assert.equal(result.sessionNumber, 1);
  assert.equal(result.usedFallbackDate, true);
});

test('countTreatmentSession: non-session treatment type never sets usedFallbackDate', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'consultation', importedAt: '2026-01-01T10:00:00Z' },
  ];
  const result = countTreatmentSession(siblings[0], siblings);
  assert.equal(result.sessionNumber, null);
  assert.equal(result.usedFallbackDate, false);
});

test('resolveEncounterNaming propagates usedFallbackDate from countTreatmentSession', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'PRP', category: 'journal', importedAt: '2026-01-01T10:00:00Z' },
  ];
  const result = resolveEncounterNaming(siblings[0], { siblingAssets: siblings });
  assert.equal(result.sessionNumber, 1);
  assert.equal(result.usedFallbackDate, true);
});

test('resolveEncounterNaming: usedFallbackDate false when documentDate is real', () => {
  const siblings = [
    { id: 'a1', treatmentType: 'PRP', category: 'journal', documentDate: '2026-01-01' },
  ];
  const result = resolveEncounterNaming(siblings[0], { siblingAssets: siblings });
  assert.equal(result.usedFallbackDate, false);
});
