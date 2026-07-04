'use strict';

/* PR 41 (punch-list F) — mer bottenmarginal/reserv för kundkontext-kortets pills
 * i de två vyer som har en fast action-dock (Dossier + No-show). Kortet får lite
 * mer intern luft under pills-raden, och sidan reserverar mer botten-utrymme så
 * pillsen klarar den fasta docken vid scroll-slut. Ren layout-polish: ingen ny
 * design, ingen palett-ändring, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const read = (f) =>
  fs.readFileSync(path.join(repoRoot, 'public', 'major-arcana-preview', f), 'utf8');

const dockViews = ['cco-patient-hub-v3.html', 'cco-no-show-ai-v3.html'];

for (const file of dockViews) {
  test(`PR41: ${file} — kk-kortet får mer luft under pillsen`, () => {
    const src = read(file);
    // kk-card har asymmetrisk padding med större botten (pills-luft).
    const card = src.match(/\.kk-card\s*\{[^}]*\}/);
    assert.ok(card, `${file} saknar .kk-card`);
    assert.match(card[0], /padding:\s*15px 15px 18px/, `${file} kk-card saknar botten-luft`);
  });

  test(`PR41: ${file} — sidan reserverar plats ovanför den fasta docken`, () => {
    const src = read(file);
    // Docken är fast (position: fixed) och body reserverar > dess höjd.
    assert.match(
      src,
      /\.thread-bottom-actions\s*\{[^}]*position:\s*fixed/s,
      `${file} saknar fast dock`
    );
    const bodyPad = [...src.matchAll(/body\s*\{[^}]*padding-bottom:\s*(\d+)px/gs)].map((m) =>
      Number(m[1])
    );
    assert.ok(
      bodyPad.some((n) => n >= 96),
      `${file} reserverar inte tillräckligt botten-utrymme (${bodyPad.join(',')})`
    );
  });

  test(`PR41: ${file} — avsiktlig visuell ändring flaggad, ingen live-send`, () => {
    const src = read(file);
    assert.match(src, /<meta name="visual-regression" content="intentional-change"/);
    assert.doesNotMatch(src, /sendMail\(|graphSend|messages\/send/);
  });
}
