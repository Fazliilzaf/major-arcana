'use strict';

/* PR 27 — Signaturer blir en fullständig CCO-vy (första av de tvärgående
 * listorna): Konversationers kundkontext-kort (namespaced .kk-*) överst i
 * detaljkolumnen — speglar den prioriterade signeringsförfrågan (en kund) — plus
 * samma proportionerliga bottom action-bar (36px, 7 knappar). Baren döljs under
 * 601px där den mobila botnav:en tar över. Kortets actions + baren postMess:ar
 * data-action till förälder-admin#cco. Befintlig cco:signaturer:context-mottagare
 * kvar. Ingen live-send. Ingen ny design. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const sigPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-signaturer-v3.html');
const sig = fs.readFileSync(sigPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

test('PR27: Signaturer har kundkontext-kortet (namespaced .kk-)', () => {
  assert.match(sig, /class="kk-card"/);
  assert.match(sig, /class="kk-kicker">Kundkontext/);
  assert.match(sig, /class="kk-title">Operatörsstöd/);
  assert.match(sig, /class="kk-grid"/);
  assert.match(sig, /class="kk-ai"/);
});

test('PR27: kortets actions är wire:ade via data-action', () => {
  assert.match(sig, /class="kk-pill kk-pill--ai" type="button" data-action="svarstudio"/);
  assert.match(sig, /class="kk-pill" type="button" data-action="bokningsyta"/);
  assert.match(sig, /class="kk-pill" type="button" data-action="patienthub"/);
  assert.match(sig, /class="kk-pill kk-pill--success" type="button" data-action="klar"/);
});

test('PR27: Signaturer har bottom action-baren med de 7 actionerna', () => {
  assert.match(sig, /class="thread-bottom-actions"/);
  for (const a of [
    'svarstudio',
    'bokningsyta',
    'smart-anteckning',
    'kalender',
    'klar',
    'senare',
    'reopen',
  ]) {
    assert.match(sig, new RegExp('data-action="' + a + '"'), a + ' saknas');
  }
});

test('PR27: baren är den kompakta proportionen (36px, 12px)', () => {
  const block = sig.match(/\.thread-bottom-actions \.action-btn\s*\{[^}]*\}/);
  assert.ok(block, 'action-btn-block saknas');
  assert.match(block[0], /min-height:\s*36px/);
  assert.match(block[0], /700 12px/);
});

test('PR27: baren döljs under 601px (botnav tar över, ingen dubbel bar)', () => {
  assert.match(
    compact(sig),
    /@media \(max-width: 600px\) \{ \.thread-bottom-actions \{ display: none; \}/
  );
});

test('PR27: knapparna postMess:ar till föräldern (origin-validerat)', () => {
  assert.match(sig, /button\[data-action\]/);
  assert.match(sig, /window\.parent && window\.parent !== window/);
  assert.match(
    compact(sig),
    /postMessage\( \{ type: 'cco:panel:action', action: action \}, window\.location\.origin \)/
  );
});

test('PR27: befintlig cco:signaturer:context-mottagare kvar', () => {
  assert.match(sig, /data\.type === 'cco:signaturer:context'/);
});

test('PR27: ingen live-send', () => {
  assert.doesNotMatch(sig, /sendMail\(|graphSend|messages\/send/);
});
