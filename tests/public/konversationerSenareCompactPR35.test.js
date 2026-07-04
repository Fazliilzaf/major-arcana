'use strict';

/* PR 35 — Senare-listans kort var för stora/chunkiga jämfört med Konversationer.
 * Kortproportionerna kompakteras till samma mått som Konversationers list-kort:
 * 28px avatar (från 2.4rem), tajtare padding (9px), mindre typsnitt (namn 11,
 * tid 9, ämne 11, preview 10) och tätare radavstånd. Ingen ny design/palett,
 * ingen live-send — bara storleksproportioner. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const senare = fs.readFileSync(
  path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-senare-v3.html'),
  'utf8'
);

test('PR35: kompakt avatar (28px, inte 2.4rem)', () => {
  const block = senare.match(/\.t-av\s*\{[^}]*\}/);
  assert.ok(block, '.t-av-block saknas');
  assert.match(block[0], /width:\s*28px/);
  assert.match(block[0], /height:\s*28px/);
  assert.doesNotMatch(block[0], /2\.4rem/);
});

test('PR35: kompakt kort-padding + radie (som Konversationer)', () => {
  const block = senare.match(/\.thread\s*\{[^}]*\}/);
  assert.ok(block, '.thread-block saknas');
  assert.match(block[0], /padding:\s*9px 10px 9px 13px/);
  assert.match(block[0], /border-radius:\s*11px/);
});

test('PR35: mindre typsnitt i kortet', () => {
  assert.match(senare, /\.t-name\s*\{[^}]*font-size:\s*11px/s);
  assert.match(senare, /\.t-time\s*\{[^}]*font-size:\s*9px/s);
  assert.match(senare, /\.t-sub\s*\{[^}]*font-size:\s*11px/s);
  assert.match(senare, /\.t-prev\s*\{[^}]*font-size:\s*10px/s);
});

test('PR35: tätare radavstånd i listan', () => {
  const block = senare.match(/\.inbox\s*\{[^}]*\}/);
  assert.ok(block, '.inbox-block saknas');
  assert.match(block[0], /gap:\s*4px/);
});

test('PR35: ingen live-send', () => {
  assert.doesNotMatch(senare, /sendMail\(|graphSend|messages\/send/);
});
