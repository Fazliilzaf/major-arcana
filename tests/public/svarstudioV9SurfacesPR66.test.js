'use strict';

/* PR 66 (CSS-steget) — Svarstudions ytor i linje med Kundregistret (v9/v11).
 * Facit: kort/paneler/overlay bär en VIT kant (som .customer-row i registret),
 * inte en taupe-ruta, och hover lyfter ytan+skuggan utan att rita en rosa kant.
 * Skuggorna (--sh-md/--sh-lg) matchar redan v9 --v9-panel-card-shadow verbatim,
 * så bara kanten/hovern justeras. Rent visuellt, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const html = fs.readFileSync(
  path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-svarstudio-v3.html'),
  'utf8'
);

function rule(selector) {
  const re = new RegExp(`\\n {6}${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[\\s\\S]*?\\n {6}\\}`);
  const m = html.match(re);
  assert.ok(m, `${selector}-regeln ska finnas`);
  return m[0];
}

test('PR66: .card bär vit kant (Kundregistret-facit), inte taupe', () => {
  const card = rule('.card');
  assert.match(card, /border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.5\)/);
  assert.doesNotMatch(card, /border:\s*1px solid rgba\(180,\s*165,\s*150/);
});

test('PR66: .card:hover lyfter ytan utan rosa kant', () => {
  const hover = rule('.card:hover');
  assert.doesNotMatch(hover, /border-color:\s*rgba\(176,\s*53,\s*110/);
  assert.match(hover, /background:\s*linear-gradient/);
});

test('PR66: .panel och .overlay bär vit kant', () => {
  assert.match(rule('.panel'), /border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.5\)/);
  assert.match(rule('.overlay'), /border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.55\)/);
});

test('PR66: ingen live-send introducerad', () => {
  assert.doesNotMatch(html, /graphSend|messages\/send/);
});
