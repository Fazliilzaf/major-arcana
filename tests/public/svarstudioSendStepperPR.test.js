'use strict';

/* Svarstudio 4-stegs sändstege (Utkast → Granskad → Godkänd → Skickad).
 * Rent presentationslager i konversationer-bottom-actions.js: renderStepper()
 * speglar draft-status, ändrar INGEN sändlogik. Steget uppdateras när saveDraft
 * transitionerar. Låser strukturen + att sändkedjan är orörd. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../../public/konversationer-bottom-actions.js'),
  'utf8'
);
const css = fs.readFileSync(path.join(__dirname, '../../public/konversationer.html'), 'utf8');

test('stepper: fyra steg i rätt ordning', () => {
  assert.match(source, /class: 'wb-send-stepper'/);
  assert.match(source, /function renderStepper\(status\)/);
  for (const label of ['Utkast', 'Granskad', 'Godkänd', 'Skickad']) {
    assert.match(source, new RegExp("label: '" + label + "'"));
  }
  assert.match(source, /'draft', 'needs_approval', 'approved', 'sent'/);
});

test('stepper: uppdateras när draft transitionerar (rör inte sändlogiken)', () => {
  // renderStepper anropas efter lyckad transition, före return true
  assert.match(source, /renderStepper\(targetStatus \|\| 'draft'\);\s*return true;/);
});

test('stepper: live-utskick markeras avstängt', () => {
  assert.match(source, /Live-utskick är avstängt/);
  assert.match(source, /class: 'wb-sstep-lock'/);
});

test('stepper: CSS finns i konversationer.html', () => {
  assert.match(css, /\.wb-send-stepper \{/);
  assert.match(css, /\.wb-sstep\.is-active \.wb-sdot \{/);
  assert.match(css, /\.wb-sstep\.is-done \.wb-sdot \{/);
});
