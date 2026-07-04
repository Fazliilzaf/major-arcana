'use strict';

/* PR 21 — Senare får Konversationers bottom action-bar (7 knappar). Baren ligger
 * i cco-senare-v3.html; varje knapp postMess:ar sitt data-action till förälder-
 * admin#cco, som kör samma CCO-action som bottenknapparna/flik-raden via
 * runCcoAction. Degraderar snällt standalone (ingen förälder = no-op). Origin-
 * validerad. Ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const senarePath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-senare-v3.html');

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const senare = fs.readFileSync(senarePath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── Baren finns i Senare med alla 7 actions ──────────────────────────────────

test('PR21: Senare har bottom action-bar med de 7 CCO-actionerna', () => {
  assert.match(senare, /class="thread-bottom-actions"/);
  for (const a of [
    'svarstudio',
    'bokningsyta',
    'smart-anteckning',
    'kalender',
    'klar',
    'senare',
    'reopen',
  ]) {
    assert.match(senare, new RegExp('data-action="' + a + '"'), a + ' saknas i baren');
  }
});

test('PR21: composern ersatt av baren (som Konversationer)', () => {
  assert.doesNotMatch(senare, /placeholder="Skriv ett svar…"/);
});

// ── Knapparna postMess:ar till förälder-admin#cco ────────────────────────────

test('PR21: Senare-baren postMess:ar data-action till föräldern', () => {
  assert.match(senare, /button\[data-action\]/);
  assert.match(senare, /window\.parent && window\.parent !== window/);
  assert.match(
    compact(senare),
    /postMessage\( \{ type: 'cco:panel:action', action: action \}, window\.location\.origin \)/
  );
});

// ── Föräldern tar emot och kör samma action ──────────────────────────────────

test('PR21: admin#cco lyssnar på cco:panel:action och kör runCcoAction', () => {
  assert.match(source, /data\.type !== 'cco:panel:action'/);
  assert.match(source, /event\.origin !== window\.location\.origin/);
  assert.match(source, /runCcoAction\(data\.action\)/);
});

test('PR21: runCcoAction dispatchar alla 7 actions', () => {
  assert.match(source, /action === 'svarstudio'\) openSvarstudioForSelectedThread\(\)/);
  assert.match(source, /action === 'bokningsyta'\) openBokningsyta\(\)/);
  assert.match(source, /action === 'smart-anteckning'\) openSmartAnteckning\(\)/);
  assert.match(source, /action === 'kalender'\) openKalender\(\)/);
  assert.match(source, /action === 'klar'\) runConversationAction\('handled'\)/);
  assert.match(source, /action === 'senare'\) openSenarePanel\(\)/);
  assert.match(source, /action === 'reopen'\) runConversationAction\('reopen'\)/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR21: ingen live-send', () => {
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR21: konversationer.html cache-bustar efter senare-bar', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260704c-senarebar/);
});
