'use strict';

/* PR 14 — Skickat/kö (placering A): sektion INNE i Svarstudio (utgående
 * svarspipeline), inte bottom action och inte vänsterfilter. Öppnar
 * cco-skickat-v3.html som panel med Svarstudios kontext. Origin-validerad
 * postMessage. Ingen live-send, ingen ny design. Sista kopplingen i spåret. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const skickatPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-skickat-v3.html');

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const skickat = fs.readFileSync(skickatPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── Skickat/kö-sektion inne i Svarstudio ─────────────────────────────────────

test('PR14: Skickat/kö-knappen ligger i Svarstudios kontextpanel', () => {
  assert.match(source, /const SKICKAT_V3_SRC = '\/major-arcana-preview\/cco-skickat-v3\.html'/);
  assert.match(source, /function openSkickat\(presetContext\)/);
  // knappen finns i Svarstudios contextPanel och skickar med Svarstudios ctx
  assert.match(source, /'data-skickat-open': 'true'/);
  assert.match(source, /onclick: \(\) => openSkickat\(ctx\)/);
  assert.match(source, /'Skickat \/ kö'/);
  // inte en bottom action / inte ett data-action
  assert.doesNotMatch(html, /data-action="skickat"/);
});

test('PR14: Skickat öppnas som panel med kontext via postMessage', () => {
  assert.match(compact(source), /const src = SKICKAT_V3_SRC \+/);
  assert.match(
    compact(source),
    /openModal\(\{ title: 'Skickat \/ kö', wide: true, tabs: panelTabs\('skickat'\), body: frame \}\)/
  );
  assert.match(
    compact(source),
    /postMessage\( \{ type: 'cco:skickat:context', context \}, window\.location\.origin \)/
  );
  assert.match(source, /params\.set\('kund', context\.customerName\)/);
  assert.match(source, /params\.set\('trad', context\.conversationKey\)/);
});

// ── Skickat v3 tar emot kontexten ────────────────────────────────────────────

test('PR14: skickat-v3 lyssnar på kontext-postMessage, validerar origin', () => {
  assert.match(skickat, /cco:skickat:context/);
  assert.match(skickat, /event\.origin !== window\.location\.origin/);
  assert.match(skickat, /window\.CCO_SKICKAT_CONTEXT = context/);
});

test('PR14: skickat scopar till vald kund via befintlig sökning', () => {
  assert.match(skickat, /function applyContext\(context\)/);
  assert.match(skickat, /querySelector\('input\[placeholder="Sök skickat…"\]'\)/);
  assert.match(skickat, /search\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR14: övriga paneler orörda, ingen live-send', () => {
  assert.match(source, /const BOOKING_SRC = '\/major-arcana-preview\/cco-ny-bokning\.html'/);
  assert.match(source, /const KALENDER_SRC = '\/kalender\.html'/);
  assert.match(source, /const SENARE_V3_SRC = '\/major-arcana-preview\/cco-senare-v3\.html'/);
  assert.match(source, /const NOTISER_V3_SRC = '\/major-arcana-preview\/cco-notiser-v3\.html'/);
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR14: konversationer.html cache-bustar efter skickat-koppling', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260704a-bokning/);
});
