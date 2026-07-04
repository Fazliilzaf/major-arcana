'use strict';

/* PR 42 (punch-list C) — flatta Makron-bibliotekets list-rader (.macro) så det
 * blir mindre "kort på kort" och mer lättläst lista, i linje med den flata
 * list-looken i övriga CCO-vyer (Konversationer): ingen synlig kant, ingen tung
 * skugga, subtil bg + hover. Ingen ny palett, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const src = fs.readFileSync(
  path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-makron-v3.html'),
  'utf8'
);

test('PR42: Makron-list-raden (.macro) är flat', () => {
  // Rad-varianten känns igen på sin grid-template (64px 1fr 72px auto).
  const rowBlock = src.match(/\.macro \{[^}]*grid-template-columns: 64px[^}]*\}/s);
  assert.ok(rowBlock, 'hittar inte .macro rad-blocket');
  assert.match(rowBlock[0], /border:\s*1px solid transparent/, 'kant ej transparent');
  assert.match(rowBlock[0], /box-shadow:\s*none/, 'box-shadow ej none');
  assert.doesNotMatch(rowBlock[0], /var\(--sh-(?:sm|md|lg)\)/, 'kvarvarande tung skugga');
  // Subtil bg (som flata listor: låg vit-opacitet, ingen vit kant).
  assert.match(rowBlock[0], /background:\s*rgba\(255, 255, 255, 0\.5\)/, 'saknar subtil bg');
  assert.doesNotMatch(
    rowBlock[0],
    /border:\s*1px solid rgba\(255, 255, 255/,
    'kvarvarande vit kant (kort-på-kort)'
  );
});

test('PR42: hover byter bg (flat list-interaktion)', () => {
  const hover = src.match(/\.macro:hover \{[^}]*\}/s);
  assert.ok(hover, 'saknar .macro:hover');
  assert.match(hover[0], /background:\s*rgba\(255, 255, 255, 0\.72\)/, 'hover byter inte bg');
});

test('PR42: avsiktlig visuell ändring flaggad, ingen live-send', () => {
  assert.match(src, /<meta name="visual-regression" content="[^"]*intentional-change/);
  assert.doesNotMatch(src, /sendMail\(|graphSend|messages\/send/);
});
