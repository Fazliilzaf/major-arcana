'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('V11 parity check exempts the established Studio accent token', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/verify-v11-paritet.js'),
    'utf8'
  );

  assert.match(source, /cssWithoutStudioAccent/);
  assert.match(source, /--v9-accent-studio/);
  assert.match(source, /pat\.test\(cssWithoutStudioAccent\)/);
});
