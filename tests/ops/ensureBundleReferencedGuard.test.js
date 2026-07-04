'use strict';

/* Regression: bin/ensure-bundle.js måste validera de bundle-filer som index.html
 * FAKTISKT refererar — inte bara latest.json. Annars kan index.html peka på en
 * saknad/stale hash (404) och kundvyn faller till scaffold-läget även när
 * latest.json-filerna finns. Detta test låser att parsern läser index.html:s
 * referenser korrekt. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { referencedBundleFiles, expectedBundleFiles } = require('../../bin/ensure-bundle.js');
const INDEX_HTML = path.resolve(__dirname, '../../public/major-arcana-preview/index.html');

test('ensure-bundle exponerar referens-validering (körs inte som bieffekt av require)', () => {
  assert.equal(typeof referencedBundleFiles, 'function');
  assert.equal(typeof expectedBundleFiles, 'function');
});

test('referencedBundleFiles hittar index.html:s faktiska bundle-referenser', () => {
  const refs = referencedBundleFiles();
  assert.ok(Array.isArray(refs) && refs.length > 0, 'inga bundle-referenser hittades i index.html');
  assert.ok(
    refs.some((f) => /^app\.bundle\.staff-core\.[a-f0-9]+\.min\.js$/.test(f)),
    'saknar staff-core-referens'
  );
  assert.ok(
    refs.some((f) => /^app\.bundle\.[a-f0-9]+\.min\.js$/.test(f)),
    'saknar full-bundle-referens'
  );
});

test('referencedBundleFiles matchar exakt de app.bundle-hasharna i index.html', () => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const inHtml = new Set(
    html.match(/app\.bundle(?:\.staff-core|\.staff-deferred)?\.[a-f0-9]+\.min\.js/g) || []
  );
  const refs = new Set(referencedBundleFiles());
  assert.deepEqual([...refs].sort(), [...inHtml].sort());
});
