'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'runtime-queue-renderers.js'),
  'utf8'
);

test('runtime queue helpers keep background worklist reads mailbox-scoped', () => {
  assert.match(source, /const __CUSTOMER_DEFAULT_MAILBOXES = \["kons"\]/);
  assert.match(source, /parsed\.slice\(0, 1\)\.map/);
  assert.match(source, /const __MAILBOX_DEFAULTS = \["kons"\]/);
  assert.doesNotMatch(source, /params\.set\("limit", "500"\)/);
  assert.match(source, /params\.set\("limit", "50"\)/);
});
