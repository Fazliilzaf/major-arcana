'use strict';

/* PR 18 — Patient-/kunddossier (nivå 2, kundkontext bredvid tråden): "vem är
 * detta" scopad på vald tråds kund. Öppnas från Svarstudios kund-card och som
 * flik i panel-raden. Kompletterar tråden — INTE i svarslinjen. Origin-validerad
 * postMessage. Ingen live-send, ingen ny design. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const hubPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-patient-hub-v3.html');

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const hub = fs.readFileSync(hubPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── Dossier-knappen i Svarstudios kund-card ──────────────────────────────────

test('PR18: patient-hub-källa + öppnare finns', () => {
  assert.match(
    source,
    /const PATIENT_HUB_V3_SRC = '\/major-arcana-preview\/cco-patient-hub-v3\.html'/
  );
  assert.match(source, /function openPatientHub\(presetContext\)/);
});

test('PR18: dossier öppnas från Svarstudios kund-card med trådens ctx', () => {
  assert.match(source, /'data-patienthub-open': 'true'/);
  assert.match(source, /onclick: \(\) => openPatientHub\(ctx\)/);
});

test('PR18: dossier finns som flik i panel-raden', () => {
  assert.match(source, /key: 'patienthub', label: 'Dossier', open: \(\) => openPatientHub\(\)/);
  assert.match(source, /tabs: panelTabs\('patienthub'\)/);
});

test('PR18: dossier scopas på trådens kund (customerId) och postMessage', () => {
  assert.match(
    source,
    /const customerId = resolveThreadCustomerEmail\(context\) \|\| context\.email \|\| ''/
  );
  assert.match(source, /params\.set\('cid', customerId\)/);
  assert.match(compact(source), /const src = PATIENT_HUB_V3_SRC \+/);
  assert.match(
    compact(source),
    /openModal\(\{ title: 'Dossier', wide: true, tabs: panelTabs\('patienthub'\), body: frame \}\)/
  );
  assert.match(
    compact(source),
    /postMessage\( \{ type: 'cco:patienthub:context', context \}, window\.location\.origin \)/
  );
});

// ── Patient-hub v3 tar emot kontexten ────────────────────────────────────────

test('PR18: patient-hub-v3 lyssnar på kontext-postMessage, validerar origin', () => {
  assert.match(hub, /cco:patienthub:context/);
  assert.match(hub, /event\.origin !== window\.location\.origin/);
  assert.match(hub, /window\.CCO_PATIENTHUB_CONTEXT = context/);
});

test('PR18: patient-hub scopar till vald kund via befintlig sökning', () => {
  assert.match(hub, /function applyContext\(context\)/);
  assert.match(hub, /querySelector\('input\[placeholder="Sök i patienthubben…"\]'\)/);
  assert.match(hub, /search\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR18: nivå 1-paneler orörda, ingen live-send', () => {
  assert.match(source, /const MAKRON_V3_SRC = '\/major-arcana-preview\/cco-makron-v3\.html'/);
  assert.match(source, /const SKICKAT_V3_SRC = '\/major-arcana-preview\/cco-skickat-v3\.html'/);
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR18: konversationer.html cache-bustar efter patient-hub-koppling', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260708a-svarstudio-cache/);
});
