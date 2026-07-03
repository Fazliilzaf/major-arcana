'use strict';

/* PR 7 — tooltip-störning i admin#cco → Konversationer.
 *
 * Embed-iframen i admin.html hade title="HairTP Clinic CCO", som webbläsaren
 * visar som en native hover-tooltip över hela iframe-ytan (lanes + bottom
 * actions inuti konversationer.html). Det såg ut som dubbel-UI. Fix: byt title →
 * aria-label (behåller tillgängligt namn, ingen hover-tooltip). Ingen ny design,
 * ingen funktionell ändring.
 *
 * Guard: title="HairTP Clinic CCO" finns inte kvar på interaktiva
 * konversations-element; iframen har aria-label i stället. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const adminHtml = fs.readFileSync(path.join(repoRoot, 'public', 'admin.html'), 'utf8');
const konvHtml = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

test('PR7: ingen generisk title="HairTP Clinic CCO"-tooltip i admin.html', () => {
  assert.doesNotMatch(adminHtml, /title="HairTP Clinic CCO"/);
});

test('PR7: ingen title="HairTP Clinic CCO"-tooltip i konversationer.html', () => {
  assert.doesNotMatch(konvHtml, /title="HairTP Clinic CCO"/);
});

test('PR7: embed-iframen behåller tillgängligt namn via aria-label', () => {
  // iframe-blocket ska ha aria-label i stället för title.
  const frame = adminHtml.match(/<iframe[^>]*id="ccoPreviewEmbedFrame"[\s\S]*?>/);
  assert.ok(frame, 'ccoPreviewEmbedFrame-iframe hittas');
  assert.match(frame[0], /aria-label="HairTP Clinic CCO — Konversationer"/);
  assert.doesNotMatch(frame[0], /\btitle=/);
});

test('PR7: riktiga risk-badge-tooltips i konversationer.html är kvar (a11y)', () => {
  // Informativa title-tooltips på risk-badges ska INTE tas bort.
  assert.match(konvHtml, /title="Hög risk · klagomål eller komplikation"/);
  assert.match(konvHtml, /title="Behöver uppföljning inom 48h"/);
  assert.match(konvHtml, /title="Ej tilldelad personal"/);
});
