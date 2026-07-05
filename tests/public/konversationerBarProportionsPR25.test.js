'use strict';

/* PR 25 — Proportioner & Svarstudio-paritet.
 * (1) Svarstudio (workbench-modalen) får samma storlek som de andra v3-vyerna
 *     (98vw × 96vh, inte kapad till 1240px), och dess flik-rad (11 flikar) får
 *     en egen full-breddsrad så den inte kläms bort av status-chipsen.
 * (2) Bottom action-baren i konversations-/kund-vyerna (Senare, Smart anteckning,
 *     Dossier) krymps till proportionerlig storlek (36px hög knapp, 12px text)
 *     och reserverar rätt utrymme så inget överlappar. Ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');

const konv = read('public', 'konversationer.html');
const senare = read('public', 'major-arcana-preview', 'cco-senare-v3.html');
const smart = read('public', 'major-arcana-preview', 'cco-smart-anteckning-v3.html');
const dossier = read('public', 'major-arcana-preview', 'cco-patient-hub-v3.html');

const barViews = [
  ['senare', senare],
  ['smart', smart],
  ['dossier', dossier],
];

// ── Svarstudio-paritet (storlek) ─────────────────────────────────────────────

test('PR25: workbench-modalen är lika stor som de andra vyerna (98vw × 96vh)', () => {
  const block = konv.match(/\.action-modal--workbench\s*\{[^}]*\}/);
  assert.ok(block, 'workbench-block saknas');
  assert.match(block[0], /width:\s*98vw/);
  assert.match(block[0], /height:\s*96vh/);
  // Den gamla 1240px-kapningen ska vara borta.
  assert.doesNotMatch(block[0], /max-width:\s*1240px/);
});

// ── Svarstudio-paritet (flik-raden syns) ─────────────────────────────────────

test('PR25 (rev 2026-07-05): workbench-flikarna ligger på titelraden — chipsen tar fullbreddsraden', () => {
  // Ägar-beslut: flikraden ska ha samma position i Svarstudio som i övriga
  // vyer (titelraden). Status-chipsen flyttar till egen rad istället.
  const tabsBlock = konv.match(/\.action-modal--workbench \.action-modal-tabs\s*\{[^}]*\}/);
  assert.ok(tabsBlock, 'workbench-tabs-override saknas');
  assert.match(tabsBlock[0], /order:\s*0/, 'flikarna ska ligga i titelradens flöde');
  assert.match(tabsBlock[0], /min-width:\s*0/, 'flikarna ska kunna krympa (scroll, inte wrap)');
  assert.ok(!/flex-basis:\s*100%/.test(tabsBlock[0]), 'flikarna får inte ta egen fullbreddsrad');
  const chipsBlock = konv.match(/\.action-modal--workbench \.wb-head-chips\s*\{[^}]*\}/);
  assert.ok(chipsBlock, 'workbench-chips-override saknas');
  assert.match(chipsBlock[0], /flex-basis:\s*100%/, 'chipsen ska ta fullbreddsraden under');
});

// ── Bottom-bar-proportioner ──────────────────────────────────────────────────

for (const [name, src] of barViews) {
  test(`PR25: ${name} har den kompakta baren (36px hög, 12px text)`, () => {
    const block = src.match(/\.thread-bottom-actions \.action-btn\s*\{[^}]*\}/);
    assert.ok(block, `${name}: action-btn-block saknas`);
    assert.match(block[0], /min-height:\s*36px/);
    assert.match(block[0], /700 12px/);
    assert.match(block[0], /padding:\s*8px 14px/);
    // Den gamla chunkiga baren ska vara borta.
    assert.doesNotMatch(block[0], /min-height:\s*46px/);
    assert.doesNotMatch(block[0], /padding:\s*13px 18px/);
  });
}

// ── Regler behållna ──────────────────────────────────────────────────────────

test('PR25: ingen live-send introducerad', () => {
  for (const [, src] of barViews) {
    assert.doesNotMatch(src, /sendMail\(|graphSend|messages\/send/);
  }
});
