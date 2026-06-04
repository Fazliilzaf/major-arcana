'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONFIDENCE_BY_LEVEL,
  KNOWN_FOLDERS,
  emptyDriveCoupling,
  extractFolderIdFromUrl,
  markCouplingVerified,
  pickLatestEncounter,
  predictDriveFolderForPatient,
  predictDriveFoldersForPatients,
} = require('../../src/ops/ccoDriveFolderCoupler');

// ─────────────────────────────────────────────────────────────────────────
// extractFolderIdFromUrl — edge cases
// ─────────────────────────────────────────────────────────────────────────
test('extractFolderIdFromUrl pulls folder-id ur drive-URL', () => {
  assert.equal(
    extractFolderIdFromUrl('https://drive.google.com/drive/folders/1Gof_xzKOvdote1DCjb-riNozlvpLgjbh'),
    '1Gof_xzKOvdote1DCjb-riNozlvpLgjbh'
  );
});

test('extractFolderIdFromUrl handlar search-suffix korrekt', () => {
  const url =
    'https://drive.google.com/drive/folders/1Gof_xzKOvdote1DCjb-riNozlvpLgjbh#search?q=Maj%2013';
  assert.equal(extractFolderIdFromUrl(url), '1Gof_xzKOvdote1DCjb-riNozlvpLgjbh');
});

test('extractFolderIdFromUrl returnerar null vid null/undefined/tom sträng', () => {
  assert.equal(extractFolderIdFromUrl(null), null);
  assert.equal(extractFolderIdFromUrl(undefined), null);
  assert.equal(extractFolderIdFromUrl(''), null);
  assert.equal(extractFolderIdFromUrl('not-a-url'), null);
  assert.equal(extractFolderIdFromUrl('https://example.com/no-folders-segment'), null);
});

test('extractFolderIdFromUrl ignorerar non-string input', () => {
  assert.equal(extractFolderIdFromUrl(123), null);
  assert.equal(extractFolderIdFromUrl({}), null);
  assert.equal(extractFolderIdFromUrl([]), null);
});

// ─────────────────────────────────────────────────────────────────────────
// emptyDriveCoupling
// ─────────────────────────────────────────────────────────────────────────
test('emptyDriveCoupling default = no_bookings + status none + ingen folder', () => {
  const c = emptyDriveCoupling();
  assert.equal(c.status, 'none');
  assert.equal(c.predictionConfidence, 'none');
  assert.equal(c.predictedFolderId, null);
  assert.equal(c.predictedFolderUrl, null);
  assert.equal(c.predictionBasis, 'no_bookings');
  assert.equal(c.verifiedAt, null);
  assert.equal(c.verifiedBy, null);
});

// ─────────────────────────────────────────────────────────────────────────
// pickLatestEncounter
// ─────────────────────────────────────────────────────────────────────────
test('pickLatestEncounter väljer senaste datum', () => {
  const latest = pickLatestEncounter([
    { treatmentDate: '2025-01-01' },
    { treatmentDate: '2026-05-13' },
    { treatmentDate: '2024-08-10' },
  ]);
  assert.ok(latest);
  assert.equal(latest.treatmentDate, '2026-05-13');
});

test('pickLatestEncounter accepterar både treatmentDate, date och startsAt', () => {
  const latest = pickLatestEncounter([
    { date: '2026-03-15' },
    { startsAt: '2026-07-01T08:00:00Z' },
    { treatmentDate: '2026-05-13' },
  ]);
  assert.ok(latest);
  assert.equal(latest.startsAt, '2026-07-01T08:00:00Z');
});

test('pickLatestEncounter returnerar null vid tom/odefinierad input', () => {
  assert.equal(pickLatestEncounter([]), null);
  assert.equal(pickLatestEncounter(null), null);
  assert.equal(pickLatestEncounter(undefined), null);
  assert.equal(pickLatestEncounter([{ foo: 'bar' }]), null);
});

// ─────────────────────────────────────────────────────────────────────────
// predictDriveFolderForPatient — happy paths
// ─────────────────────────────────────────────────────────────────────────
test('patient utan encounters → status=none, confidence=none, basis=no_bookings', () => {
  const r = predictDriveFolderForPatient({ patient: { key: 'p1' }, encounters: [] });
  assert.equal(r.status, 'none');
  assert.equal(r.predictionConfidence, 'none');
  assert.equal(r.predictedFolderId, null);
  assert.equal(r.predictionBasis, 'no_bookings');
  assert.equal(r.sourceEncounters, 0);
});

test('patient med encounter 2026-05-13 → Maj-mapp + confidence=high (känd månads-folder)', () => {
  const r = predictDriveFolderForPatient({
    patient: { key: 'p1' },
    encounters: [{ treatmentDate: '2026-05-13' }],
    brand: 'hair_tp',
  });
  assert.equal(r.status, 'predicted');
  assert.equal(r.predictionConfidence, 'high');
  assert.equal(r.predictedFolderId, KNOWN_FOLDERS.hair_tp.tpBokade2026Maj);
  assert.equal(r.predictedFolderId, '1Gof_xzKOvdote1DCjb-riNozlvpLgjbh');
  assert.ok(r.predictedFolderUrl.includes(KNOWN_FOLDERS.hair_tp.tpBokade2026Maj));
  assert.equal(r.predictionBasis, 'latest_booking_2026-05-13');
  assert.equal(r.sourceEncounters, 1);
});

test('patient med encounter 2026-03-15 → confidence=medium (känt år, okänd månad)', () => {
  const r = predictDriveFolderForPatient({
    patient: { key: 'p2' },
    encounters: [{ treatmentDate: '2026-03-15' }],
    brand: 'hair_tp',
  });
  assert.equal(r.status, 'predicted');
  assert.equal(r.predictionConfidence, 'medium');
  assert.equal(r.predictedFolderId, KNOWN_FOLDERS.hair_tp.tpBokade2026);
  assert.equal(r.predictionBasis, 'latest_booking_2026-03-15');
});

test('patient med encounter 2024-08-10 → confidence=low (okänt år)', () => {
  const r = predictDriveFolderForPatient({
    patient: { key: 'p3' },
    encounters: [{ treatmentDate: '2024-08-10' }],
    brand: 'hair_tp',
  });
  assert.equal(r.status, 'predicted');
  assert.equal(r.predictionConfidence, 'low');
  // ska peka på tpBokade (parent för år-search)
  assert.equal(r.predictedFolderId, KNOWN_FOLDERS.hair_tp.tpBokade);
  assert.equal(r.predictionBasis, 'latest_booking_2024-08-10');
});

test('patient med curatiio-brand → status=none + confidence=none (TBD-root)', () => {
  const r = predictDriveFolderForPatient({
    patient: { key: 'p4' },
    encounters: [{ treatmentDate: '2026-05-13' }],
    brand: 'curatiio',
  });
  assert.equal(r.status, 'none');
  assert.equal(r.predictionConfidence, 'none');
  assert.equal(r.predictedFolderId, null);
  assert.equal(r.predictedFolderUrl, null);
});

test('patient med flera encounters → senaste vinner som basis', () => {
  const r = predictDriveFolderForPatient({
    patient: { key: 'p5' },
    encounters: [
      { treatmentDate: '2024-08-10' },
      { treatmentDate: '2026-05-13' },
      { treatmentDate: '2025-01-01' },
    ],
    brand: 'hair_tp',
  });
  assert.equal(r.predictionBasis, 'latest_booking_2026-05-13');
  assert.equal(r.predictionConfidence, 'high');
  assert.equal(r.sourceEncounters, 3);
});

test('encounters utan giltiga datum → status=none + basis=no_dated_encounters', () => {
  const r = predictDriveFolderForPatient({
    patient: { key: 'p6' },
    encounters: [{ foo: 'bar' }, { id: 'x' }],
    brand: 'hair_tp',
  });
  assert.equal(r.status, 'none');
  assert.equal(r.predictionBasis, 'no_dated_encounters');
});

// ─────────────────────────────────────────────────────────────────────────
// CONFIDENCE_BY_LEVEL mapping
// ─────────────────────────────────────────────────────────────────────────
test('CONFIDENCE_BY_LEVEL mapping täcker alla level-värden från ccoDriveLinkBuilder', () => {
  assert.equal(CONFIDENCE_BY_LEVEL.day_search, 'high');
  assert.equal(CONFIDENCE_BY_LEVEL.month_search, 'medium');
  assert.equal(CONFIDENCE_BY_LEVEL.year_search, 'low');
  assert.equal(CONFIDENCE_BY_LEVEL.brand_root, 'low');
  assert.equal(CONFIDENCE_BY_LEVEL.unknown_brand, 'none');
});

// ─────────────────────────────────────────────────────────────────────────
// markCouplingVerified — framtida service-account flow
// ─────────────────────────────────────────────────────────────────────────
test('markCouplingVerified flippar status → verified och sätter timestamp+by', () => {
  const predicted = predictDriveFolderForPatient({
    patient: { key: 'p7' },
    encounters: [{ treatmentDate: '2026-05-13' }],
    brand: 'hair_tp',
  });
  assert.equal(predicted.status, 'predicted');

  const verified = markCouplingVerified(predicted, { verifiedBy: 'sa@example.com' });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.verifiedBy, 'sa@example.com');
  assert.ok(verified.verifiedAt, 'verifiedAt borde vara ISO-sträng');
  // folder-id bevaras
  assert.equal(verified.predictedFolderId, predicted.predictedFolderId);
  assert.equal(verified.predictedFolderUrl, predicted.predictedFolderUrl);
});

test('markCouplingVerified accepterar custom verifiedAt', () => {
  const verified = markCouplingVerified(emptyDriveCoupling(), {
    verifiedBy: 'admin',
    verifiedAt: '2026-06-01T10:00:00Z',
  });
  assert.equal(verified.verifiedAt, '2026-06-01T10:00:00Z');
  assert.equal(verified.verifiedBy, 'admin');
});

// ─────────────────────────────────────────────────────────────────────────
// predictDriveFoldersForPatients — batch
// ─────────────────────────────────────────────────────────────────────────
test('batch-predict över 1000 patienter → stats matchar input-distribution', () => {
  const patients = [];
  const encountersByPatient = {};
  // 600 med Maj-2026 (high)
  // 200 med Mars-2026 (medium)
  // 100 med 2024 (low)
  // 100 utan encounters (none)
  for (let i = 0; i < 600; i++) {
    const k = `high-${i}`;
    patients.push({ key: k, brand: 'hair_tp' });
    encountersByPatient[k] = [{ treatmentDate: '2026-05-13' }];
  }
  for (let i = 0; i < 200; i++) {
    const k = `med-${i}`;
    patients.push({ key: k, brand: 'hair_tp' });
    encountersByPatient[k] = [{ treatmentDate: '2026-03-15' }];
  }
  for (let i = 0; i < 100; i++) {
    const k = `low-${i}`;
    patients.push({ key: k, brand: 'hair_tp' });
    encountersByPatient[k] = [{ treatmentDate: '2024-08-10' }];
  }
  for (let i = 0; i < 100; i++) {
    const k = `none-${i}`;
    patients.push({ key: k, brand: 'hair_tp' });
    encountersByPatient[k] = [];
  }

  const { results, stats } = predictDriveFoldersForPatients({
    patients,
    encountersByPatient,
  });

  assert.equal(Object.keys(results).length, 1000);
  assert.equal(stats.totalPatients, 1000);
  assert.equal(stats.predicted, 900); // high + medium + low
  assert.equal(stats.none, 100);
  assert.equal(stats.byConfidence.high, 600);
  assert.equal(stats.byConfidence.medium, 200);
  assert.equal(stats.byConfidence.low, 100);
  assert.equal(stats.byConfidence.none, 100);
});

test('batch-predict accepterar patient.customerId som key-fallback', () => {
  const { results, stats } = predictDriveFoldersForPatients({
    patients: [{ customerId: 'cust-1', brand: 'hair_tp' }],
    encountersByPatient: { 'cust-1': [{ treatmentDate: '2026-05-13' }] },
  });
  assert.ok(results['cust-1']);
  assert.equal(results['cust-1'].predictionConfidence, 'high');
  assert.equal(stats.predicted, 1);
});

test('batch-predict skippar patienter utan key/customerId', () => {
  const { results, stats } = predictDriveFoldersForPatients({
    patients: [{ name: 'No-Key' }, { key: 'k1' }],
    encountersByPatient: { k1: [] },
  });
  assert.equal(Object.keys(results).length, 1);
  assert.ok(results.k1);
  assert.equal(stats.none, 1);
});
