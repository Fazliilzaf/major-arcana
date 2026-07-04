'use strict';

/* PR 29 — Skickat blir en fullständig CCO-vy (sista tvärgående listan): Konversationers
 * kundkontext-kort (namespaced .kk-*) överst i högerkolumnen — speglar det översta
 * kö-utskicket (en kund) — plus samma proportionerliga bottom action-bar (36px, 7
 * knappar). Baren döljs under 601px där den mobila botnav:en tar över. Kortets
 * actions + baren postMess:ar data-action till förälder-admin#cco. Befintlig
 * cco:skickat:context-mottagare kvar. Ingen live-send. Ingen ny design. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const skickatPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-skickat-v3.html');
const skickat = fs.readFileSync(skickatPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

test('PR29: Skickat har kundkontext-kortet (namespaced .kk-)', () => {
  assert.match(skickat, /class="kk-card"/);
  assert.match(skickat, /class="kk-kicker">Kundkontext/);
  assert.match(skickat, /class="kk-title">Operatörsstöd/);
  assert.match(skickat, /class="kk-grid"/);
  assert.match(skickat, /class="kk-ai"/);
});

test('PR29: kortets actions är wire:ade via data-action', () => {
  assert.match(skickat, /class="kk-pill kk-pill--ai" type="button" data-action="svarstudio"/);
  assert.match(skickat, /class="kk-pill" type="button" data-action="bokningsyta"/);
  assert.match(skickat, /class="kk-pill" type="button" data-action="patienthub"/);
  assert.match(skickat, /class="kk-pill kk-pill--success" type="button" data-action="klar"/);
});

test('PR29: Skickat har bottom action-baren med de 7 actionerna', () => {
  assert.match(skickat, /class="thread-bottom-actions"/);
  for (const a of [
    'svarstudio',
    'bokningsyta',
    'smart-anteckning',
    'kalender',
    'klar',
    'senare',
    'reopen',
  ]) {
    assert.match(skickat, new RegExp('data-action="' + a + '"'), a + ' saknas');
  }
});

test('PR29: baren är den kompakta proportionen (36px, 12px)', () => {
  const block = skickat.match(/\.thread-bottom-actions \.action-btn\s*\{[^}]*\}/);
  assert.ok(block, 'action-btn-block saknas');
  assert.match(block[0], /min-height:\s*36px/);
  assert.match(block[0], /700 12px/);
});

test('PR29: baren döljs under 601px (botnav tar över)', () => {
  assert.match(
    compact(skickat),
    /@media \(max-width: 600px\) \{ \.thread-bottom-actions \{ display: none; \}/
  );
});

test('PR29: knapparna postMess:ar till föräldern (origin-validerat)', () => {
  assert.match(skickat, /button\[data-action\]/);
  assert.match(skickat, /window\.parent && window\.parent !== window/);
  assert.match(
    compact(skickat),
    /postMessage\( \{ type: 'cco:panel:action', action: action \}, window\.location\.origin \)/
  );
});

test('PR29: avsiktlig visuell ändring + kvarvarande context-mottagare', () => {
  assert.match(skickat, /name="visual-regression" content="intentional-change"/);
  assert.match(skickat, /data\.type === 'cco:skickat:context'/);
});

test('PR29: ingen live-send introducerad', () => {
  // Vyns egen text nämner mail.live_send som systemkrav, men ingen faktisk
  // sändningskod (sendMail/graphSend/messages/send) får finnas.
  assert.doesNotMatch(skickat, /sendMail\(|graphSend|messages\/send/);
});
