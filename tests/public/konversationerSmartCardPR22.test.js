'use strict';

/* PR 22 — Smart anteckning blir en fullständig CCO-vy: Konversationers
 * kundkontext-kort (namespaced .kk-*) överst i högerkolumnen + samma bottom
 * action-bar (7 knappar) som Senare. Kortets actions + baren postMess:ar
 * data-action till förälder-admin#cco (runCcoAction). Föräldern får 'patienthub'
 * (Kunddossiér) i runCcoAction. Ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const smartPath = path.join(
  repoRoot,
  'public',
  'major-arcana-preview',
  'cco-smart-anteckning-v3.html'
);

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const smart = fs.readFileSync(smartPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── Kundkontext-kortet ───────────────────────────────────────────────────────

test('PR22: smart-anteckning har kundkontext-kortet (namespaced .kk-)', () => {
  assert.match(smart, /class="kk-card"/);
  assert.match(smart, /class="kk-meta">Kundkontext · operatörsstöd/);
  assert.match(smart, /class="kk-chips"/);
  assert.match(smart, /class="kk-chip/);
  assert.match(smart, /class="kk-ai"/);
});

test('PR22: kortets actions är wire:ade via data-action', () => {
  // Attribut-baserat (robust mot prettier-radbrytning av knapp-texten).
  assert.match(smart, /class="kk-pill kk-pill--ai" type="button" data-action="svarstudio"/);
  assert.match(smart, /class="kk-pill" type="button" data-action="bokningsyta"/);
  assert.match(smart, /class="kk-pill" type="button" data-action="patienthub"/);
  assert.match(smart, /class="kk-pill kk-pill--success" type="button" data-action="klar"/);
});

// ── Bottom action-bar ────────────────────────────────────────────────────────

test('PR22: smart-anteckning har bottom action-baren med de 7 actionerna', () => {
  assert.match(smart, /class="thread-bottom-actions"/);
  for (const a of [
    'svarstudio',
    'bokningsyta',
    'smart-anteckning',
    'kalender',
    'klar',
    'senare',
    'reopen',
  ]) {
    assert.match(smart, new RegExp('data-action="' + a + '"'), a + ' saknas');
  }
});

test('PR22: knapparna postMess:ar till föräldern (origin-validerat)', () => {
  assert.match(smart, /button\[data-action\]/);
  assert.match(smart, /window\.parent && window\.parent !== window/);
  assert.match(
    compact(smart),
    /postMessage\( \{ type: 'cco:panel:action', action: action \}, window\.location\.origin \)/
  );
});

// ── Föräldern kör Kunddossiér (patienthub) ───────────────────────────────────

test('PR22: runCcoAction hanterar patienthub (Kunddossiér) och signaturer', () => {
  assert.match(source, /action === 'patienthub'\) openPatientHub\(\)/);
  assert.match(source, /action === 'signaturer'\) openSignaturer\(\)/);
});

// ── Avsiktlig visuell ändring (tripwire skippar) ─────────────────────────────

test('PR22: smart-anteckning markerad som avsiktlig visuell ändring', () => {
  assert.match(smart, /name="visual-regression" content="intentional-change"/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR22: ingen live-send', () => {
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR22: konversationer.html cache-bustar efter smart-kort/bar', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260708b-dossier/);
});
