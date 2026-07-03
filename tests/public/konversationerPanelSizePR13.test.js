'use strict';

/* PR 13 (panelstorlek) — v3-panelerna (Smart anteckning/bokning/kalender/senare/
 * notiser) bäddas in i action-modal--wide. 880px klämde ihop deras fullskärms-
 * 3-kolumnslayout (mittkolumnen blev en bokstav per rad). Modalen får nu nästan
 * full bredd + höjd, och iframen fyller höjden. Ingen ny design, bara storlek. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');
const source = fs.readFileSync(
  path.join(repoRoot, 'public', 'konversationer-bottom-actions.js'),
  'utf8'
);

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

test('PSIZE: panel-modalen använder viewport-bredd, inte 880px', () => {
  const c = compact(html);
  assert.match(c, /\.action-modal--wide \{ max-width: 1400px; width: 96vw; height: 92vh; \}/);
  assert.doesNotMatch(c, /\.action-modal--wide \{ max-width: 880px; \}/);
});

test('PSIZE: panel-body har liten padding så iframen får plats', () => {
  assert.match(compact(html), /\.action-modal--wide \.action-modal-body \{ padding: 8px; \}/);
});

test('PSIZE: alla v3-iframe-paneler fyller höjden (height:100%)', () => {
  const matches = source.match(/height:100%;border:0;border-radius:14px;background:#fff/g) || [];
  assert.ok(
    matches.length === 5,
    'alla 5 paneler (smart/bokning/kalender/senare/notiser) fyller höjden'
  );
  assert.doesNotMatch(source, /height:78vh/);
});
