'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveTimelineSortKey,
  resolveTimelineTs,
  compareTimelineNewestFirst,
  pickNewestRecord,
} = require('../../src/ops/ccoAssetTimelineSort');

describe('ccoAssetTimelineSort', () => {
  it('prefers captureDateTime over documentDate', () => {
    const key = resolveTimelineSortKey({
      captureDateTime: '2024:03:15 14:30:00',
      documentDate: '2020-01-01',
    });
    assert.equal(key, '2024-03-15T14:30:00');
  });

  it('falls back through documentDate and importedAt', () => {
    assert.equal(
      resolveTimelineSortKey({ documentDate: '2023-06-02', importedAt: '2024-01-01T10:00:00Z' }),
      '2023-06-02T00:00:00'
    );
    const importedKey = resolveTimelineSortKey({
      importedAt: '2024-01-01T10:00:00Z',
      indexedAt: '2025-01-01',
    });
    assert.ok(importedKey.startsWith('2024-01-01T10:00:00'));
  });

  it('sorts newest first', () => {
    const rows = [
      { id: 'a', documentDate: '2020-01-01' },
      { id: 'b', captureDateTime: '2024:01:02 08:00:00' },
      { id: 'c', importedAt: '2022-05-01T12:00:00Z' },
    ].sort(compareTimelineNewestFirst);
    assert.deepEqual(
      rows.map((r) => r.id),
      ['b', 'c', 'a']
    );
  });

  it('pickNewestRecord respects predicate', () => {
    const picked = pickNewestRecord(
      [
        { id: '1', documentDate: '2024-01-01', kind: 'hd' },
        { id: '2', documentDate: '2025-01-01', kind: 'fc' },
      ],
      (row) => row.kind === 'hd'
    );
    assert.equal(picked.id, '1');
    assert.ok(resolveTimelineTs(picked) > resolveTimelineTs({ documentDate: '2024-01-01' }) - 1);
  });
});
