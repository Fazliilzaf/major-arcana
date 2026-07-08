'use strict';

/* PR 11 — "Lägg senare" i admin#cco → Konversationer öppnar Senare v3
 * (cco-senare-v3.html) som panel. Backend-action reply_later försvinner INTE —
 * den körs först när användaren bekräftar snooze-tid i panelen (inte ett-klicks-
 * snooze från bottenknappen). Kontext (conversationKey, kund, mailbox, ämne,
 * senaste meddelanden, customerId) via samma origin-validerade postMessage-
 * mönster. Ingen live-send, ingen ny design.
 *
 * Tester: wiring/guard (källkod) + att panelen tar emot kontexten och POSTar
 * reply_later korrekt (med customerId) via sitt eget snooze-flöde. */

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

// ── "Lägg senare" öppnar panelen, inte ett-klicks-snooze ─────────────────────

test('PR11: Lägg senare öppnar Senare v3-panelen (inte direkt reply_later)', () => {
  assert.match(source, /const SENARE_V3_SRC = '\/major-arcana-preview\/cco-senare-v3\.html'/);
  assert.match(source, /function openSenarePanel\(\)/);
  assert.match(source, /action === 'senare'\) openSenarePanel\(\)/);
  // ett-klicks-snoozen är borta från bottenknappen
  assert.doesNotMatch(source, /action === 'senare'\) runConversationAction/);
  assert.match(compact(source), /const src = SENARE_V3_SRC \+/);
});

test('PR11: panelen öppnas som iframe (openModal wide) med kontext', () => {
  assert.match(source, /title: 'Lägg senare v3'/);
  assert.match(compact(source), /openModal\(\{ title: 'Lägg senare', wide: true,/);
  assert.match(
    compact(source),
    /postMessage\( \{ type: 'cco:senare:context', context \}, window\.location\.origin \)/
  );
});

test('PR11: panelen öppnar även i webb/demo, men confirm låses utan live-tråd', () => {
  assert.match(source, /const live = getLiveConversationContext\(\);/);
  assert.match(source, /const customerId =/);
  assert.match(source, /resolveThreadCustomerEmail\(live\)/);
  assert.match(source, /live\.conversationKey !== 'visible-thread'/);
  assert.match(source, /context\.canConfirm = canConfirm/);
  assert.match(source, /context\.confirmDisabledReason = canConfirm/);
  assert.match(source, /if \(!canConfirm\) params\.set\('readonly', '1'\)/);
  assert.match(source, /params\.set\('cid', customerId\)/);
});

// ── Klar/Reopen fortfarande snabb-actions ────────────────────────────────────

test('PR11: Klar och Återöppna är kvar som snabb-actions', () => {
  assert.match(source, /action === 'klar'\) runConversationAction\('handled'\)/);
  assert.match(source, /action === 'reopen'\) runConversationAction\('reopen'\)/);
});

// ── Panelen tar emot kontexten och kör reply_later vid Bekräfta ──────────────

test('PR11: senare-v3 lyssnar på kontext-postMessage, validerar origin', () => {
  assert.match(senare, /cco:senare:context/);
  assert.match(senare, /event\.origin !== window\.location\.origin/);
  assert.match(senare, /window\.CCO_SENARE_CONTEXT = context/);
});

test('PR11: panelen injicerar vald tråd i sin lista och öppnar den', () => {
  assert.match(senare, /function applyContext\(context\)/);
  assert.match(senare, /THREADS\.unshift\(thread\)/);
  assert.match(senare, /if \(typeof openThread === 'function'\) openThread\(thread\.id\)/);
  // trådens riktiga conversationKey + customerId bärs på det injicerade objektet
  assert.match(senare, /key: key,/);
  assert.match(senare, /customerId: String\(context\.customerId \|\| ''\) \|\| undefined/);
  assert.match(senare, /canConfirm: context\.canConfirm !== false && key !== 'visible-thread'/);
  assert.match(senare, /confirmDisabledReason: String\(/);
});

test('PR11: panelens bekräftelse-knappar spärras i readonly-läge', () => {
  assert.match(senare, /if \(t\.canConfirm === false\)/);
  assert.match(senare, /flashNotice\(/);
  assert.match(senare, /const disabledAttr =/);
  assert.match(senare, /data-act="reopen"\$\{disabledAttr\}/);
  assert.match(senare, /data-act="snooze"\$\{disabledAttr\}/);
  assert.match(senare, /data-act="handled"\$\{disabledAttr\}/);
  assert.match(senare, /canConfirm: q\.get\('readonly'\) !== '1'/);
});

test('PR11: panelens reply_later POSTar customerId (annars 409 i backend)', () => {
  // doAction skickar nu customerId när tråden har det (injicerad från Konversationer).
  assert.match(senare, /if \(t\.customerId\) body\.customerId = t\.customerId/);
  // snooze-Bekräfta använder fortfarande panelens egna reply_later-flöde
  assert.match(senare, /doAction\(tid, 'reply_later', iso\)/);
  assert.match(senare, /conversation\/\$\{t\.key\}\/action/);
});

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR11: bokning/kalender/smart-anteckning v3 orörda, ingen live-send', () => {
  assert.match(source, /const BOOKING_SRC = /);
  assert.match(source, /const KALENDER_SRC = '\/kalender\.html'/);
  assert.match(source, /const SMART_ANTECKNING_V3_SRC = /);
  assert.doesNotMatch(source, /sendMail\(|graphSend|messages\/send/);
});

// ── Cache-bust ───────────────────────────────────────────────────────────────

test('PR11: konversationer.html cache-bustar efter senare-koppling', () => {
  assert.match(html, /konversationer-bottom-actions\.js\?v=20260708c-svarstudio-cache/);
});
