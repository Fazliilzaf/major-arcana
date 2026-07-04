'use strict';

/* PR 28 — Notiser får bottom action-baren (bar-only). Notiser är en kategori-
 * översikt över FLERA kunder → inget per-kund-kort (till skillnad från Signaturer/
 * Skickat). Samma proportionerliga bar (36px, 7 knappar), döljs under 601px där
 * den mobila botnav:en tar över. Baren postMess:ar data-action till förälder-
 * admin#cco. Befintlig cco:notiser:context-mottagare kvar. Ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const notiserPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-notiser-v3.html');
const notiser = fs.readFileSync(notiserPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

test('PR28: Notiser har bottom action-baren med de 7 actionerna', () => {
  assert.match(notiser, /class="thread-bottom-actions"/);
  for (const a of [
    'svarstudio',
    'bokningsyta',
    'smart-anteckning',
    'kalender',
    'klar',
    'senare',
    'reopen',
  ]) {
    assert.match(notiser, new RegExp('data-action="' + a + '"'), a + ' saknas');
  }
});

test('PR28: baren är den kompakta proportionen (36px, 12px)', () => {
  const block = notiser.match(/\.thread-bottom-actions \.action-btn\s*\{[^}]*\}/);
  assert.ok(block, 'action-btn-block saknas');
  assert.match(block[0], /min-height:\s*36px/);
  assert.match(block[0], /700 12px/);
});

test('PR28: Notiser är bar-only — inget per-kund-kort (tvärgående lista)', () => {
  assert.doesNotMatch(notiser, /class="kk-card"/);
});

test('PR28: baren döljs under 601px (botnav tar över)', () => {
  assert.match(
    compact(notiser),
    /@media \(max-width: 600px\) \{ \.thread-bottom-actions \{ display: none; \}/
  );
});

test('PR28: knapparna postMess:ar till föräldern (origin-validerat)', () => {
  assert.match(notiser, /button\[data-action\]/);
  assert.match(notiser, /window\.parent && window\.parent !== window/);
  assert.match(
    compact(notiser),
    /postMessage\( \{ type: 'cco:panel:action', action: action \}, window\.location\.origin \)/
  );
});

test('PR28: avsiktlig visuell ändring + kvarvarande context-mottagare', () => {
  assert.match(notiser, /name="visual-regression" content="intentional-change"/);
  assert.match(notiser, /data\.type === 'cco:notiser:context'/);
});

test('PR28: ingen live-send', () => {
  assert.doesNotMatch(notiser, /sendMail\(|graphSend|messages\/send/);
});
