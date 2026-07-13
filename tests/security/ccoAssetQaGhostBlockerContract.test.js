'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('asset QA cutover gate includes missing canonical blobs', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');

  assert.match(source, /diagnoseGhostVisibleAssets/);
  assert.match(source, /ghostBlobBlockers/);
  assert.match(
    source,
    /cutoverReady:\s*linkOnly === 0 && failed === 0 && ghostBlobBlockers === 0/
  );
});

test('owner diagnosis can return explicit review details', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/ccoPatientMaster.js'),
    'utf8'
  );

  assert.match(source, /includeReviewDetails = req\.body\?\.includeReviewDetails === true/);
  assert.match(source, /maskSamples: !includeReviewDetails/);
});
