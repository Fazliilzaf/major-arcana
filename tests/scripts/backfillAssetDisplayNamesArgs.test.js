'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  needsBackfill,
  looksTechnical,
} = require('../../scripts/backfill-asset-display-names');

test('parseArgs defaults to dry-run', () => {
  const args = parseArgs([]);
  assert.equal(args.dryRun, true);
  assert.equal(args.commit, false);
  assert.equal(args.limit, 0);
  assert.equal(args.offset, 0);
  assert.equal(args.batchSize, 100);
});

test('parseArgs parses commit and limits', () => {
  const args = parseArgs([
    '--commit',
    '--limit',
    '250',
    '--offset',
    '10',
    '--batch-size',
    '50',
    '--patient-ids',
    'p1,p2',
    '--categories',
    'journal,consent',
  ]);
  assert.equal(args.dryRun, false);
  assert.equal(args.commit, true);
  assert.equal(args.limit, 250);
  assert.equal(args.offset, 10);
  assert.equal(args.batchSize, 50);
  assert.deepEqual([...args.patientIds], ['p1', 'p2']);
  assert.deepEqual([...args.categories], ['journal', 'consent']);
});

test('looksTechnical detects raw filenames', () => {
  assert.equal(looksTechnical('', 'foo.pdf'), true);
  assert.equal(looksTechnical('Journal-PRP-Anna-1234.pdf', 'Journal-PRP-Anna-1234.pdf'), true);
  assert.equal(looksTechnical('IMG_20240524_001.jpg', 'IMG_20240524_001.jpg'), true);
  assert.equal(looksTechnical('Friskfo??rsa??kran-Anna-1234.pdf', null), true);
  assert.equal(looksTechnical('2024-05-24 · FUE Operation · Journal · signerad', null), false);
  assert.equal(looksTechnical('Hälsodeklaration', null), false);
});

test('needsBackfill respects manual naming', () => {
  assert.equal(needsBackfill({ displayName: 'Journal-Anna-1234.pdf', patientId: 'p1' }, {}), true);
  assert.equal(
    needsBackfill({ displayName: 'Hälsodeklaration', namingStatus: 'manual', patientId: 'p1' }, {}),
    false
  );
  assert.equal(needsBackfill({ displayName: '', patientId: 'p1' }, {}), true);
  assert.equal(
    needsBackfill({ displayName: '', deletedAt: '2024-01-01', patientId: 'p1' }, {}),
    false
  );
});
