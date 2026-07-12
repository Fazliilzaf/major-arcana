'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEncounterRegistry,
  matchAssetToEncounter,
  inferEncounterTypeFromAsset,
} = require('../../src/ops/ccoAssetNaming/encounterMapper');

function registryFor(entries = []) {
  return buildEncounterRegistry({ journalEntries: entries });
}

test('foto utan behandlingstyp länkas medium när exakt ett encounter finns samma dag', () => {
  const registry = registryFor([
    { patientId: 'patient-1', treatmentDate: '2026-05-05', journalType: 'consultation' },
  ]);
  const result = matchAssetToEncounter(
    {
      patientId: 'patient-1',
      mimeType: 'image/jpeg',
      originalFileName: 'IMG_0001.jpg',
      documentDate: '2026-05-05',
    },
    registry.get('patient-1')
  );

  assert.equal(result.confidence, 'medium');
  assert.equal(result.reason, 'date_only');
  assert.equal(result.encounterType, 'consultation');
  assert.ok(result.encounterId);
});

test('foto med två möjliga besök samma dag går till review', () => {
  const registry = registryFor([
    { patientId: 'patient-1', treatmentDate: '2026-05-05', journalType: 'consultation' },
    { patientId: 'patient-1', treatmentDate: '2026-05-05', journalType: 'prp' },
  ]);
  const result = matchAssetToEncounter(
    {
      patientId: 'patient-1',
      mimeType: 'image/jpeg',
      originalFileName: 'IMG_0001.jpg',
      documentDate: '2026-05-05',
    },
    registry.get('patient-1')
  );

  assert.equal(result.confidence, 'review');
  assert.equal(result.reason, 'ambiguous_date');
  assert.equal(result.encounterId, null);
  assert.equal(result.candidates.length, 2);
});

test('foto med PRP i filnamn får kompatibel typed matchning', () => {
  const registry = registryFor([
    { patientId: 'patient-1', treatmentDate: '2026-05-05', journalType: 'prp' },
  ]);
  const asset = {
    patientId: 'patient-1',
    mimeType: 'image/jpeg',
    originalFileName: 'PRP_before.jpg',
    documentDate: '2026-05-05',
  };
  assert.equal(inferEncounterTypeFromAsset(asset), 'prp_hair');
  const result = matchAssetToEncounter(asset, registry.get('patient-1'));
  assert.equal(result.confidence, 'high');
  assert.equal(result.reason, 'date_and_type');
  assert.equal(result.encounterType, 'prp_hair');
});

test('foto utan datum går till review och skapar ingen encounter', () => {
  const result = matchAssetToEncounter(
    {
      patientId: 'patient-1',
      mimeType: 'image/jpeg',
      originalFileName: 'IMG_0001.jpg',
    },
    new Map()
  );
  assert.equal(result.confidence, 'review');
  assert.equal(result.reason, 'missing_date');
  assert.equal(result.encounterId, null);
});

test('foto med datum men utan registry får stabil date-only fallback', () => {
  const result = matchAssetToEncounter(
    {
      patientId: 'patient-1',
      mimeType: 'image/jpeg',
      originalFileName: 'IMG_0001.jpg',
      documentDate: '2026-05-05',
    },
    new Map()
  );
  assert.equal(result.confidence, 'medium');
  assert.equal(result.reason, 'date_only_fallback');
  assert.equal(result.encounterType, 'other');
  assert.ok(result.encounterId);
});

test('foto med klockslag väljer unikt närmaste encounter samma dag', () => {
  const registry = buildEncounterRegistry({
    bookings: [
      { patientId: 'patient-1', encounterId: 'morning', startsAt: '2026-05-05T09:00:00Z' },
      { patientId: 'patient-1', encounterId: 'afternoon', startsAt: '2026-05-05T15:00:00Z' },
    ],
  });
  const result = matchAssetToEncounter(
    {
      patientId: 'patient-1',
      mimeType: 'image/jpeg',
      originalFileName: 'IMG_0001.jpg',
      captureDateTime: '2026-05-05T09:12:00Z',
    },
    registry.get('patient-1')
  );
  assert.equal(result.confidence, 'high');
  assert.equal(result.reason, 'date_and_nearest_time');
  assert.equal(result.encounterId, 'morning');
});

test('foto mitt emellan två tider förblir review', () => {
  const registry = buildEncounterRegistry({
    bookings: [
      { patientId: 'patient-1', encounterId: 'early', startsAt: '2026-05-05T09:00:00Z' },
      { patientId: 'patient-1', encounterId: 'late', startsAt: '2026-05-05T11:00:00Z' },
    ],
  });
  const result = matchAssetToEncounter(
    {
      patientId: 'patient-1',
      mimeType: 'image/jpeg',
      captureDateTime: '2026-05-05T10:00:00Z',
    },
    registry.get('patient-1')
  );
  assert.equal(result.confidence, 'review');
  assert.equal(result.reason, 'ambiguous_date');
});
