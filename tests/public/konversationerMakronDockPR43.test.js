'use strict';

/* PR 43 (punch-list D) — ge Makron-vyn samma bottom-action-dock som övriga
 * CCO-vyer, nu när listan är flattad (C/#593). Docken postar sitt data-action
 * till föräldern (admin#cco → runCcoAction). Ingen live-send; standalone = no-op. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const src = fs.readFileSync(
  path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-makron-v3.html'),
  'utf8'
);

const DOCK_ACTIONS = [
  'svarstudio',
  'bokningsyta',
  'smart-anteckning',
  'kalender',
  'klar',
  'senare',
  'reopen',
];

test('PR43: Makron har den fasta bottom-docken', () => {
  assert.match(src, /class="thread-bottom-actions"/, 'saknar dock-markup');
  assert.match(src, /\.thread-bottom-actions\s*\{[^}]*position:\s*fixed/s, 'docken är inte fast');
  // Botten-reserv så docken inte täcker sista innehållet.
  assert.match(src, /body\s*\{[^}]*padding-bottom:\s*96px/s, 'saknar botten-reserv');
});

test('PR43: alla sju standard-actions finns i docken', () => {
  for (const a of DOCK_ACTIONS) {
    assert.match(
      src,
      new RegExp(`class="action-btn[^"]*"[^>]*data-action="${a}"`),
      `dock-knapp saknas: ${a}`
    );
  }
});

test('PR43: docken postar cco:panel:action till föräldern (origin-checkad)', () => {
  assert.match(src, /button\[data-action\]/, 'saknar data-action-lyssnare');
  assert.match(src, /type:\s*'cco:panel:action'/, 'postar inte cco:panel:action');
  assert.match(src, /window\.parent && window\.parent !== window/, 'saknar iframe-vakt');
  assert.match(src, /window\.location\.origin/, 'postar utan origin-mål');
});

test('PR43: makro-radens egna knappar (data-act) postar inte till föräldern', () => {
  // Kör/Redigera/Radera använder data-act, inte data-action → fångas inte av docken.
  assert.match(src, /data-act="run"/, 'makro-radens run-knapp saknar data-act');
  assert.doesNotMatch(
    src,
    /data-action="run"|data-action="edit"|data-action="delete"/,
    'makro-knapp har fel attribut'
  );
});

test('PR43: ingen live-send introducerad', () => {
  assert.doesNotMatch(src, /sendMail\(|graphSend|messages\/send/);
});
