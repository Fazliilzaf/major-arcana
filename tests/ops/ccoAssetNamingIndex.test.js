'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAssetNamingMetadata } = require('../../src/ops/ccoAssetNaming');

// CCO-STATUS.md punkt 1 (bekräftad 2026-08-13): ett sessionNumber
// beräknat från ett saknat documentDate (importedAt-fallback) är inte en
// pålitlig behandlingssiffra. buildAssetNamingMetadata måste hålla
// tillbaka den (namingStatus: needs_review_for_naming) utan att ljuga om
// namingConfidence — displayName kan vara helt korrekt trots det.
test('buildAssetNamingMetadata: sessionNumber via importedAt-fallback tvingar needs_review_for_naming, men namingConfidence förblir sanningsenlig', () => {
  const asset = {
    id: 'a1',
    category: 'journal',
    originalFileName: 'FUE-avtal.pdf',
    treatmentType: 'FUE',
    importedAt: '2026-01-15T10:00:00.000Z',
  };
  const result = buildAssetNamingMetadata(asset, {
    siblingAssets: [{ id: 'a1', treatmentType: 'FUE', importedAt: '2026-01-15T10:00:00.000Z' }],
  });

  assert.equal(result.sessionNumber, 1);
  assert.equal(result.namingStatus, 'needs_review_for_naming');
  assert.equal(result.uiStatus, 'needs_review_for_naming');
  // Displayen är fortsatt korrekt byggd — bara sessionNumret är osäkert.
  assert.equal(result.namingConfidence, 'high');
  assert.ok(result.displayName.includes('FUE 1'));
});

test('buildAssetNamingMetadata: sessionNumber via riktigt documentDate skrivs som resolved', () => {
  const asset = {
    id: 'a1',
    category: 'journal',
    originalFileName: 'FUE-avtal.pdf',
    treatmentType: 'FUE',
    documentDate: '2026-01-15',
  };
  const result = buildAssetNamingMetadata(asset, {
    siblingAssets: [{ id: 'a1', treatmentType: 'FUE', documentDate: '2026-01-15' }],
  });

  assert.equal(result.sessionNumber, 1);
  assert.equal(result.namingStatus, 'resolved');
  assert.equal(result.namingConfidence, 'high');
});

test('buildAssetNamingMetadata: konsultation numreras nu som session och hålls tillbaka vid fallback-datum', () => {
  const asset = {
    id: 'a1',
    category: 'journal',
    originalFileName: 'Konsultation-anteckning.pdf',
    treatmentType: 'consultation',
    importedAt: '2026-01-15T10:00:00.000Z',
  };
  const result = buildAssetNamingMetadata(asset, {
    siblingAssets: [
      { id: 'a1', treatmentType: 'consultation', importedAt: '2026-01-15T10:00:00.000Z' },
    ],
  });

  assert.equal(result.sessionNumber, 1);
  assert.equal(result.namingStatus, 'needs_review_for_naming');
  assert.ok(result.displayName.includes('Konsultation 1'));
  // namingStatus styrs här både av session-fallback och av den vanliga namingConfidence-vägen.
  assert.notEqual(result.namingConfidence, undefined);
});

test('buildAssetNamingMetadata: ett redan lågkonfident foto hålls tillbaka precis som innan (regression, oberoende av fallback-fixen)', () => {
  const asset = {
    id: 'a1',
    category: 'oklassificerad_kategori_xyz',
    originalFileName: 'IMG_9999.jpg',
  };
  const result = buildAssetNamingMetadata(asset, { siblingAssets: [asset] });
  assert.equal(result.namingStatus, 'needs_review_for_naming');
});


test('Fas 7: buildAssetNamingMetadata använder journeyStep från asset i displayName', () => {
  const asset = {
    id: 'a1',
    category: 'agreement',
    documentTitle: 'Behandlingsavtal',
    documentDate: '2026-06-01',
    importedAt: '2026-06-01T10:00:00.000Z',
    journeyStep: '7',
  };
  const result = buildAssetNamingMetadata(asset, { siblingAssets: [asset] });
  assert.ok(result.displayName.startsWith('Steg 7 ·'), result.displayName);
});

test('Fas 7: buildAssetNamingMetadata utan journeyStep påverkas inte', () => {
  const asset = {
    id: 'a1',
    category: 'agreement',
    documentTitle: 'Behandlingsavtal',
    documentDate: '2026-06-01',
    importedAt: '2026-06-01T10:00:00.000Z',
  };
  const result = buildAssetNamingMetadata(asset, { siblingAssets: [asset] });
  assert.ok(!result.displayName.includes('Steg'), result.displayName);
});
