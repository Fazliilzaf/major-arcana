'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  validate,
  isWorkbookFilled,
} = require('../../src/ops/ccoServiceIdsCatalogValidator');

function writeTmp(prefix, content) {
  const file = path.join(os.tmpdir(), `${prefix}-${process.pid}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(file, content);
  return file;
}

function makeCatalog(types) {
  const file = writeTmp('cat', JSON.stringify({ version: 1, types }), 'utf8');
  return file;
}

test('validate: workbook missing => nothing to validate, no warnings', () => {
  const catalog = makeCatalog([{ id: 'a', name: 'A', serviceIds: [] }]);
  const result = validate({ catalogPath: catalog, workbookPath: '/saknas/inte-finns.csv' });
  assert.equal(result.workbookFound, false);
  assert.equal(result.warnings.length, 0);
});

test('validate: workbook present but empty (header only) => no warnings', () => {
  const catalog = makeCatalog([{ id: 'a', name: 'A', serviceIds: [] }]);
  const work = writeTmp('workbook', 'tjänst,dokument\n');
  const result = validate({ catalogPath: catalog, workbookPath: work });
  assert.equal(result.workbookFound, true);
  assert.equal(result.workbookFilled, false);
  assert.equal(result.warnings.length, 0);
});

test('validate: workbook filled and row lacks serviceIds => warns per row', () => {
  const catalog = makeCatalog([
    { id: 'a', name: 'A', serviceIds: [] },
    { id: 'b', name: 'B', serviceIds: ['fue'] },
    { id: 'c', name: 'C', serviceIds: undefined },
  ]);
  const work = writeTmp('workbook', 'tjänst,dokument\nfue,A\n');
  const result = validate({ catalogPath: catalog, workbookPath: work });
  assert.equal(result.workbookFound, true);
  assert.equal(result.workbookFilled, true);
  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.some((w) => w.includes('a')));
  assert.ok(result.warnings.some((w) => w.includes('c')));
});

test('validate: workbook filled and all rows have serviceIds => no warnings', () => {
  const catalog = makeCatalog([
    { id: 'a', name: 'A', serviceIds: ['fue'] },
    { id: 'b', name: 'B', serviceIds: ['prp'] },
  ]);
  const work = writeTmp('workbook', 'tjänst,dokument\nfue,A\n');
  const result = validate({ catalogPath: catalog, workbookPath: work });
  assert.equal(result.workbookFound, true);
  assert.equal(result.workbookFilled, true);
  assert.equal(result.warnings.length, 0);
});

test('isWorkbookFilled: only blank rows => false', () => {
  assert.equal(isWorkbookFilled([',,', ',,']), false);
  assert.equal(isWorkbookFilled(['fue, FUE', '']), true);
});
