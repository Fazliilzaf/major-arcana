'use strict';

/* PR 38 — Fräscha upp kundkontext-kortet (.kk-card) i alla CCO-vyer:
 * spec-grid (dl.kk-grid med dt/dd) ersätts av chips (.kk-chips/.kk-chip) +
 * en kompakt meta-rad. Samma varma tokens, ingen ny palett, ingen live-send.
 * Detta är PR1 av kundkontext-uppfräschningen (kk-korten); Konversationers
 * egen .ctx-panel + Svarstudio + Bokning följer i PR2. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const read = (f) =>
  fs.readFileSync(path.join(repoRoot, 'public', 'major-arcana-preview', f), 'utf8');

const views = [
  'cco-skickat-v3.html',
  'cco-patient-hub-v3.html',
  'cco-signaturer-v3.html',
  'cco-no-show-ai-v3.html',
  'cco-smart-anteckning-v3.html',
  'cco-senare-v3.html',
];

for (const file of views) {
  test(`PR38: ${file} — kk-kortet använder chips, inte spec-grid`, () => {
    const src = read(file);
    // Chip-CSS finns.
    assert.match(src, /\.kk-chips\s*\{/, `${file} saknar .kk-chips`);
    assert.match(src, /\.kk-chip\s*\{/, `${file} saknar .kk-chip`);
    assert.match(src, /\.kk-chip--vip\s*\{/, `${file} saknar .kk-chip--vip`);
    assert.match(src, /\.kk-chip--warn\s*\{/, `${file} saknar .kk-chip--warn`);
    // Gamla spec-grid är borta (både CSS-regeln och markup-behållaren).
    assert.doesNotMatch(src, /\.kk-grid\s*\{/, `${file} har kvar .kk-grid-CSS`);
    assert.doesNotMatch(src, /class="kk-grid"|kk-grid"/, `${file} har kvar kk-grid-markup`);
    // Chip-markup renderas (statiskt eller via JS-mall).
    assert.match(src, /class="kk-chips"|class="\$\{cls\}"|"kk-chip/, `${file} saknar chip-markup`);
    // Avsiktlig visuell ändring flaggad så tripwiren skippar.
    assert.match(
      src,
      /<meta name="visual-regression" content="intentional-change"/,
      `${file} saknar intentional-change-meta`
    );
  });
}

test('PR38: ingen ny palett — chips lånar befintliga status-tokens', () => {
  for (const file of views) {
    const src = read(file);
    const block = src.match(/\.kk-chip--warn\s*\{[^}]*\}/);
    assert.ok(block, `${file} saknar .kk-chip--warn-block`);
    assert.match(
      block[0],
      /var\(--(?:cco-status-)?warning(?:-bg)?\)/,
      `${file} .kk-chip--warn använder inte warning-token`
    );
  }
});

test('PR38: ingen live-send introducerad', () => {
  for (const file of views) {
    assert.doesNotMatch(read(file), /sendMail\(|graphSend|messages\/send/);
  }
});
