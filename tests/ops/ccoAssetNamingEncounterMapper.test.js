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

test('identiska encounter-ID:n på samma dag räknas som en kandidat', () => {
  const registry = new Map([
    [
      'alias-a',
      {
        encounterId: 'same-encounter',
        date: '2026-05-05',
        encounterType: 'other',
        confidence: 'medium',
      },
    ],
    [
      'alias-b',
      {
        encounterId: 'same-encounter',
        date: '2026-05-05',
        encounterType: 'other',
        confidence: 'medium',
      },
    ],
  ]);
  const result = matchAssetToEncounter(
    { patientId: 'patient-1', mimeType: 'image/jpeg', documentDate: '2026-05-05' },
    registry
  );
  assert.equal(result.reason, 'date_only');
  assert.equal(result.encounterId, 'same-encounter');
});

test('ensam explicit encounter vinner över härledda kandidater samma dag', () => {
  const registry = new Map([
    [
      'explicit',
      {
        encounterId: 'explicit',
        date: '2026-05-05',
        encounterType: 'consultation',
        confidence: 'high',
      },
    ],
    [
      'derived',
      { encounterId: 'derived', date: '2026-05-05', encounterType: 'other', confidence: 'medium' },
    ],
  ]);
  const result = matchAssetToEncounter(
    { patientId: 'patient-1', mimeType: 'image/jpeg', documentDate: '2026-05-05' },
    registry
  );
  assert.equal(result.reason, 'date_and_explicit_encounter');
  assert.equal(result.encounterId, 'explicit');
  assert.equal(result.confidence, 'high');
});

test('två explicita encounters samma dag förblir review utan tidsvinnare', () => {
  const registry = new Map([
    [
      'explicit-a',
      {
        encounterId: 'explicit-a',
        date: '2026-05-05',
        encounterType: 'consultation',
        confidence: 'high',
      },
    ],
    [
      'explicit-b',
      { encounterId: 'explicit-b', date: '2026-05-05', encounterType: 'other', confidence: 'high' },
    ],
  ]);
  const result = matchAssetToEncounter(
    { patientId: 'patient-1', mimeType: 'image/jpeg', documentDate: '2026-05-05' },
    registry
  );
  assert.equal(result.reason, 'ambiguous_date');
  assert.equal(result.confidence, 'review');
});

test('ensam specifik behandling vinner över generisk other samma dag', () => {
  const registry = new Map([
    [
      'operation',
      {
        encounterId: 'operation',
        date: '2026-05-05',
        encounterType: 'transplant_fue',
        confidence: 'medium',
      },
    ],
    [
      'generic',
      { encounterId: 'generic', date: '2026-05-05', encounterType: 'other', confidence: 'medium' },
    ],
  ]);
  const result = matchAssetToEncounter(
    { patientId: 'patient-1', mimeType: 'image/jpeg', documentDate: '2026-05-05' },
    registry
  );
  assert.equal(result.reason, 'date_and_specific_type_over_other');
  assert.equal(result.encounterId, 'operation');
  assert.equal(result.encounterType, 'transplant_fue');
});

test('två olika specifika behandlingar samma dag förblir review', () => {
  const registry = new Map([
    [
      'operation',
      {
        encounterId: 'operation',
        date: '2026-05-05',
        encounterType: 'transplant_fue',
        confidence: 'medium',
      },
    ],
    [
      'prp',
      { encounterId: 'prp', date: '2026-05-05', encounterType: 'prp_hair', confidence: 'medium' },
    ],
  ]);
  const result = matchAssetToEncounter(
    { patientId: 'patient-1', mimeType: 'image/jpeg', documentDate: '2026-05-05' },
    registry
  );
  assert.equal(result.reason, 'ambiguous_date');
  assert.equal(result.confidence, 'review');
});

test('tydlig assettyp skapar typed fallback när dagens kandidater är inkompatibla', () => {
  const registry = new Map([
    [
      'fue',
      {
        encounterId: 'fue',
        date: '2026-05-05',
        encounterType: 'transplant_fue',
        confidence: 'medium',
      },
    ],
    [
      'prp',
      { encounterId: 'prp', date: '2026-05-05', encounterType: 'prp_hair', confidence: 'medium' },
    ],
  ]);
  const result = matchAssetToEncounter(
    {
      patientId: 'patient-1',
      mimeType: 'image/jpeg',
      originalFileName: 'DHI_after.jpg',
      documentDate: '2026-05-05',
    },
    registry
  );
  assert.equal(result.reason, 'date_and_asset_type_fallback');
  assert.equal(result.encounterType, 'transplant_dhi');
  assert.equal(result.confidence, 'medium');
  assert.ok(result.encounterId);
});

test('pipedrive smartdoc registreras i registry och länkas via konsultation', () => {
  const smartdoc = {
    id: 'pd-1',
    patientId: 'patient-1',
    sourceSystem: 'pipedrive_import',
    status: 'VISIBLE_ON_PATIENT_CARD',
    patientCardSection: 'ovrigt',
    mimeType: 'application/pdf',
    category: 'other',
    encounterType: 'konsultation',
    documentDate: '2026-07-11',
    captureDateTime: '2026-07-11T14:13:00Z',
  };
  const registry = buildEncounterRegistry({ assets: [smartdoc] });
  assert.equal(inferEncounterTypeFromAsset(smartdoc), 'consultation');
  const result = matchAssetToEncounter(
    {
      id: 'pd-2',
      patientId: 'patient-1',
      sourceSystem: 'pipedrive_import',
      status: 'VISIBLE_ON_PATIENT_CARD',
      patientCardSection: 'ovrigt',
      mimeType: 'application/pdf',
      encounterType: 'konsultation',
      documentDate: '2026-07-11',
    },
    registry.get('patient-1')
  );
  assert.equal(result.confidence, 'high');
  assert.equal(result.encounterType, 'consultation');
  assert.ok(result.encounterId);
});
