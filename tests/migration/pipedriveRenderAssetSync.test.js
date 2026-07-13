'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mergePipedrivePatchIntoStore,
  extractPipedriveItems,
} = require('../../scripts/lib/pipedriveRenderAssetSync');

test('extractPipedriveItems returns only pipedrive_import', () => {
  const items = extractPipedriveItems({
    items: {
      a: { sourceSystem: 'pipedrive_import', id: 'a' },
      b: { sourceSystem: 'drive', id: 'b' },
    },
  });
  assert.equal(Object.keys(items).length, 1);
  assert.ok(items.a);
});

test('mergePipedrivePatchIntoStore merges without dropping other sources', () => {
  const store = {
    schemaVersion: 1,
    items: {
      keep: { sourceSystem: 'drive', id: 'keep' },
      old: { sourceSystem: 'pipedrive_import', id: 'old', status: 'NEEDS_REVIEW' },
    },
  };
  const patch = {
    items: {
      old: { sourceSystem: 'pipedrive_import', id: 'old', status: 'VISIBLE_ON_PATIENT_CARD' },
      neu: { sourceSystem: 'pipedrive_import', id: 'neu' },
    },
  };
  const { store: merged, merged: count } = mergePipedrivePatchIntoStore(store, patch);
  assert.equal(count, 2);
  assert.equal(merged.items.keep.sourceSystem, 'drive');
  assert.equal(merged.items.old.status, 'VISIBLE_ON_PATIENT_CARD');
  assert.ok(merged.items.neu);
});
