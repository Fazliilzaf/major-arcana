'use strict';

/* PR 48 (A) — Signaturer/loggor i HTML-mail ska alltid renderas läsbart. Tidigare
 * var HTML-mailets canvas transparent, vilket lät den amber-färgade utgående-bubblan
 * lysa igenom och sänka kontrasten på signaturer som förutsätter ljus botten. Nu får
 * HTML-mail en egen solid, nära vit canvas (#fffdfb) — både iframens srcdoc-body och
 * .msg-html-frame. Ren CSS, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const konv = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

test('PR48: iframens srcdoc-body har en solid ljus canvas (inte transparent)', () => {
  const style = konv.match(/<style>body\{[^<]*?<\/style>/);
  assert.ok(style, 'srcdoc-body <style> ska finnas');
  assert.match(style[0], /background:#fffdfb/);
  assert.doesNotMatch(style[0], /background:transparent/);
});

test('PR48: .msg-html-frame har samma solida ljusa canvas', () => {
  const rule = konv.match(/\.msg-html-frame\s*\{[\s\S]*?\}/);
  assert.ok(rule);
  assert.match(rule[0], /background:\s*#fffdfb/);
});

test('PR48: ingen live-send introducerad', () => {
  assert.doesNotMatch(konv, /graphSend|messages\/send/);
});
