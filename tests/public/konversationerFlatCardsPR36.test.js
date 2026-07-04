'use strict';

/* PR 36 — Flatta list-korten över hela CCO-ytan (mindre skugga/kant som
 * Konversationer). Senare/Signaturer/Notiser/Skickat använde bordade+skuggade
 * "floating cards"; nu är de flata list-rader: ingen kant (transparent), ingen
 * box-shadow, subtil bg + hover, käll-rail + vald-rad kvar. Ingen ny palett,
 * ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const read = (f) =>
  fs.readFileSync(path.join(repoRoot, 'public', 'major-arcana-preview', f), 'utf8');

// [fil, kort-selektor]
const cards = [
  ['cco-senare-v3.html', '.thread'],
  ['cco-signaturer-v3.html', '.req'],
  ['cco-notiser-v3.html', '.card'],
  ['cco-skickat-v3.html', '.sent-card'],
];

for (const [file, sel] of cards) {
  test(`PR36: ${file} ${sel} är flat (ingen kant/skugga)`, () => {
    const src = read(file);
    const re = new RegExp('\\' + sel + '\\s*\\{[^}]*\\}');
    const block = src.match(re);
    assert.ok(block, `${sel}-block saknas i ${file}`);
    // Ingen tung "floating card"-skugga kvar.
    assert.doesNotMatch(block[0], /0 6px 16px|var\(--sh-md\)|var\(--sh-lg\)|var\(--sh-sm\)/);
    // Ingen synlig grå kant kvar.
    assert.doesNotMatch(block[0], /border:\s*1px solid rgba\(180, 165, 150/);
  });
}

test('PR36: ingen live-send introducerad', () => {
  for (const [file] of cards) {
    assert.doesNotMatch(read(file), /sendMail\(|graphSend|messages\/send/);
  }
});
