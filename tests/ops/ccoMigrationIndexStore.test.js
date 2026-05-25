'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFilesByPersonnummer } = require('../../src/ops/ccoMigrationIndexStore');

test('buildFilesByPersonnummer indexes files without scanning full corpus per lookup', () => {
  const files = [
    { id: 'a', personnummer: '19900101-1234', fileType: 'image' },
    { id: 'b', personnummer: '19900101-1234', fileType: 'journal_pdf' },
    { id: 'c', personnummer: '19881212-5678', fileType: 'image' },
  ];
  const index = buildFilesByPersonnummer(files);
  assert.equal(index.get('19900101-1234').length, 2);
  assert.equal(index.get('19881212-5678').length, 1);
  assert.deepEqual(index.get('00000000-0000'), undefined);
});
