'use strict';

/* PR 16 — full flik-rad med ALLA 7 paneler, i ALLA paneler (max frihet). Utökar
 * PR 15 (4 flikar i 4 paneler) med Lägg senare / Notiser / Skickat/kö — både som
 * flikar i raden och genom att de tre panelerna nu visar raden. Ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(repoRoot, 'public', 'konversationer-bottom-actions.js'),
  'utf8'
);
const html = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

test('PR16: panelTabs listar alla 7 paneler', () => {
  assert.match(source, /key: 'svarstudio', label: 'Svarstudio'/);
  assert.match(source, /key: 'bokning', label: 'Bokning'/);
  assert.match(source, /key: 'smart', label: 'Anteckning'/);
  assert.match(source, /key: 'kalender', label: 'Kalender'/);
  assert.match(source, /key: 'senare', label: 'Senare', open: \(\) => openSenarePanel\(\)/);
  assert.match(source, /key: 'notiser', label: 'Notiser', open: \(\) => openNotiser\(\)/);
  assert.match(source, /key: 'skickat', label: 'Skickat', open: \(\) => openSkickat\(\)/);
});

test('PR16: alla 7 paneler skickar med flik-raden', () => {
  for (const key of [
    'svarstudio',
    'bokning',
    'smart',
    'kalender',
    'senare',
    'notiser',
    'skickat',
  ]) {
    assert.match(
      source,
      new RegExp("tabs: panelTabs\\('" + key + "'\\)"),
      key + ' saknar flik-raden'
    );
  }
});

test('PR16: cache-bust bumpad', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260708c-svarstudio-cache/);
});
