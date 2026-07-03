'use strict';

/* PR 13 — Notiser (placering A): liten klock-ikon + badge i statusraden/badge-
 * raden bredvid LIVE/risk/followup. Öppnar cco-notiser-v3.html som notiscenter-
 * panel. Notiser är INTE en bottom action och INTE ett vänsterfilter. Tar med
 * vald tråds kontext om en tråd är vald (origin-validerad postMessage). Ingen
 * live-send, ingen ny design (återanvänder badge-raden). */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const notiserPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-notiser-v3.html');

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const notiser = fs.readFileSync(notiserPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── Klock-ikon i badge-raden (placering A) ───────────────────────────────────

test('PR13: Notiser-klocka finns i risk-badge-raden (inte bottom action)', () => {
  const c = compact(html);
  // klockan ligger inne i risk-badge-row
  assert.match(
    c,
    /<span class="risk-badge-row" id="risk-badge-row"> <button type="button" class="risk-badge cco-notis-bell" data-action="notiser"/
  );
  assert.match(html, /id="cco-notis-bell"/);
  assert.match(html, /id="cco-notis-count"/);
  // inte en bottom action-knapp
  assert.doesNotMatch(html, /class="action-btn[^"]*" type="button" data-action="notiser"/);
});

// ── Klick öppnar Notiser v3 som panel ────────────────────────────────────────

test('PR13: klockan wire:as till openNotiser (panel)', () => {
  assert.match(source, /const NOTISER_V3_SRC = '\/major-arcana-preview\/cco-notiser-v3\.html'/);
  assert.match(source, /function openNotiser\(\)/);
  assert.match(source, /action === 'notiser'\) openNotiser\(\)/);
  assert.match(compact(source), /const src = NOTISER_V3_SRC \+/);
  assert.match(
    compact(source),
    /openModal\(\{ title: 'Notiser', wide: true, tabs: panelTabs\('notiser'\), body: frame \}\)/
  );
});

test('PR13: notiscenter kräver ingen vald tråd men tar med kontext om den finns', () => {
  // ingen tråd-guard som blockerar (till skillnad från senare/klar)
  assert.match(source, /const live = getLiveConversationContext\(\);/);
  assert.match(compact(source), /if \(live && live\.conversationKey\) \{/);
  assert.match(
    compact(source),
    /postMessage\( \{ type: 'cco:notiser:context', context \}, window\.location\.origin \)/
  );
});

// ── Notiser v3 tar emot kontexten ────────────────────────────────────────────

test('PR13: notiser-v3 lyssnar på kontext-postMessage, validerar origin', () => {
  assert.match(notiser, /cco:notiser:context/);
  assert.match(notiser, /event\.origin !== window\.location\.origin/);
  assert.match(notiser, /window\.CCO_NOTISER_CONTEXT = context/);
});

test('PR13: notiser scopar till vald kund via befintlig notissökning', () => {
  assert.match(notiser, /function applyContext\(context\)/);
  assert.match(notiser, /querySelector\('input\[placeholder="Sök i notiser…"\]'\)/);
  assert.match(notiser, /search\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR13: bokning/kalender/senare/smart-anteckning orörda, ingen live-send', () => {
  assert.match(source, /const BOOKING_SRC = '\/major-arcana-preview\/cco-booking-wizard-v3\.html'/);
  assert.match(source, /const KALENDER_SRC = '\/kalender\.html'/);
  assert.match(source, /const SENARE_V3_SRC = '\/major-arcana-preview\/cco-senare-v3\.html'/);
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR13: konversationer.html cache-bustar efter notiser-koppling', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260703y-paneltargets/);

});
