'use strict';

/* PR 17 — Makron v3 (nivå 1, starkast koppling): makronbiblioteket öppnas från
 * Svarstudios snabbmall-rad (utgående svarsflöde) och som flik i panel-raden,
 * med vald tråds kontext (kund, ämne, senaste meddelanden, mailbox). Snabbmallar
 * i Svarstudio är oförändrade. Origin-validerad postMessage. Ingen live-send,
 * ingen ny design. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const makronPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-makron-v3.html');

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const makron = fs.readFileSync(makronPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── Makron-knappen i Svarstudios snabbmall-rad ───────────────────────────────

test('PR17: Makron v3-källa + öppnare finns', () => {
  assert.match(source, /const MAKRON_V3_SRC = '\/major-arcana-preview\/cco-makron-v3\.html'/);
  assert.match(source, /function openMakron\(presetContext\)/);
});

test('PR17: makron öppnas från Svarstudios snabbmall-rad med trådens ctx', () => {
  assert.match(source, /'data-makron-open': 'true'/);
  assert.match(source, /onclick: \(\) => openMakron\(ctx\)/);
  // snabbmallarna själva är kvar (oförändrade)
  assert.match(source, /const snabbRow = el\('div', \{ class: 'wb-chips' \}\)/);
  assert.match(source, /for \(const sm of SNABBMALLAR\)/);
});

test('PR17: makron finns som flik i panel-raden', () => {
  assert.match(source, /key: 'makron', label: 'Makron', open: \(\) => openMakron\(\)/);
  assert.match(source, /tabs: panelTabs\('makron'\)/);
});

test('PR17: makron öppnas som panel med kontext via postMessage', () => {
  assert.match(compact(source), /const src = MAKRON_V3_SRC \+/);
  assert.match(
    compact(source),
    /openModal\(\{ title: 'Makron', wide: true, tabs: panelTabs\('makron'\), body: frame \}\)/
  );
  assert.match(
    compact(source),
    /postMessage\( \{ type: 'cco:makron:context', context \}, window\.location\.origin \)/
  );
  assert.match(source, /params\.set\('kund', context\.customerName\)/);
  assert.match(source, /params\.set\('trad', context\.conversationKey\)/);
});

// ── Makron v3 tar emot kontexten ─────────────────────────────────────────────

test('PR17: makron-v3 lyssnar på kontext-postMessage, validerar origin', () => {
  assert.match(makron, /cco:makron:context/);
  assert.match(makron, /event\.origin !== window\.location\.origin/);
  assert.match(makron, /window\.CCO_MAKRON_CONTEXT = context/);
});

test('PR17: makron scopar till vald kund via befintlig makronsökning', () => {
  assert.match(makron, /function applyContext\(context\)/);
  assert.match(makron, /querySelector\('input\[placeholder="Sök makron…"\]'\)/);
  assert.match(makron, /search\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR17: övriga paneler orörda, ingen live-send', () => {
  assert.match(source, /const BOOKING_SRC = '\/major-arcana-preview\/cco-booking-wizard-v3\.html'/);
  assert.match(source, /const KALENDER_SRC = '\/kalender\.html'/);
  assert.match(source, /const SENARE_V3_SRC = '\/major-arcana-preview\/cco-senare-v3\.html'/);
  assert.match(source, /const SKICKAT_V3_SRC = '\/major-arcana-preview\/cco-skickat-v3\.html'/);
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR17: konversationer.html cache-bustar efter makron-koppling', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260703y-paneltargets/);
});
