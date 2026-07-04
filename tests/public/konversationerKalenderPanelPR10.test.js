'use strict';

/* PR 10 — "Öppna kalender" i admin#cco → Konversationer går till den riktiga
 * CCO-kalenderytan /kalender.html (INTE cco-kalender-v8.html preview) som panel,
 * scoped till vald tråds kund. Kontext skickas via samma origin-validerade
 * postMessage-mönster som Smart anteckning v3 / bokning. Ingen live-send,
 * ingen ny design.
 *
 * Tester: wiring/guard (källkod) + att /kalender.html tar emot kontexten. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const kalenderPath = path.join(repoRoot, 'public', 'kalender.html');

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const kalender = fs.readFileSync(kalenderPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── "Öppna kalender" → riktig /kalender.html (inte v8) ───────────────────────

test('PR10: Öppna kalender pekar på /kalender.html (inte v8-preview)', () => {
  assert.match(source, /const KALENDER_SRC = '\/kalender\.html'/);
  assert.doesNotMatch(source, /cco-kalender-v8/);
  assert.match(source, /function openKalender\(\)/);
  assert.match(compact(source), /const src = KALENDER_SRC \+/);
  assert.match(source, /action === 'kalender'\) openKalender\(\)/);
});

test('PR10: kalendern öppnas i iframe-panel (openModal wide)', () => {
  assert.match(source, /title: 'CCO Kalender'/);
  assert.match(compact(source), /openModal\(\{ title: 'Öppna kalender', wide: true,/);
});

test('PR10: kontexten byggs från vald live-tråd och skickas via postMessage', () => {
  assert.match(source, /const context = buildSmartAnteckningContext\(\);/);
  assert.match(source, /frame\.addEventListener\('load'/);
  assert.match(
    compact(source),
    /postMessage\( \{ type: 'cco:kalender:context', context \}, window\.location\.origin \)/
  );
});

test('PR10: gamla demo-kalendermodalen är borttagen', () => {
  assert.doesNotMatch(source, /Uppföljning — Karl L\. \(Fazli\)/);
  assert.doesNotMatch(source, /4 bokningar idag · 0 no-shows/);
});

// ── /kalender.html tar emot kontexten ────────────────────────────────────────

test('PR10: kalender.html lyssnar på kontext-postMessage, validerar origin', () => {
  assert.match(kalender, /cco:kalender:context/);
  assert.match(kalender, /event\.origin !== window\.location\.origin/);
  assert.match(kalender, /window\.CCO_KALENDER_CONTEXT = context/);
});

test('PR10: kalender scopar till vald kund via befintlig global sökning', () => {
  assert.match(kalender, /function applyContext\(context\)/);
  assert.match(kalender, /getElementById\('globalSearchInput'\)/);
  assert.match(kalender, /search\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR10: bokning v3 + Smart anteckning v3 + send-lås orörda, ingen live-send', () => {
  assert.match(source, /const BOOKING_SRC = '\/major-arcana-preview\/cco-booking-wizard-v3\.html'/);
  assert.match(
    source,
    /const SMART_ANTECKNING_V3_SRC = '\/major-arcana-preview\/cco-smart-anteckning-v3\.html'/
  );
  assert.match(source, /const recipientMissing = !recipientEmail/);
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR10: konversationer.html cache-bustar efter kalenderkoppling', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260703z-tabrow/);
});
