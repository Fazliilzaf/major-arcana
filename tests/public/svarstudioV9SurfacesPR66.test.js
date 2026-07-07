'use strict';

/* PR 672 — Svarstudion behåller originalytorna (taupe-kant/rosa hover) och får
 * endast v9 Kundregistrets statusfärger på pills. Ingen ny struktur, ingen
 * live-send. */

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
  const re = new RegExp(
    `\\n {6}${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[\\s\\S]*?\\n {6}\\}`
  );
  const match = html.match(re);
  assert.ok(match, `${selector}-regeln ska finnas`);
  return match[0];
}

test('PR672: .card behåller originalets taupe-kant och rosa hover-kant', () => {
  const card = rule('.card');
  const hover = rule('.card:hover');
  assert.match(card, /border:\s*1px solid rgba\(180,\s*165,\s*150,\s*0\.25\)/);
  assert.match(hover, /border-color:\s*rgba\(176,\s*53,\s*110,\s*0\.25\)/);
  assert.doesNotMatch(card, /border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.5\)/);
  assert.doesNotMatch(hover, /background:\s*linear-gradient/);
});

test('PR672: .panel och .overlay behåller originalets taupe-kant', () => {
  assert.match(rule('.panel'), /border:\s*1px solid rgba\(180,\s*165,\s*150,\s*0\.25\)/);
  assert.match(rule('.overlay'), /border:\s*1px solid rgba\(180,\s*165,\s*150,\s*0\.3\)/);
});

test('PR672: filter-pills använder v9 statusfärger från Kundregistret', () => {
  assert.match(rule('.pill--success'), /color:\s*#4a8268/);
  assert.match(rule('.pill--success .dot'), /background:\s*#4a8268/);
  assert.match(rule('.pill--warning'), /color:\s*#c8821e/);
  assert.match(rule('.pill--warning .dot'), /background:\s*#c8821e/);
  assert.match(rule('.pill--info'), /color:\s*#4a7ba8/);
  assert.match(rule('.pill--info .dot'), /background:\s*#4a7ba8/);
  assert.match(rule('.pill--vip'), /color:\s*#bb4779/);
  assert.match(rule('.pill--vip'), /border-color:\s*rgba\(187,\s*71,\s*121,\s*0\.32\)/);
  assert.match(rule('.pill--vip .dot'), /background:\s*#bb4779/);
});

test('PR672: topp-statuspills använder samma v9-facitfärger', () => {
  assert.match(rule('.sp--intent'), /color:\s*#4a7ba8/);
  assert.match(rule('.sp--prio'), /color:\s*#c8821e/);
  assert.match(rule('.sp--vip'), /color:\s*#bb4779/);
});

test('PR672: ingen live-send introducerad i Svarstudion', () => {
  assert.doesNotMatch(html, /graphSend|messages\/send/);
});
