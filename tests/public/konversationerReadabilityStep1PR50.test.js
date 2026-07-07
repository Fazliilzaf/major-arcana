'use strict';

/* PR 50 — Steg 1 av läsbarhets-omjusteringen mot preview-systemet (Kundregistret).
 * Konversationers text hade väldigt låg kontrast (uttvättad rgba). Sekundär/tertiär
 * text + rubrik-ink lyfts till preview-tonerna för klart bättre läsbarhet. Samma
 * palett som resten av appen (ingen ny palett), ingen live-send, ingen logik. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const konv = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

test('PR50: sekundär text är inte längre den uttvättade rgba-tonen', () => {
  assert.doesNotMatch(konv, /--cco-text-secondary:\s*rgba\(70,\s*60,\s*50,\s*0\.62\)/);
  assert.match(konv, /--cco-text-secondary:\s*#5d6470/);
});

test('PR50: tertiär text mörkas för högre kontrast', () => {
  assert.match(konv, /--cco-text-tertiary:\s*#6a717d/);
  assert.doesNotMatch(konv, /--cco-text-tertiary:\s*#8a8174/);
});

test('PR50: rubrik-ink är den skarpare neutrala tonen', () => {
  assert.match(konv, /--cco-color-brand:\s*#1d1e24/);
});

test('PR50: ingen live-send introducerad', () => {
  assert.doesNotMatch(konv, /graphSend|messages\/send/);
});
