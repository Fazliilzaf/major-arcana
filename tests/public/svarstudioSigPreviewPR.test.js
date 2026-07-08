'use strict';

/* Svarstudio signatur-live-render. renderSigPreview() visar vald signatur
 * (SIGNATURES[signatureId].text — de riktiga v9-uppgifterna) direkt i
 * composern och uppdateras när signatur väljs. Rent presentationslager. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../../public/konversationer-bottom-actions.js'),
  'utf8'
);
const css = fs.readFileSync(path.join(__dirname, '../../public/konversationer.html'), 'utf8');

test('sig-preview: renderSigPreview visar vald signaturs text', () => {
  assert.match(source, /function renderSigPreview\(\)/);
  assert.match(source, /class: 'wb-sig-preview'/);
  assert.match(source, /sigBodyEl\.textContent = sig \? sig\.text :/);
  assert.match(source, /sigWhoEl\.textContent = sig \? sig\.label :/);
});

test('sig-preview: uppdateras när signatur väljs', () => {
  assert.match(source, /renderLivePreview\(\);\s*renderSigPreview\(\);/);
});

test('sig-preview: CSS finns i konversationer.html', () => {
  assert.match(css, /\.wb-sig-preview \{/);
  assert.match(css, /\.wb-sig-body \{/);
});
