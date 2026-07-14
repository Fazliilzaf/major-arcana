'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  mergePipedriveHistoricalDocuments,
  pipedriveAssetToDocumentRow,
} = require('../../src/ops/ccoPipedriveHistoricalDocuments');

const paritySource = fs.readFileSync(
  path.resolve(__dirname, '../../public/major-arcana-preview/app/cco-v9-customers-parity.js'),
  'utf8'
);
const referensSource = fs.readFileSync(
  path.resolve(__dirname, '../../public/major-arcana-preview/app/cco-kundkort-referens.js'),
  'utf8'
);

test('pipedrive historical offer rows carry previewable viewUrl for dossier bundle', () => {
  const row = pipedriveAssetToDocumentRow({
    id: 'asset-offer-1',
    sourceSystem: 'pipedrive_import',
    status: 'VISIBLE_ON_PATIENT_CARD',
    patientCardSection: 'offert',
    displayName: 'Offert Daniel.pdf',
    documentDate: '2024-03-01',
  });
  assert.equal(row.registryId, 'pipedrive_historical_offer');
  assert.equal(row.previewable, true);
  assert.match(row.viewUrl, /\/api\/v1\/cco\/assets\/asset-offer-1\/download\?inline=1$/);

  const merged = mergePipedriveHistoricalDocuments(
    { documents: {}, counts: { total: 0, done: 0 } },
    [
      {
        id: 'asset-offer-1',
        sourceSystem: 'pipedrive_import',
        status: 'VISIBLE_ON_PATIENT_CARD',
        patientCardSection: 'offert',
        displayName: 'Offert Daniel.pdf',
      },
    ]
  );
  assert.equal(merged.documents.offers.length, 1);
  assert.equal(merged.documents.offers[0].viewUrl, row.viewUrl);
});

test('V11 document row renderer wires asset viewUrl into clickable preview attrs', () => {
  assert.match(paritySource, /data-v11-doc-view-url=/);
  assert.match(paritySource, /openV11DocumentAssetPreview\(viewUrl, title\)/);
  assert.match(paritySource, /pipedrive_historical_/);
});

test('referens registry docs treat pipedrive historical rows as interactive', () => {
  assert.match(referensSource, /pipedrive_historical_/);
  assert.match(referensSource, /data-v11-doc-view-url=/);
  assert.match(referensSource, /handleV11DocumentRowActivate/);
});
