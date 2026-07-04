'use strict';

/* PR 30 — cco-no-show-v3 ("Uteblivna besök") får CCO-ytans bottom action-bar.
 * Denna vy hade redan aux-foundationen men saknade den proportionerliga baren
 * som resten av CCO-vyerna. Bar-only: vyns högerkolumn (#detail = No-show-
 * historik) ÄR redan ett per-patient-operatörsstöd, så inget dubblerande
 * kundkontext-kort läggs till. Baren döljs under 601px där den mobila botnav:en
 * tar över, postMess:ar data-action till förälder-admin#cco. Ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const nsPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-no-show-v3.html');
const ns = fs.readFileSync(nsPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

test('PR30: no-show-v3 har bottom action-baren med de 7 actionerna', () => {
  assert.match(ns, /class="thread-bottom-actions"/);
  for (const a of [
    'svarstudio',
    'bokningsyta',
    'smart-anteckning',
    'kalender',
    'klar',
    'senare',
    'reopen',
  ]) {
    assert.match(ns, new RegExp('data-action="' + a + '"'), a + ' saknas');
  }
});

test('PR30: baren är den kompakta proportionen (36px, 12px)', () => {
  const block = ns.match(/\.thread-bottom-actions \.action-btn\s*\{[^}]*\}/);
  assert.ok(block, 'action-btn-block saknas');
  assert.match(block[0], /min-height:\s*36px/);
  assert.match(block[0], /700 12px/);
});

test('PR30: bar-only — inget dubblerande kundkontext-kort (högerkolumnen är redan kundkontext)', () => {
  assert.doesNotMatch(ns, /class="kk-card"/);
});

test('PR30: baren döljs under 601px (botnav tar över)', () => {
  assert.match(
    compact(ns),
    /@media \(max-width: 600px\) \{ \.thread-bottom-actions \{ display: none; \}/
  );
});

test('PR30: knapparna postMess:ar till föräldern (origin-validerat)', () => {
  assert.match(ns, /button\[data-action\]/);
  assert.match(ns, /window\.parent && window\.parent !== window/);
  assert.match(
    compact(ns),
    /postMessage\( \{ type: 'cco:panel:action', action: action \}, window\.location\.origin \)/
  );
});

test('PR30: avsiktlig visuell ändring', () => {
  assert.match(ns, /name="visual-regression" content="intentional-change"/);
});

test('PR30: ingen live-send', () => {
  assert.doesNotMatch(ns, /sendMail\(|graphSend|messages\/send/);
});
