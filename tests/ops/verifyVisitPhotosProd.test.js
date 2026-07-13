'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('visit-photo prod verifier passes waitForFunction timeout as the third argument', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../scripts/verify-visit-photos-prod.js'),
    'utf8'
  );
  assert.match(
    source,
    /waitForFunction\([\s\S]*?data-v11-rk-besok[\s\S]*?undefined,[\s\S]*?timeout: 120000/
  );
  assert.match(source, /attempts % 6 === 0/);
  assert.match(source, /ensurePatientOpen\(page, patientId\)/);
  assert.match(source, /JSON\.stringify\(lastState \|\| \{\}\)/);
});
