'use strict';

/* PR 63 — Fortsatt trogen v9-port (område 1 & 2):
 *  1. Läspanel-header-pillsen (.status-pill) = exakt v9 .cr-status (ljus pill,
 *     3px 9px, gradient .85→.75, kant .6, inre highlight).
 *  2. Topp-badgesen (.risk-badge) får v9-pill-definitionen (kant + inre highlight)
 *     ovanpå status-tinten.
 * Område 3 (höger kontext-panel) var redan v9-aligned (.quick-pill = v9 kontroll-
 * yta, ctx-chips färgkodade) → ingen ändring. Exakta v9-värden, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const konv = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

test('PR63: header-pill (.status-pill) = exakt v9 .cr-status-värden', () => {
  const rule = konv.match(/\n {6}\.status-pill \{[\s\S]*?\n {6}\}/);
  assert.ok(rule, '.status-pill-regeln ska finnas');
  assert.match(rule[0], /padding:\s*3px 9px/);
  assert.match(rule[0], /rgba\(247,\s*241,\s*236,\s*0\.75\)/);
  assert.match(rule[0], /border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.6\)/);
});

test('PR63: topp-badges (.risk-badge) har v9-pill-definition (kant + inre highlight)', () => {
  const rule = konv.match(/\n {6}\.risk-badge \{[\s\S]*?\n {6}\}/);
  assert.ok(rule, '.risk-badge-regeln ska finnas');
  assert.match(rule[0], /border:\s*1px solid rgba\(255,\s*255,\s*255,\s*0\.6\)/);
  assert.match(rule[0], /box-shadow:\s*inset 0 1px 0 rgba\(255,\s*255,\s*255,\s*0\.7\)/);
});

test('PR63: ingen live-send introducerad', () => {
  assert.doesNotMatch(konv, /graphSend|messages\/send/);
});
