'use strict';

/* PR 49 (B) — Bilage-/bild-indikator + robust vy i CCO-läsytan:
 *  - En tydlig "📎 N bilagor · 🖼 M bilder"-etikett ovanför bilage-chipsen.
 *  - Bilagor utan namn tappas inte längre (attachmentDisplayName härleder namn ur
 *    URL:en, annars "Bild"/"Bilaga") — man ska alltid se att en bilaga finns.
 *  - Bilagor utan öppningsbar URL visas som icke-klickbar chip i stället för att
 *    försvinna. Ren klient-rendering, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const konv = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

test('PR49: bilage-sektionen har en indikator-etikett (bilagor + bilder)', () => {
  const fn = konv.match(/function renderMessageAttachments\(message\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn, 'renderMessageAttachments ska finnas');
  assert.match(fn[0], /msg-attachments-head/);
  assert.match(fn[0], /bilaga|bilagor/);
  assert.match(fn[0], /bild|bilder/);
  assert.match(konv, /\.msg-attachments-head\s*\{/);
});

test('PR49: bilagor utan namn tappas inte (fallback-namn)', () => {
  assert.match(konv, /function attachmentDisplayName\(attachment\)/);
  // Gamla beteendet: filtrera bort namnlösa bilagor — får inte finnas kvar.
  assert.doesNotMatch(
    konv,
    /const visible = attachments\.filter\(\(attachment\) => normalizeText\(attachment\?\.name\)\)/
  );
});

test('PR49: bilaga utan öppningsbar URL visas ändå (icke-klickbar chip)', () => {
  assert.match(konv, /msg-attachment--unavailable/);
  assert.match(konv, /\.msg-attachment--unavailable\s*\{/);
});

test('PR49: ingen live-send introducerad', () => {
  assert.doesNotMatch(konv, /graphSend|messages\/send/);
});
