'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('../../scripts/sanera-clientobooking-dubbletter');

test('parseArgs defaults to dry-run, ingen tenant-filtrering', () => {
  const args = parseArgs([]);
  assert.equal(args.dryRun, true);
  assert.equal(args.commit, false);
  assert.equal(args.tenantId, '');
});

test('parseArgs --commit stänger av dry-run', () => {
  const args = parseArgs(['--commit']);
  assert.equal(args.dryRun, false);
  assert.equal(args.commit, true);
});

test('parseArgs --tenant-id filtrerar till en tenant', () => {
  const args = parseArgs(['--dry-run', '--tenant-id', 'hair_tp']);
  assert.equal(args.tenantId, 'hair_tp');
  assert.equal(args.dryRun, true);
});

test('parseArgs --commit efter --dry-run vinner (commit vinner alltid)', () => {
  const args = parseArgs(['--dry-run', '--commit']);
  assert.equal(args.commit, true);
  assert.equal(args.dryRun, false);
});
