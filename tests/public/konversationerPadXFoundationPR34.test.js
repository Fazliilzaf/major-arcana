'use strict';

/* PR 34 — Foundation-städning: samma trasiga --pad-x-clamp (calc utan mellanslag
 * runt +, "0.5rem+1.6vw") fanns kvar i ~32 andra v3-prototypvyer. Där doldes
 * buggen av att de fortfarande är centrerade (max-width kvar), men foundationen
 * ska vara ren. Alla får nu den giltiga, enhetliga clamp:en. Ren CSS-städning,
 * ingen live-send. (Typografi-clampsen --gap/--fs-* lämnas medvetet — de skulle
 * ändra rubrik-/siffer-storlekar och kräver egen visuell genomgång.) */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const previewDir = path.resolve(__dirname, '../../public/major-arcana-preview');
const files = fs.readdirSync(previewDir).filter((f) => f.endsWith('.html'));

test('PR34: ingen preview-vy har den trasiga --pad-x-clampen (0.5rem+1.6vw)', () => {
  const broken = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(previewDir, f), 'utf8');
    if (/--pad-x:\s*clamp\([^;]*0\.5rem\+1\.6vw/.test(src)) broken.push(f);
  }
  assert.deepEqual(broken, [], 'Vyer med kvarvarande trasig --pad-x: ' + broken.join(', '));
});

test('PR34: vyer som definierar --pad-x använder giltig calc (mellanslag runt +)', () => {
  const badCalc = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(previewDir, f), 'utf8');
    const m = src.match(/--pad-x:\s*clamp\([^;]*\);/);
    if (m && /[0-9](rem|px|vw)\+[0-9]/.test(m[0])) badCalc.push(f);
  }
  assert.deepEqual(badCalc, [], 'Vyer med ogiltig --pad-x-calc: ' + badCalc.join(', '));
});
