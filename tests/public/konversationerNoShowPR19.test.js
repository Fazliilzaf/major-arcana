'use strict';

/* PR 19 — No-show-hantering (nivå 2, kundkontext bredvid tråden): relevant när
 * en bokningstråd hanteras; kopplar mot bokning/kalender. Öppnas från Svarstudios
 * bokningsrad (smart-actions) och som flik i panel-raden, scopad på vald tråds
 * kund. INTE i svarslinjen. Origin-validerad postMessage. Ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const noShowPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-no-show-ai-v3.html');

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const noShow = fs.readFileSync(noShowPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── No-show-knappen i Svarstudios bokningsrad ────────────────────────────────

test('PR19: no-show-källa (nyare AI-vy) + öppnare finns', () => {
  // Nyare CCO-vy vinner: AI-prediction-vyn, inte den äldre listvyn.
  assert.match(source, /const NO_SHOW_V3_SRC = '\/major-arcana-preview\/cco-no-show-ai-v3\.html'/);
  assert.doesNotMatch(source, /cco-no-show-v3\.html/);
  assert.match(source, /function openNoShow\(presetContext\)/);
});

test('PR19: no-show öppnas från Svarstudios bokningsrad med trådens ctx', () => {
  assert.match(
    source,
    /const noShowBtn = chipBtn\('🚫 No-show', \{ onclick: \(\) => openNoShow\(ctx\) \}\)/
  );
  assert.match(source, /noShowBtn\.setAttribute\('data-noshow-open', 'true'\)/);
});

test('PR19: no-show finns som flik i panel-raden', () => {
  assert.match(source, /key: 'noshow', label: 'No-show', open: \(\) => openNoShow\(\)/);
  assert.match(source, /tabs: panelTabs\('noshow'\)/);
});

test('PR19: no-show scopas på trådens kund (customerId) och postMessage', () => {
  assert.match(compact(source), /const src = NO_SHOW_V3_SRC \+/);
  assert.match(source, /params\.set\('cid', customerId\)/);
  assert.match(
    compact(source),
    /openModal\(\{ title: 'No-show', wide: true, tabs: panelTabs\('noshow'\), body: frame \}\)/
  );
  assert.match(
    compact(source),
    /postMessage\( \{ type: 'cco:noshow:context', context \}, window\.location\.origin \)/
  );
});

// ── No-show v3 tar emot kontexten ────────────────────────────────────────────

test('PR19: no-show-v3 lyssnar på kontext-postMessage, validerar origin', () => {
  assert.match(noShow, /cco:noshow:context/);
  assert.match(noShow, /event\.origin !== window\.location\.origin/);
  assert.match(noShow, /window\.CCO_NOSHOW_CONTEXT = context/);
});

test('PR19: no-show-ai scopar till vald kund genom att markera matchande risk-rad', () => {
  // AI-vyn har ingen sökruta → scopar genom att markera + scrolla till raden.
  assert.match(noShow, /function applyContext\(context\)/);
  assert.match(noShow, /querySelectorAll\('\.risk-row'\)/);
  assert.match(noShow, /row\.querySelector\('\.name'\)/);
  assert.match(noShow, /target\.scrollIntoView\(\{ block: 'center' \}\)/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR19: nivå 1/2-paneler orörda, ingen live-send', () => {
  assert.match(
    source,
    /const PATIENT_HUB_V3_SRC = '\/major-arcana-preview\/cco-patient-hub-v3\.html'/
  );
  assert.match(source, /const MAKRON_V3_SRC = '\/major-arcana-preview\/cco-makron-v3\.html'/);
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR19: konversationer.html cache-bustar efter no-show-koppling', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260704c-senarebar/);
});
