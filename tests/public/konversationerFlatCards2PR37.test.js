'use strict';

/* PR 37 — Dra samma flatta + kompakta list-look till fler kort-ytor:
 * No-show AI:s risk-rader (.risk-row), Uteblivna besök-korten (.ns-card) och
 * Dossiers feature-kort (.card). Alla blir flata list-rader/kort som
 * Konversationer: ingen synlig kant (transparent), ingen tung box-shadow,
 * subtil bg + hover. Ingen ny palett, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const read = (f) =>
  fs.readFileSync(path.join(repoRoot, 'public', 'major-arcana-preview', f), 'utf8');

const cards = [
  ['cco-no-show-ai-v3.html', '.risk-row'],
  ['cco-no-show-v3.html', '.ns-card'],
  ['cco-patient-hub-v3.html', '.card'],
];

for (const [file, sel] of cards) {
  test(`PR37: ${file} ${sel} är flat (transparent kant, ingen tung skugga)`, () => {
    const src = read(file);
    const block = src.match(new RegExp('\\' + sel + '\\s*\\{[^}]*\\}'));
    assert.ok(block, `${sel}-block saknas i ${file}`);
    assert.match(block[0], /border:\s*1px solid transparent/);
    assert.doesNotMatch(block[0], /0 6px 16px|var\(--sh-md\)|var\(--sh-lg\)|var\(--sh-sm\)/);
    // Ingen kvarvarande grå/vit synlig kant.
    assert.doesNotMatch(block[0], /border:\s*1px solid rgba\((?:180, 165, 150|255, 255, 255)/);
  });
}

test('PR37: ingen live-send introducerad', () => {
  for (const [file] of cards) {
    assert.doesNotMatch(read(file), /sendMail\(|graphSend|messages\/send/);
  }
});
