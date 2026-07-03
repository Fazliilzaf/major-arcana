'use strict';

/* PR 9 — "Öppna bokning" i admin#cco → Konversationer öppnar Bokningsguide v3
 * (cco-booking-wizard-v3.html) som panel, scoped till vald tråds kund. Repo-v3
 * är verifierat nyare än iCloud-prototypen. Kontext (conversationKey, kund,
 * mailbox, ämne, senaste meddelanden) skickas via samma origin-validerade
 * postMessage-mönster som Smart anteckning v3. Ingen live-send, ingen ny design.
 *
 * Tester: wiring/guard (källkod) + att v3-wizarden tar emot kontexten. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const actionsPath = path.join(repoRoot, 'public', 'konversationer-bottom-actions.js');
const htmlPath = path.join(repoRoot, 'public', 'konversationer.html');
const bookingPath = path.join(
  repoRoot,
  'public',
  'major-arcana-preview',
  'cco-booking-wizard-v3.html'
);

const source = fs.readFileSync(actionsPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const booking = fs.readFileSync(bookingPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

// ── "Öppna bokning" öppnar Bokningsguide v3 med kontext ──────────────────────

test('PR9: Öppna bokning pekar på Bokningsguide v3 via same-origin (ingen fil)', () => {
  assert.match(
    source,
    /const BOOKING_V3_SRC = '\/major-arcana-preview\/cco-booking-wizard-v3\.html'/
  );
  assert.doesNotMatch(source, /file:\/\//, 'ingen file:// som mål');
  assert.match(source, /function openBokningsyta\(\)/);
  assert.match(compact(source), /const src = BOOKING_V3_SRC \+/);
  assert.match(source, /action === 'bokningsyta'\) openBokningsyta\(\)/);
});

test('PR9: bokning öppnas i iframe-panel (openModal wide)', () => {
  assert.match(source, /title: 'Bokningsguide v3'/);
  assert.match(compact(source), /openModal\(\{ title: 'Öppna bokning', wide: true,/);
});

test('PR9: kontexten byggs från vald live-tråd och skickas via postMessage', () => {
  // Återanvänder buildSmartAnteckningContext (kund, conversationKey, ämne,
  // mailbox, e-post, senaste meddelanden).
  assert.match(source, /const context = buildSmartAnteckningContext\(\);/);
  assert.match(source, /frame\.addEventListener\('load'/);
  assert.match(
    compact(source),
    /postMessage\( \{ type: 'cco:booking:context', context \}, window\.location\.origin \)/
  );
});

test('PR9: små fält (kund/email/tråd/ämne/mailbox) skickas i query', () => {
  assert.match(source, /params\.set\('kund', context\.customerName\)/);
  assert.match(source, /params\.set\('email', context\.email\)/);
  assert.match(source, /params\.set\('trad', context\.conversationKey\)/);
  assert.match(source, /params\.set\('amne', context\.subject\)/);
  assert.match(source, /params\.set\('mailbox', context\.mailboxId\)/);
});

test('PR9: gamla demo-bokningsmodalen är borttagen', () => {
  assert.doesNotMatch(source, /Kopplad bokning: PRP tor 28 maj/);
  assert.doesNotMatch(source, /Markera ankommen/);
});

// ── v3-wizarden tar emot kontexten ───────────────────────────────────────────

test('PR9: booking-wizard v3 lyssnar på kontext-postMessage, validerar origin', () => {
  assert.match(booking, /cco:booking:context/);
  assert.match(booking, /event\.origin !== window\.location\.origin/);
  assert.match(booking, /window\.CCO_BOOKING_CONTEXT = context/);
});

test('PR9: v3 scopar till vald kund via befintlig kundsökning (ingen ny design)', () => {
  assert.match(booking, /function applyContext\(context\)/);
  assert.match(booking, /document\.getElementById\('custSearch'\)/);
  assert.match(booking, /search\.dispatchEvent\(new Event\('input', \{ bubbles: true \}\)\)/);
  // Trådens kund läggs i listan om den saknas.
  assert.match(booking, /window\.CUSTOMERS\.unshift\(/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR9: Smart anteckning v3 + send-lås orörda, ingen live-send', () => {
  assert.match(
    source,
    /const SMART_ANTECKNING_V3_SRC = '\/major-arcana-preview\/cco-smart-anteckning-v3\.html'/
  );
  assert.match(source, /const recipientMissing = !recipientEmail/);
  assert.match(source, /Skickat för godkännande/);
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR9: konversationer.html cache-bustar efter bokningskoppling', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260703n-senare/);
});
