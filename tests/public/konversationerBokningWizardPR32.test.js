'use strict';

/* PR 32 — Bokning-wizarden (cco-ny-bokning) blir full popup men med kolumnlayout
 * istället för slarvig fullbredd (den är ett formulär). Tre kolumner:
 * vänster = steg/progress + kund & behandling, mitten = aktivt formulärsteg,
 * höger = kundkontext / bokningssummering / varningar. Bottom bar kvar i samma
 * fasta docka-stil som resten. Interaktion + context-mottagare orörda. Ingen
 * live-send, ingen ny palett. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const wizPath = path.join(repoRoot, 'public', 'major-arcana-preview', 'cco-ny-bokning.html');
const wiz = fs.readFileSync(wizPath, 'utf8');

function compact(src) {
  return src.replace(/\s+/g, ' ');
}

test('PR32: wizarden fyller ytan (ingen 680px-spärr)', () => {
  const block = wiz.match(/\.wizard\s*\{[^}]*\}/);
  assert.ok(block, '.wizard-block saknas');
  assert.match(block[0], /width:\s*100%/);
  assert.match(block[0], /max-width:\s*none/);
  assert.doesNotMatch(block[0], /width:\s*680px/);
});

test('PR32: tre-kolumnslayout (vänster/mitten/höger)', () => {
  assert.match(wiz, /class="wiz-grid"/);
  assert.match(wiz, /class="wiz-left"/);
  assert.match(wiz, /class="wiz-mid"/);
  assert.match(wiz, /class="wiz-right"/);
  const grid = wiz.match(/\.wiz-grid\s*\{[^}]*\}/);
  assert.ok(grid, '.wiz-grid-block saknas');
  assert.match(grid[0], /grid-template-columns:\s*300px minmax\(0, 1fr\) 340px/);
});

test('PR32: vänster = steg/progress + kund & behandling', () => {
  // Stegen ligger i vänsterkolumnen och kund/behandling-kortet också.
  assert.match(compact(wiz), /class="wiz-left">.*class="steps".*Kund &amp; behandling/s);
});

test('PR32: höger = kundkontext / bokningssummering / varningar', () => {
  assert.match(
    compact(wiz),
    /class="wiz-right">.*Kundkontext.*Bokningssummering.*class="wiz-warning"/s
  );
});

test('PR32: bottom bar kvar som fast docka (samma stil)', () => {
  // Override-regeln gör footern till en fast docka (position: fixed först i blocket).
  assert.match(compact(wiz), /\.footer \{ position: fixed/);
  // Wizard-navigeringen finns kvar.
  assert.match(wiz, /class="btn btn--back"/);
  assert.match(wiz, /class="btn btn--next"/);
});

test('PR32: cco-polish dev-chrome lyfts ovanför dockan', () => {
  const block = wiz.match(/\.theme-toggle,\s*\.feedback-btn,\s*\.undo-btn\s*\{[^}]*\}/);
  assert.ok(block, 'chrome-lift saknas');
  assert.match(block[0], /bottom:\s*68px\s*!important/);
});

test('PR32: interaktion + context-mottagare orörda', () => {
  assert.match(wiz, /id="bkCustName"/);
  assert.match(wiz, /id="bkAiName"/);
  assert.match(wiz, /data\.type === 'cco:booking:context'/);
  assert.match(wiz, /class="day-pick/);
  assert.match(wiz, /class="slot/);
});

test('PR32: ingen live-send', () => {
  assert.doesNotMatch(wiz, /sendMail\(|graphSend|messages\/send/);
});
