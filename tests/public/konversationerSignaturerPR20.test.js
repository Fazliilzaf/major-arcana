'use strict';

/* PR 20 — Signaturer & samtycken (BankID-signeringscentral, nivå 2, kundkontext
 * bredvid tråden): vilka dokument väntar patienten på att signera. Öppnas från
 * Svarstudios kund-card (bredvid Dossier) och som flik i panel-raden, scopad på
 * vald tråds kund. INTE i svarslinjen. Origin-validerad postMessage. Ingen
 * live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const sigPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-signaturer-v3.html');

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const sig = fs.readFileSync(sigPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── Signaturer-knappen i Svarstudios kund-card ───────────────────────────────

test('PR20: signaturer-källa + öppnare finns', () => {
  assert.match(
    source,
    /const SIGNATURER_V3_SRC = '\/major-arcana-preview\/cco-signaturer-v3\.html'/
  );
  assert.match(source, /function openSignaturer\(presetContext\)/);
});

test('PR20: signaturer öppnas från Svarstudios kund-card med trådens ctx', () => {
  assert.match(source, /'data-signaturer-open': 'true'/);
  assert.match(source, /onclick: \(\) => openSignaturer\(ctx\)/);
});

test('PR20: signaturer finns som flik i panel-raden', () => {
  assert.match(source, /key: 'signaturer', label: 'Signering', open: \(\) => openSignaturer\(\)/);
  assert.match(source, /tabs: panelTabs\('signaturer'\)/);
});

test('PR20: signaturer scopas på trådens kund (customerId) och postMessage', () => {
  assert.match(compact(source), /const src = SIGNATURER_V3_SRC \+/);
  assert.match(source, /params\.set\('cid', customerId\)/);
  assert.match(
    compact(source),
    /openModal\(\{ title: 'Signaturer', wide: true, tabs: panelTabs\('signaturer'\), body: frame \}\)/
  );
  assert.match(
    compact(source),
    /postMessage\( \{ type: 'cco:signaturer:context', context \}, window\.location\.origin \)/
  );
});

// ── Signaturer v3 tar emot kontexten ─────────────────────────────────────────

test('PR20: signaturer-v3 lyssnar på kontext-postMessage, validerar origin', () => {
  assert.match(sig, /cco:signaturer:context/);
  assert.match(sig, /event\.origin !== window\.location\.origin/);
  assert.match(sig, /window\.CCO_SIGNATURER_CONTEXT = context/);
});

test('PR20: signaturer scopar till vald kund via befintlig sökning', () => {
  assert.match(sig, /function applyContext\(context\)/);
  assert.match(sig, /querySelector\('input\[placeholder="Sök patient, dokument…"\]'\)/);
  assert.match(sig, /search\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR20: nivå 1/2-paneler orörda, ingen live-send', () => {
  assert.match(
    source,
    /const PATIENT_HUB_V3_SRC = '\/major-arcana-preview\/cco-patient-hub-v3\.html'/
  );
  assert.match(source, /const NO_SHOW_V3_SRC = '\/major-arcana-preview\/cco-no-show-ai-v3\.html'/);
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR20: konversationer.html cache-bustar efter signaturer-koppling', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260704b-signaturer/);
});
