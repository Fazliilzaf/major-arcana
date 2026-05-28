'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDocumentLibrary,
  isAllowedDocPath,
  getDocContent,
} = require('../../src/ops/contextualDocs');

test('document library catalogs every repo doc, grouped by segment', async () => {
  const lib = await getDocumentLibrary();
  assert.ok(lib.totalDocuments >= 100, `expected many docs, got ${lib.totalDocuments}`);
  assert.ok(Array.isArray(lib.segments) && lib.segments.length >= 5);
  const ids = lib.segments.map((s) => s.sectionId);
  assert.ok(ids.includes('strategy'));
  assert.ok(ids.includes('ops'));
  // Sum of per-segment counts equals the total.
  const sum = lib.segments.reduce((n, s) => n + s.documents.length, 0);
  assert.equal(sum, lib.totalDocuments);
  for (const seg of lib.segments) {
    for (const doc of seg.documents) {
      assert.ok(doc.path && doc.title, 'doc has path + title');
      assert.match(doc.path, /\.md$/i);
    }
  }
});

test('isAllowedDocPath allows docs + top-level md, blocks traversal/absolute/non-md', () => {
  assert.equal(isAllowedDocPath('docs/strategy/x.md'), true);
  assert.equal(isAllowedDocPath('README.md'), true);
  assert.equal(isAllowedDocPath('../../etc/passwd'), false);
  assert.equal(isAllowedDocPath('docs/../server.js'), false);
  assert.equal(isAllowedDocPath('/etc/hosts'), false);
  assert.equal(isAllowedDocPath('docs/x.txt'), false);
  assert.equal(isAllowedDocPath(''), false);
});

test('getDocContent refuses path traversal', async () => {
  const result = await getDocContent('../package.json');
  assert.equal(result.ok, false);
});
