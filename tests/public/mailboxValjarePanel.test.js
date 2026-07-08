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

test('folder-scope (Inkorg/Skickat/Utkast) + läsfönster (30/90/365)', () => {
  assert.match(source, /value: 'inbox', label: 'Inkorg'/);
  assert.match(source, /value: 'sent', label: 'Skickat'/);
  assert.match(source, /value: 'drafts', label: 'Utkast'/);
  assert.match(source, /value: 30, label: '30 d'/);
  assert.match(source, /value: 90, label: '90 d'/);
  assert.match(source, /value: 365, label: '365 d'/);
});

test('sticky val i localStorage + läser mailboxes-endpointen (data kommer senare)', () => {
  assert.match(source, /cco_mailbox_valjare_v1/);
  assert.match(source, /localStorage/);
  assert.match(source, /'\/api\/v1\/cco\/runtime\/mailboxes'/);
  // Väntar-på-data-status när kontraktet ännu inte finns.
  assert.match(source, /väntar på data/);
});

test('driver inte inkorgen ännu — dispatchar bara selection-change för datalagret', () => {
  assert.match(source, /cco:mailbox-selection-change/);
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

test('design-finish matchar CCO: avatar-cirkel + skugga, segment-vit yta', () => {
  // Avatar = 24px cirkel med CCO .wb-mbx-avatar-skugga (inte platt kvadrat).
  assert.match(
    source,
    /\.mbv-av\{width:24px;height:24px;border-radius:999px;[^}]*box-shadow:inset 0 1px 0 rgba\(255,255,255,\.4\),0 2px 6px rgba\(56,40,28,\.2\)/
  );
  // Segment-container = ljus translucent vit (som .inbox-tabs), slimmad.
  assert.match(
    source,
    /\.mbv-seg\{[^}]*background:rgba\(255,255,255,\.5\);border-radius:9px;padding:2px;gap:2px/
  );
});

test('kompakt filter-toolbar (inline-etikett) + mjuk kryssruta', () => {
  // Folder-scope/läsfönster som inline-enhet: liten gemen etikett bredvid segmentet.
  assert.match(source, /\.mbv-unit\{display:flex;align-items:center/);
  assert.match(source, /\.mbv-inlabel\{/);
  assert.match(source, /class: 'mbv-unit'/);
  // Kryssruta: mjuk rosa ton (inte klarrosa fylld ruta).
  assert.match(source, /\.mbv-row\.on \.mbv-chk[^}]*background:rgba\(187,71,121,\.13\)/);
});

test('hopfällbara sektioner (sticky) + auto-sync utan manuell knapp', () => {
  assert.match(source, /function collapsibleKicker\(/);
  assert.match(source, /collapsed: \{ mailboxes:/);
  assert.match(source, /setInterval\(loadStatus/);
  // "Synka nu"-knappen är borttagen — spegeln läses på schema.
  assert.doesNotMatch(source, /Synka nu/);
});
