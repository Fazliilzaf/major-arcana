'use strict';

/* Svarstudio inline live-preview ("Så här blir mailet"). Rent presentationslager
 * i konversationer-bottom-actions.js: renderLivePreview() speglar mottagare/
 * mailbox/ämne/body och uppdateras på input. Rör INTE sändkedjan — send-låset
 * (evaluateRecipient) anropas fortfarande. Låser strukturen mot regression. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../../public/konversationer-bottom-actions.js'),
  'utf8'
);
const css = fs.readFileSync(path.join(__dirname, '../../public/konversationer.html'), 'utf8');

test('live-preview: renderLivePreview finns och speglar state', () => {
  assert.match(source, /function renderLivePreview\(\)/);
  assert.match(source, /class: 'wb-live-preview'/);
  assert.match(source, /Så här blir mailet/);
  // speglar mottagare, mailbox, ämne och body
  assert.match(source, /lpTo\.textContent = cleanText\(recipientInput\.value\)/);
  assert.match(source, /lpSubject\.textContent = state\.subject/);
  assert.match(source, /lpBody\.textContent = state\.body/);
});

test('live-preview: uppdateras på editor-, ämnes- och signatur-ändring', () => {
  // body-input uppdaterar både ordräknare och preview
  assert.match(source, /wordCount\.textContent =[\s\S]*?renderLivePreview\(\);/);
  // ämnes-input
  assert.match(source, /state\.subject = e\.target\.value;\s*renderLivePreview\(\);/);
});

test('live-preview: rör inte sändkedjan — evaluateRecipient anropas fortfarande', () => {
  // Mottagar-input triggar fortfarande send-lås-utvärderingen
  assert.match(source, /oninput: \(\) => \{\s*evaluateRecipient\(\);\s*renderLivePreview\(\);/);
});

test('live-preview: CSS finns i konversationer.html', () => {
  assert.match(css, /\.wb-live-preview \{/);
  assert.match(css, /\.wb-lp-body \{/);
});
