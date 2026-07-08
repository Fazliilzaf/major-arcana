'use strict';

/* PR 12 — "Öppna bokning" pekar på "CCO · Ny bokning"-ytan (Boka behandling-
 * wizarden, public/major-arcana-preview/cco-ny-bokning.html) — same origin, INTE
 * file://. Detta är användarens uttryckliga, låsta val (INTE den äldre
 * Bokningsguiden cco-booking-wizard-v3). Öppnas som panel med vald tråds kontext
 * via samma origin-validerade postMessage-mönster. Ingen live-send.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const bookingPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-ny-bokning.html');

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const booking = fs.readFileSync(bookingPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── Boka behandling-wizarden finns i repot (ingen file://) ───────────────────

test('PR12: Ny bokning-wizarden finns i repot', () => {
  assert.match(booking, /<title>CCO · Ny bokning<\/title>/);
  assert.match(booking, /Boka behandling/);
});

// ── "Öppna bokning" pekar på cco-ny-bokning (användarens låsta val) ──────────

test('PR12: Öppna bokning pekar på cco-ny-bokning.html via same-origin', () => {
  assert.match(source, /const BOOKING_SRC = '\/major-arcana-preview\/cco-ny-bokning\.html'/);
  // BOOKING_SRC får inte peka på den äldre Bokningsguiden (kommentar-omnämnande
  // är ok — vi kollar bara själva konstanten).
  assert.doesNotMatch(source, /BOOKING_SRC = '[^']*cco-booking-wizard-v3/);
  assert.doesNotMatch(source, /BOOKING_V3_SRC/);
  assert.doesNotMatch(source, /file:\/\//, 'ingen file:// som mål');
  assert.match(source, /function openBokningsyta\(\)/);
  assert.match(compact(source), /const src = BOOKING_SRC \+/);
  assert.match(source, /action === 'bokningsyta'\) openBokningsyta\(\)/);
});

test('PR12: bokning öppnas i iframe-panel (openModal wide) med kontext', () => {
  assert.match(source, /title: 'Ny bokning'/);
  assert.match(compact(source), /openModal\(\{ title: 'Öppna bokning', wide: true,/);
  assert.match(source, /const context = buildSmartAnteckningContext\(\);/);
  assert.match(
    compact(source),
    /postMessage\( \{ type: 'cco:booking:context', context \}, window\.location\.origin \)/
  );
});

test('PR12: små fält (kund/email/tråd/ämne/mailbox) skickas i query', () => {
  assert.match(source, /params\.set\('kund', context\.customerName\)/);
  assert.match(source, /params\.set\('email', context\.email\)/);
  assert.match(source, /params\.set\('trad', context\.conversationKey\)/);
  assert.match(source, /params\.set\('amne', context\.subject\)/);
  assert.match(source, /params\.set\('mailbox', context\.mailboxId\)/);
});

// ── Prototypen tar emot kontexten (origin-validerad) ─────────────────────────

test('PR12: wizarden lyssnar på kontext-postMessage, validerar origin', () => {
  assert.match(booking, /cco:booking:context/);
  assert.match(booking, /event\.origin !== window\.location\.origin/);
  assert.match(booking, /window\.CCO_BOOKING_CONTEXT = context/);
});

test('PR12: wizarden fyller kund-platsen med vald tråds kund', () => {
  assert.match(booking, /function applyContext\(context\)/);
  assert.match(booking, /getElementById\('bkCustName'\)/);
  assert.match(booking, /getElementById\('bkAiName'\)/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR12: kalender/senare/smart-anteckning v3 orörda, ingen live-send', () => {
  assert.match(source, /const KALENDER_SRC = '\/kalender\.html'/);
  assert.match(source, /const SENARE_V3_SRC = '\/major-arcana-preview\/cco-senare-v3\.html'/);
  assert.match(
    source,
    /const SMART_ANTECKNING_V3_SRC = '\/major-arcana-preview\/cco-smart-anteckning-v3\.html'/
  );
  assert.match(source, /const recipientMissing = !recipientEmail/);
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR12: konversationer.html cache-bustar efter bokningsbyte', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260708a-svarstudio-cache/);
});
