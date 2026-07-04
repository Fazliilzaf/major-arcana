'use strict';

/* PR 24 — Dossier (patient-hub) blir en fullständig CCO-vy: Konversationers
 * kundkontext-kort (namespaced .kk-*) överst i högerkolumnen + samma bottom
 * action-bar (7 knappar) som Senare/Smart anteckning. Kortets actions + baren
 * postMess:ar data-action till förälder-admin#cco (runCcoAction). Ingen
 * live-send. Ingen ny design (återanvänder Konversationers eget språk). */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const hubPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-patient-hub-v3.html');
const hub = fs.readFileSync(hubPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── Kundkontext-kortet ───────────────────────────────────────────────────────

test('PR24: Dossier har kundkontext-kortet (namespaced .kk-)', () => {
  assert.match(hub, /class="kk-card"/);
  assert.match(hub, /class="kk-kicker">Kundkontext/);
  assert.match(hub, /class="kk-title">Operatörsstöd/);
  assert.match(hub, /class="kk-grid"/);
  assert.match(hub, /class="kk-ai"/);
});

test('PR24: kortets actions är wire:ade via data-action', () => {
  assert.match(hub, /class="kk-pill kk-pill--ai" type="button" data-action="svarstudio"/);
  assert.match(hub, /class="kk-pill" type="button" data-action="bokningsyta"/);
  assert.match(hub, /class="kk-pill" type="button" data-action="patienthub"/);
  assert.match(hub, /class="kk-pill kk-pill--success" type="button" data-action="klar"/);
});

// ── Bottom action-bar ────────────────────────────────────────────────────────

test('PR24: Dossier har bottom action-baren med de 7 actionerna', () => {
  assert.match(hub, /class="thread-bottom-actions"/);
  for (const a of [
    'svarstudio',
    'bokningsyta',
    'smart-anteckning',
    'kalender',
    'klar',
    'senare',
    'reopen',
  ]) {
    assert.match(hub, new RegExp('data-action="' + a + '"'), a + ' saknas');
  }
});

test('PR24: knapparna postMess:ar till föräldern (origin-validerat)', () => {
  assert.match(hub, /button\[data-action\]/);
  assert.match(hub, /window\.parent && window\.parent !== window/);
  assert.match(
    compact(hub),
    /postMessage\( \{ type: 'cco:panel:action', action: action \}, window\.location\.origin \)/
  );
});

// ── Avsiktlig visuell ändring (tripwire skippar) ─────────────────────────────

test('PR24: Dossier markerad som avsiktlig visuell ändring', () => {
  assert.match(hub, /name="visual-regression" content="intentional-change"/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR24: ingen live-send', () => {
  assert.doesNotMatch(hub, /sendMail\(|graphSend|messages\/send/);
});

test('PR24: befintlig cco:patienthub:context-mottagare kvar', () => {
  assert.match(hub, /data\.type === 'cco:patienthub:context'/);
});
