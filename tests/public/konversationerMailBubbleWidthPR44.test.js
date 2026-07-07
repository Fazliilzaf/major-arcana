'use strict';

/* PR 44 — HTML-mailbubblor (fullt mail med signatur/loggor, renderat i sandboxad
 * iframe) renderades smalt (~300px) medan ren-text-bubblor fyllde ~80% av läsytan.
 * Orsak: .msg-bubble--html hade width: min(720px, 100%), och "100%" kollapsar i
 * flex/shrink-to-fit-kontexten till iframens inbyggda bredd. En definit vw-term
 * gör att den avsedda 720px faktiskt tillämpas så HTML-bubblor blir lika breda som
 * textbubblor. Ren CSS, ingen ny design/palett, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

test('PR44: HTML-mailbubblan har en definit bredd (ingen kollapsande 100%)', () => {
  const rule = src.match(/\.msg-bubble\.msg-bubble--html\s*\{[\s\S]*?\}/);
  assert.ok(rule, '.msg-bubble--html-regeln ska finnas');
  assert.match(rule[0], /width:\s*min\(720px,\s*62vw\)/);
  assert.doesNotMatch(rule[0], /width:\s*min\(720px,\s*100%\)/);
});

test('PR44: ingen live-send introducerad', () => {
  assert.doesNotMatch(src, /graphSend|messages\/send/);
});
