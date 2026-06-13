'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeFormTypeFilter,
  filterMailIndexByFormType,
  filterAssetCatalogByFormType,
} = require('../../scripts/lib/halsoHdFormTypeFilter');

test('normalizeFormTypeFilter accepts hd and fc aliases', () => {
  assert.equal(normalizeFormTypeFilter('hd'), 'health_declaration');
  assert.equal(normalizeFormTypeFilter('fc'), 'fitness_certificate');
  assert.equal(normalizeFormTypeFilter('all'), '');
});

test('filterMailIndexByFormType keeps only matching subjects', () => {
  const entries = [
    { id: '1', subject: '[Hälsodeklaration/webb]' },
    { id: '2', subject: '[Friskförsäkran/webb]' },
  ];
  const hdOnly = filterMailIndexByFormType(entries, 'health_declaration');
  assert.equal(hdOnly.length, 1);
  assert.equal(hdOnly[0].id, '1');
  const fcOnly = filterMailIndexByFormType(entries, 'fitness_certificate');
  assert.equal(fcOnly.length, 1);
  assert.equal(fcOnly[0].id, '2');
});

test('filterAssetCatalogByFormType uses formType or filename', () => {
  const entries = [
    { assetId: 'a', formType: 'health_declaration', originalFileName: 'hd.pdf' },
    { assetId: 'b', originalFileName: 'friskforsakran.pdf' },
  ];
  const fcOnly = filterAssetCatalogByFormType(entries, 'fitness_certificate');
  assert.deepEqual(
    fcOnly.map((row) => row.assetId),
    ['b']
  );
});
