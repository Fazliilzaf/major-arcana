'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  listLiveRegistryIds,
  liveDocumentExists,
  resolveLiveDocumentRelativePath,
  buildLiveManifest,
  OFFERT_SLUG,
} = require('../../src/ops/patientDocumentLiveRegistry');

test('live registry covers all 36 catalog types', () => {
  const ids = listLiveRegistryIds();
  assert.equal(ids.length, 36);
});

test('every registry resolves to an on-disk final-demo html', () => {
  const ids = listLiveRegistryIds();
  for (const registryId of ids) {
    if (OFFERT_SLUG[registryId]) {
      assert.ok(liveDocumentExists(registryId, { phase: 5 }), `${registryId} phase 5 saknas`);
      assert.ok(liveDocumentExists(registryId, { phase: 7 }), `${registryId} phase 7 saknas`);
      continue;
    }
    assert.ok(liveDocumentExists(registryId), `${registryId} saknar live HTML`);
    assert.ok(resolveLiveDocumentRelativePath(registryId), `${registryId} saknar mapping`);
  }
});

test('offert_tp steg7 uses v6 kundkort demo', () => {
  assert.equal(
    resolveLiveDocumentRelativePath('offert_tp', { phase: 7 }),
    'steg7-v6-kundkort-final-demo.html'
  );
});

test('buildLiveManifest marks all documents existing', () => {
  const manifest = buildLiveManifest();
  assert.equal(manifest.length, 36);
  const missing = manifest.filter((row) => !row.exists);
  assert.deepEqual(missing, []);
});
