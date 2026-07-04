'use strict';

/* PR 31 — Alla CCO-vyer fyller hela popup-ytan (som Svarstudio/Kalender redan
 * gör). Innehållet var centrerat med max-width-spärrar (no-show-ai 1180px,
 * aux-vyerna 1500px, senare 1500px) → stora tomma marginaler i den breda
 * admin#cco-modalen. Spärrarna släpps (max-width: none / --maxw: none) så
 * innehållet går kant-till-kant. Ren CSS, ingen ny design, ingen live-send.
 * (Bokning-wizarden cco-ny-bokning hålls medvetet läsbar-smal — form.) */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const read = (f) =>
  fs.readFileSync(path.join(repoRoot, 'public', 'major-arcana-preview', f), 'utf8');

// aux-baserade vyer: --maxw släpps till none (enda användningen är .aux max-width).
const auxViews = [
  'cco-patient-hub-v3.html',
  'cco-signaturer-v3.html',
  'cco-notiser-v3.html',
  'cco-skickat-v3.html',
  'cco-no-show-v3.html',
  'cco-makron-v3.html',
];

for (const f of auxViews) {
  test(`PR31: ${f} fyller ytan (--maxw: none, ingen 1500px-spärr)`, () => {
    const src = read(f);
    assert.match(src, /--maxw:\s*none/);
    assert.doesNotMatch(src, /--maxw:\s*1500px/);
  });
}

test('PR31: no-show-ai fyller ytan (ingen 1180px-spärr kvar)', () => {
  const src = read('cco-no-show-ai-v3.html');
  assert.doesNotMatch(src, /max-width:\s*1180px/);
  assert.match(src, /\.layout\s*\{[^}]*max-width:\s*none/s);
});

test('PR31: senare fyller ytan (ingen 1500px-spärr på .app)', () => {
  const src = read('cco-senare-v3.html');
  assert.doesNotMatch(src, /max-width:\s*1500px/);
});

test('PR31: ingen live-send introducerad', () => {
  for (const f of [...auxViews, 'cco-no-show-ai-v3.html', 'cco-senare-v3.html']) {
    assert.doesNotMatch(read(f), /sendMail\(|graphSend|messages\/send/);
  }
});
