'use strict';

/* PR 8 — särskilj filter (vänsterpanel) vs actions (bottenknappar) i
 * admin#cco → Konversationer. ENDAST copy/labels ändras — ingen ny funktion,
 * inga data-action-värden ändras, ingen live-send.
 *
 *   Bottenknappar (actions på vald tråd):
 *     "Bokningsyta" → "Öppna bokning"
 *     "Kalender"    → "Öppna kalender"
 *     "Senare"      → "Lägg senare"
 *     "Klar" / "Återöppna" behålls.
 *   Vänsterpanelens filter (LANES) lämnas oförändrade — inkl. lane "Senare". */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');
const actions = fs.readFileSync(
  path.join(repoRoot, 'public', 'konversationer-bottom-actions.js'),
  'utf8'
);

// ── Nya action-labels ────────────────────────────────────────────────────────

test('PR8: bottenknappar har åtgärds-copy (Öppna/Lägg)', () => {
  assert.match(html, /<span class="action-label">Öppna bokning<\/span>/);
  assert.match(html, /<span class="action-label">Öppna kalender<\/span>/);
  assert.match(html, /<span class="action-label">Lägg senare<\/span>/);
  assert.match(html, /<span class="action-label">Klar<\/span>/);
  assert.match(html, /<span class="action-label">Återöppna<\/span>/);
});

test('PR8: gamla generiska bottenlabels är borta', () => {
  assert.doesNotMatch(html, /<span class="action-label">Bokningsyta<\/span>/);
  assert.doesNotMatch(html, /<span class="action-label">Kalender<\/span>/);
  assert.doesNotMatch(html, /<span class="action-label">Senare<\/span>/);
});

// ── Ingen funktionell ändring: data-action + handlers oförändrade ────────────

test('PR8: data-action-värden (funktionen) är oförändrade', () => {
  assert.match(html, /data-action="bokningsyta"/);
  assert.match(html, /data-action="kalender"/);
  assert.match(html, /data-action="senare"/);
  assert.match(html, /data-action="klar"/);
  assert.match(html, /data-action="reopen"/);
});

test('PR8: action-handlers i bottom-actions.js oförändrade', () => {
  // PR 11 — "Lägg senare" öppnar Senare-panelen (reply_later körs vid Bekräfta).
  assert.match(actions, /action === 'senare'\) openSenarePanel\(\)/);
  assert.match(actions, /action === 'klar'\) runConversationAction\('handled'\)/);
  assert.match(actions, /action === 'reopen'\) runConversationAction\('reopen'\)/);
  assert.match(actions, /action === 'bokningsyta'\) openBokningsyta\(\)/);
  assert.match(actions, /action === 'kalender'\) openKalender\(\)/);
});

// ── Vänsterpanelens filter oförändrade ───────────────────────────────────────

test('PR8: vänsterpanelens lane-filter "Senare" är kvar (arbetskö, inte action)', () => {
  // Lane-raden i LANES-panelen ska fortfarande heta "Senare".
  assert.match(html, /class="lbl">Senare<\/span>/);
});
