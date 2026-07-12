'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'drive-import-review.js'),
  'utf8'
);

test('Drive Import Review visar odaterad restbucket read-only via owner-preview', () => {
  assert.match(source, /Odaterade Drive-filer kvar/);
  assert.match(source, /includeReviewDetails: true/);
  assert.match(source, /const preview = body\.preview \|\| \{\}/);
  assert.match(source, /calendarBucketClear === false/);
  assert.match(source, /item\.documentDateSource === 'none'/);
  assert.doesNotMatch(source, /INTERNALIZE ASSETS/);
});
