'use strict';

/* Brevlåde-väljare för CCO Konversationer (design först). Renderar väljare +
 * status + folder-scope + läsfönster i befintlig layout/palett. Sticky val i
 * localStorage. Läser mailboxes-endpointen när den finns; datakontraktet kommer
 * senare. Ändrar ingen live-send, inga nya färger. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../../public/konversationer-mailbox-valjare.js'),
  'utf8'
);
const page = fs.readFileSync(path.join(__dirname, '../../public/konversationer.html'), 'utf8');

test('modulen laddas i konversationer.html', () => {
  assert.match(page, /konversationer-mailbox-valjare\.js/);
});

test('alla åtta brevlådor finns (Kons, Contact, Egzona, Fazli, Marknad, Kvitto, Hälso + Alla)', () => {
  for (const label of ['Kons', 'Contact', 'Egzona', 'Fazli', 'Marknad', 'Kvitto', 'Hälso']) {
    assert.match(source, new RegExp("label: '" + label + "'"));
  }
  // "Alla" = select-all i UI:t.
  assert.match(source, /'Alla'/);
});

test('monteras i befintliga ytor (vänsterräl + inkorg-header), ingen omdesign', () => {
  assert.match(source, /getElementById\('lane-sidebar'\)/);
  assert.match(source, /querySelector\('\.inbox-shell'\)/);
  assert.match(source, /\.inbox-tabs/);
});

test('visar ärligt datakontrakt i stället för oinkopplade mapp-/dagfilter', () => {
  assert.match(source, /Inkorg \+ Skickat · hela historiken/);
  assert.doesNotMatch(source, /value: 'drafts', label: 'Utkast'/);
  assert.doesNotMatch(source, /value: 90, label: '90'/);
});

test('sticky val i localStorage + läser mailboxes-endpointen', () => {
  assert.match(source, /cco_mailbox_valjare_v2/);
  assert.match(source, /mailboxIds: \['contact@hairtpclinic\.com'\]/);
  assert.match(source, /localStorage/);
  assert.match(source, /'\/api\/v1\/cco\/runtime\/mailboxes'/);
  // Väntar-på-data-status när kontraktet ännu inte finns.
  assert.match(source, /väntar på data/);
});

test('driver inkorgen via selection-change till det befintliga datalagret', () => {
  assert.match(source, /cco:mailbox-selection-change/);
  assert.match(page, /document\.addEventListener\('cco:mailbox-selection-change'/);
  assert.match(page, /liveWorklistUrl\(mailboxChunk\)/);
  assert.match(page, /WORKLIST_MAX_MAILBOXES_PER_REQUEST = 2/);
  assert.match(page, /for \(const mailboxChunk of chunkMailboxIds\(requestMailboxIds\)\)/);
  assert.match(page, /currentThreads = mergeWorklistThreads\(normalizedThreads\)/);
  assert.match(page, /selectedMailboxIds = requested/);
  assert.doesNotMatch(page, /const LIVE_WORKLIST_URL/);
});

test('tomt mailbox-val tömmer inkorgen ärligt i stället för att visa föregående konto', () => {
  assert.match(page, /if \(!selectedMailboxIds\.length\)/);
  assert.match(page, /Välj minst en brevlåda i vänsterspalten/);
});

test('sen selection vinner över ett redan pågående worklist-anrop', () => {
  assert.match(page, /liveInboxReloadQueued = true/);
  assert.match(page, /requestMailboxKey !== selectedMailboxIds\.join\(','\)/);
});

test('ingen ny färg: använder befintliga CCO-tokens', () => {
  assert.match(source, /--accent-studio/);
  assert.match(source, /--rail-contact/);
  assert.match(source, /--cco-status-danger/);
});

test('matchar CCO: neutralt mörk namntext, inte rosa-tvätt', () => {
  // Namnet blir neutralt mörkt när valt (som lane-row.active), inte accent-rosa.
  assert.match(source, /\.mbv-row\.on \.mbv-name\{color:#1d1e24/);
  // Segmenterad aktiv = vit yta + brand-text (som inbox-tab.active), inte rosa text.
  assert.match(source, /\.mbv-seg button\.on\{[^}]*color:var\(--cco-color-brand/);
});

test('design-finish matchar CCO: avatar som tråd-kort (mjuk gradient-cirkel), segment-vit yta', () => {
  // Avatar = rund gradient-cirkel som .thread-av (ingen räls), len skugga.
  assert.match(
    source,
    /\.mbv-av\{width:26px;height:26px;border-radius:999px;[^}]*linear-gradient\(180deg,rgba\(255,255,255,\.35\)[^}]*box-shadow:inset 0 1px 0 rgba\(255,255,255,\.4\),0 2px 6px rgba\(56,40,28,\.16\)/
  );
  // Rälsen är borttagen — avataren bär färgen.
  assert.doesNotMatch(source, /class: 'mbv-rail'/);
  // Segment-container = ljus translucent vit (som .inbox-tabs), slimmad.
  assert.match(
    source,
    /\.mbv-seg\{[^}]*background:rgba\(255,255,255,\.5\);border-radius:9px;padding:2px;gap:2px/
  );
});

test('kompakt datatäckningsrad + mjuk kryssruta', () => {
  assert.match(source, /class: 'mbv-sum'/);
  // Kryssruta: mjuk rosa ton (inte klarrosa fylld ruta).
  assert.match(source, /\.mbv-row\.on \.mbv-chk[^}]*background:rgba\(187,71,121,\.13\)/);
});

test('datatäckningen tar minimal plats och visar statisk sann status', () => {
  assert.match(source, /Inkorg \+ Skickat · hela historiken/);
  assert.match(source, /class: 'mbv-sum'/);
});

test('hopfällbara sektioner (sticky) + auto-sync utan manuell knapp', () => {
  assert.match(source, /function collapsibleKicker\(/);
  assert.match(source, /collapsed: \{ mailboxes:/);
  assert.match(source, /setInterval\(loadStatus/);
  // "Synka nu"-knappen är borttagen — spegeln läses på schema.
  assert.doesNotMatch(source, /Synka nu/);
});
