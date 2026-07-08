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
  assert.match(source, /value: 30, label: '30 dgr'/);
  assert.match(source, /value: 90, label: '90 dgr'/);
  assert.match(source, /value: 365, label: '365 dgr'/);
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

test('hopfällbara sektioner (sticky) + auto-sync utan manuell knapp', () => {
  assert.match(source, /function collapsibleKicker\(/);
  assert.match(source, /collapsed: \{ mailboxes:/);
  assert.match(source, /setInterval\(loadStatus/);
  // "Synka nu"-knappen är borttagen — spegeln läses på schema.
  assert.doesNotMatch(source, /Synka nu/);
});
