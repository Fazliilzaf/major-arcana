'use strict';

/* PR 26 — No-show blir en fullständig CCO-vy (sista kund/konversations-vyn i
 * utrullningen): Konversationers kundkontext-kort (namespaced .kk-*) överst i
 * högerkolumnen + samma proportionerliga bottom action-bar (36px, 7 knappar) som
 * Senare/Smart/Dossier. Kortets actions + baren postMess:ar data-action till
 * förälder-admin#cco (runCcoAction). Befintlig cco:noshow:context-mottagare kvar.
 * Ingen live-send. Ingen ny design. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const noshowPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-no-show-ai-v3.html');
const noshow = fs.readFileSync(noshowPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── Kundkontext-kortet ───────────────────────────────────────────────────────

test('PR26: No-show har kundkontext-kortet (namespaced .kk-)', () => {
  assert.match(noshow, /class="kk-card"/);
  assert.match(noshow, /class="kk-kicker">Kundkontext/);
  assert.match(noshow, /class="kk-title">Operatörsstöd/);
  assert.match(noshow, /class="kk-grid"/);
  assert.match(noshow, /class="kk-ai"/);
});

test('PR26: kortets actions är wire:ade via data-action', () => {
  assert.match(noshow, /class="kk-pill kk-pill--ai" type="button" data-action="svarstudio"/);
  assert.match(noshow, /class="kk-pill" type="button" data-action="bokningsyta"/);
  assert.match(noshow, /class="kk-pill" type="button" data-action="patienthub"/);
  assert.match(noshow, /class="kk-pill kk-pill--success" type="button" data-action="klar"/);
});

// ── Bottom action-bar (proportionerlig) ──────────────────────────────────────

test('PR26: No-show har bottom action-baren med de 7 actionerna', () => {
  assert.match(noshow, /class="thread-bottom-actions"/);
  for (const a of [
    'svarstudio',
    'bokningsyta',
    'smart-anteckning',
    'kalender',
    'klar',
    'senare',
    'reopen',
  ]) {
    assert.match(noshow, new RegExp('data-action="' + a + '"'), a + ' saknas');
  }
});

test('PR26: baren är den kompakta proportionen (36px, 12px)', () => {
  const block = noshow.match(/\.thread-bottom-actions \.action-btn\s*\{[^}]*\}/);
  assert.ok(block, 'action-btn-block saknas');
  assert.match(block[0], /min-height:\s*36px/);
  assert.match(block[0], /700 12px/);
});

test('PR26: knapparna postMess:ar till föräldern (origin-validerat)', () => {
  assert.match(noshow, /button\[data-action\]/);
  assert.match(noshow, /window\.parent && window\.parent !== window/);
  assert.match(
    compact(noshow),
    /postMessage\( \{ type: 'cco:panel:action', action: action \}, window\.location\.origin \)/
  );
});

// ── Avsiktlig visuell ändring (tripwire skippar) ─────────────────────────────

test('PR26: No-show markerad som avsiktlig visuell ändring', () => {
  assert.match(noshow, /name="visual-regression" content="intentional-change"/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR26: befintlig cco:noshow:context-mottagare kvar', () => {
  assert.match(noshow, /data\.type === 'cco:noshow:context'/);
});

test('PR26: cco-polish dev-chrome lyfts ovanför baren (ingen överlappning)', () => {
  // theme-toggle + Rapportera + Ångra flyttas upp så de inte täcker action-baren.
  const block = noshow.match(/\.theme-toggle,\s*\.feedback-btn,\s*\.undo-btn\s*\{[^}]*\}/);
  assert.ok(block, 'chrome-lift-override saknas');
  assert.match(block[0], /bottom:\s*62px\s*!important/);
});

test('PR26: ingen live-send', () => {
  assert.doesNotMatch(noshow, /sendMail\(|graphSend|messages\/send/);
});
