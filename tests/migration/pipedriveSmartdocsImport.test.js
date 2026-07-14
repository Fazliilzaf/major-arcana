'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPipedrivePatientIndex,
  resolvePatientForManifestItem,
  mapDocumentKindToAssetMeta,
  classifyPipedriveDocumentKind,
  extractPersonNameFromFileName,
} = require('../../scripts/migration/lib/pipedriveSmartdocsImport');
const {
  mergePipedriveHistoricalDocuments,
  inferDocumentKind,
} = require('../../src/ops/ccoPipedriveHistoricalDocuments');

test('resolvePatientForManifestItem matches smartdoc filename via pipedrive person', () => {
  const patients = [
    {
      id: 'pat-1',
      tenantId: 'hair-tp-clinic',
      displayName: 'Erik Testsson',
      pipedrive: { personId: '123' },
    },
  ];
  const index = buildPipedrivePatientIndex(patients);
  const peopleIndex = {
    byName: new Map([['erik testsson', ['123']]]),
  };
  const match = resolvePatientForManifestItem(
    { fileId: '99', fileName: 'Erik Testsson 2024-03-15 10-30-00.pdf' },
    index,
    peopleIndex
  );
  assert.equal(match.patientId, 'pat-1');
  assert.equal(match.method, 'smartdoc_name_to_pipedrive_person');
});

test('mapDocumentKindToAssetMeta maps offer and agreement', () => {
  assert.equal(mapDocumentKindToAssetMeta('offer').patientCardSection, 'offert');
  assert.equal(mapDocumentKindToAssetMeta('agreement').category, 'agreement');
});

test('classifyPipedriveDocumentKind treats Affär smartdocs as agreements', () => {
  assert.equal(
    classifyPipedriveDocumentKind('Affär Lars McLachlan 2025-10-11 16-51-11.pdf'),
    'agreement'
  );
  assert.equal(
    classifyPipedriveDocumentKind('John Lindvall affär 2025-12-10 17-33-53.pdf'),
    'agreement'
  );
  assert.equal(classifyPipedriveDocumentKind('Offert Erik 2024-01-01.pdf'), 'offer');
});

test('inferDocumentKind recognizes Affär filename without metadata backfill', () => {
  assert.equal(
    inferDocumentKind({
      patientCardSection: 'ovrigt',
      category: 'other',
      originalFileName: 'Affär Samuel Brandt 2025-08-21 12-18-39.pdf',
    }),
    'agreement'
  );
});

test('extractPersonNameFromFileName parses dated smartdoc names', () => {
  assert.equal(
    extractPersonNameFromFileName('Anna Svensson 2023-11-02 14-05-22.pdf'),
    'Anna Svensson'
  );
  assert.equal(
    extractPersonNameFromFileName('Sheik Meeran Rasheed 2026-04-18 16-12-.pdf'),
    'Sheik Meeran Rasheed'
  );
  assert.equal(extractPersonNameFromFileName('Shashank 2026-06-25 16-48-24.pdf'), 'Shashank');
  assert.equal(
    extractPersonNameFromFileName('Caesar Larsson 2026-04-01 18-30.pdf'),
    'Caesar Larsson'
  );
  assert.equal(
    extractPersonNameFromFileName('Affär Ahmad Sheikhahmad 2025-02-26 16-46-30.pdf'),
    'Ahmad Sheikhahmad'
  );
  assert.equal(
    extractPersonNameFromFileName('Abdirahman Ali affär 2025-04-19 12-39-57.pdf'),
    'Abdirahman Ali'
  );
});

test('mergePipedriveHistoricalDocuments adds offers and agreements to bundle', () => {
  const bundle = {
    ready: true,
    documents: {
      offers: [{ title: 'Registry offert' }],
      healthForms: [],
      counts: { total: 1, done: 0 },
    },
    counts: { total: 1, done: 0 },
  };
  const assets = [
    {
      id: 'a1',
      sourceSystem: 'pipedrive_import',
      status: 'VISIBLE_ON_PATIENT_CARD',
      subCategory: 'pipedrive_offer',
      patientCardSection: 'offert',
      originalFileName: 'Offert Erik.pdf',
      documentDate: '2024-01-10',
    },
    {
      id: 'a2',
      sourceSystem: 'pipedrive_import',
      status: 'VISIBLE_ON_PATIENT_CARD',
      category: 'agreement',
      subCategory: 'pipedrive_agreement',
      patientCardSection: 'samtycken_avtal',
      originalFileName: 'Behandlingsavtal Erik.pdf',
      documentDate: '2024-01-12',
    },
  ];
  const merged = mergePipedriveHistoricalDocuments(bundle, assets);
  assert.equal(merged.documents.offers.length, 2);
  assert.equal(merged.documents.healthForms.length, 1);
  assert.equal(inferDocumentKind(assets[1]), 'agreement');
  assert.equal(merged.pipedriveHistorical.offerCount, 1);
});
