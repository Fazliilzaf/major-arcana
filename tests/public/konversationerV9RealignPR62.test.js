'use strict';

/* PR 62 — Trogen port av Kundregistrets (v9) look till Konversationer, i ett svep:
 *  - Inkorgens rader blir KORT (exakt v9 .customer-row-yta: ljus gradient, kant,
 *    radie 14, skugga) i stället för transparenta rader.
 *  - Lane-sidebaren får v9 .side-link-behandlingen (högre kontrast + neutral aktiv-
 *    yta + rosa räknare).
 * Exakta värden ur cco-v9-customers.css/tokens. Ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const konv = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

test('PR62: inkorgsraden är ett kort (kant + radie 14 + gradient-yta)', () => {
  const rule = konv.match(/\n {6}\.thread \{[\s\S]*?\n {6}\}/);
  assert.ok(rule, '.thread-regeln ska finnas');
  assert.match(rule[0], /border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.45\)/);
  assert.match(rule[0], /border-radius:\s*14px/);
  assert.match(rule[0], /rgba\(247,\s*241,\s*236,\s*0\.5\)/);
});

test('PR62: lane-sidebaren har v9-aktivyta + rosa räknare', () => {
  const active = konv.match(/\.lane-row\.active \{[\s\S]*?\}/);
  assert.ok(active);
  assert.match(active[0], /rgba\(244,\s*238,\s*232,\s*0\.6\)/);
  assert.match(konv, /\.lane-row\.active \.ct \{[\s\S]*?rose-pill-top/);
});

test('PR62: ingen live-send introducerad', () => {
  assert.doesNotMatch(konv, /graphSend|messages\/send/);
});
