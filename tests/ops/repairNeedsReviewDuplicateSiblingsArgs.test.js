'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  argValue,
  hasFlag,
  parseNonNegativeInteger,
} = require('../../scripts/repair-needs-review-duplicate-siblings');

test('repair CLI parses documented equals and separated flag values', () => {
  assert.equal(argValue('--limit', ['--limit=10']), '10');
  assert.equal(argValue('--expectedCount', ['--expectedCount', '40482']), '40482');
  assert.equal(hasFlag('--commit', ['--limit=10', '--commit']), true);
});

test('repair CLI rejects missing, conflicting and non-integer safety values', () => {
  assert.throws(() => argValue('--limit', ['--limit']), /saknar värde/);
  assert.throws(() => argValue('--limit', ['--limit=10', '--limit', '20']), /motstridiga värden/);
  assert.throws(() => parseNonNegativeInteger('10.5', '--limit'), /heltal/);
  assert.throws(() => parseNonNegativeInteger('-1', '--expectedCount'), /heltal/);
});
