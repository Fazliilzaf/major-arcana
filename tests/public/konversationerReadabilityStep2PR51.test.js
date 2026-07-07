'use strict';

/* PR 51 — Steg 2 av läsbarhets-omjusteringen: färgkodade, tydligare statuschips i
 * inkorgen (som Steg-pills i Kundregistret). Chipsen är större/starkare, mailbox-
 * chippet får en per-mailbox-färgad prick, och olästa trådar framhävs. Återanvänder
 * befintlig palett (ingen ny), ingen logik/send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const konv = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

test('PR51: statuschipsen är större/tydligare (9px, inte 8px)', () => {
  const rule = konv.match(/\.thread-tag\s*\{[\s\S]*?\}/);
  assert.ok(rule, '.thread-tag-regeln ska finnas');
  assert.match(rule[0], /font-size:\s*9px/);
  assert.doesNotMatch(rule[0], /font-size:\s*8px/);
});

test('PR51: mailbox-chip med per-mailbox-färgad prick', () => {
  assert.match(konv, /\.thread-tag--mailbox\s*\{/);
  assert.match(konv, /\.thread-tag--mailbox::before\s*\{[\s\S]*?background:\s*var\(--rail/);
  // JS-mallen använder mailbox-klassen (inte den generiska booking-klassen).
  assert.match(konv, /class="thread-tag thread-tag--mailbox">\$\{escapeHtml\(t\.mailboxAddress/);
});

test('PR51: olästa trådar framhävs (fetare avsändare)', () => {
  assert.match(konv, /\.thread-unread \.thread-from\s*\{[\s\S]*?font-weight:\s*800/);
});

test('PR51: ingen live-send introducerad', () => {
  assert.doesNotMatch(konv, /graphSend|messages\/send/);
});
