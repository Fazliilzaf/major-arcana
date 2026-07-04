'use strict';

/* PR 39 — Sprid kundkontext-chipsen (PR38) till Konversationers egen ytor så
 * språket förblir ett: admin#cco:s .ctx-panel, Svarstudions kontext-rail och
 * Bokning-wizardens Kundkontext-kort. Spec-grid/label-value → chips. Samma
 * varma tokens, ingen ny palett, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const readPub = (f) => fs.readFileSync(path.join(repoRoot, 'public', f), 'utf8');
const readPrev = (f) =>
  fs.readFileSync(path.join(repoRoot, 'public', 'major-arcana-preview', f), 'utf8');

test('PR39: Konversationers .ctx-panel använder chips, inte spec-grid', () => {
  const src = readPub('konversationer.html');
  assert.match(src, /\.ctx-chips\s*\{/, 'saknar .ctx-chips-CSS');
  assert.match(src, /\.ctx-chip--vip\s*\{/, 'saknar .ctx-chip--vip');
  assert.match(src, /\.ctx-chip--warn\s*\{/, 'saknar .ctx-chip--warn');
  assert.match(src, /class="ctx-chips"/, 'saknar chips-markup');
  assert.match(src, /class="ctx-metaline"/, 'saknar meta-rad');
  // Gamla spec-grid borta (CSS + markup).
  assert.doesNotMatch(src, /\.ctx-grid\s*\{/, 'har kvar .ctx-grid-CSS');
  assert.doesNotMatch(src, /class="ctx-grid"/, 'har kvar ctx-grid-markup');
  // Chips lånar befintliga status-tokens (ingen ny palett).
  const warn = src.match(/\.ctx-chip--warn\s*\{[^}]*\}/);
  assert.ok(warn && /var\(--cco-status-warning/.test(warn[0]), 'warn-chip saknar status-token');
});

test('PR39: Svarstudions kontext-rail renderar nyckelfakta som chips', () => {
  const src = readPub('konversationer-bottom-actions.js');
  // Fakta byggs som chips via factChip-hjälparen, inte längre spec-grid.
  assert.match(src, /const factChip = \(/, 'saknar factChip-hjälpare');
  assert.match(src, /factChip\('Churn', ctx\.churnRisk, 'warn'\)/, 'churn-chip saknas');
  assert.match(src, /factChip\('Engagemang', ctx\.engagement, 'info'\)/, 'engagemang-chip saknas');
  // Gamla fact-/risk-grid borttagen.
  assert.doesNotMatch(src, /class: 'wb-fact-grid'/, 'har kvar wb-fact-grid-markup');
  assert.doesNotMatch(src, /class: 'wb-risk-row'/, 'har kvar wb-risk-row-markup');
  // Semantiska chip-varianter finns i CSS:en.
  assert.match(
    readPub('konversationer.html'),
    /\.wb-context-chip--warn\s*\{/,
    'saknar wb warn-variant'
  );
});

test('PR39: Bokning-wizardens Kundkontext blir chips', () => {
  const src = readPrev('cco-ny-bokning.html');
  assert.match(src, /\.wiz-chips\s*\{/, 'saknar .wiz-chips-CSS');
  assert.match(src, /class="wiz-chips"/, 'saknar chips-markup');
  assert.match(src, /class="wiz-metaline"/, 'saknar meta-rad');
  // Kundkontext-kortet använder inte längre wiz-kv (spec-grid) — men
  // "Kund & behandling"-kortet får behålla sin.
  const ctxCard = src.match(/Kundkontext<\/div>[\s\S]{0,400}?<\/div>\s*<\/div>/);
  assert.ok(ctxCard, 'hittar inte Kundkontext-kortet');
  assert.doesNotMatch(ctxCard[0], /class="wiz-kv"/, 'Kundkontext har kvar wiz-kv-grid');
});

test('PR39: ingen live-send introducerad', () => {
  for (const src of [
    readPub('konversationer.html'),
    readPub('konversationer-bottom-actions.js'),
    readPrev('cco-ny-bokning.html'),
  ]) {
    assert.doesNotMatch(src, /sendMail\(|graphSend|messages\/send/);
  }
});
