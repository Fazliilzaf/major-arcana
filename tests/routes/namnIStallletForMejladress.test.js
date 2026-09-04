'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { namnUrEpost } = require('../../src/routes/staffPortal');

/**
 * ORD-211 — läsbart namn i personalportalens sidfot.
 *
 * UPPMÄTT I PROD 2026-09-04: av 24 konton i auth.json har NOLL ett namn.
 * Sju är riktiga personer; alla sju såg sin egen mejladress där kollegans
 * namn ska stå.
 *
 * Funktionen är en MELLANLÖSNING. Den riktiga åtgärden är att sätta namn på
 * kontona — det är ett datajobb och ägarens beslut, inte kodens.
 */

test('vanliga personadresser blir läsbara namn', () => {
  assert.equal(namnUrEpost('fazli@hairtpclinic.com'), 'Fazli');
  assert.equal(namnUrEpost('clara.r@hairtpclinic.com'), 'Clara R');
  assert.equal(namnUrEpost('britt-louise@hairtpclinic.com'), 'Britt Louise');
  assert.equal(namnUrEpost('EGZONA@hairtpclinic.com'), 'Egzona');
});

test('TESTKONTON GER NULL — hellre mejladressen än ett påhittat namn', () => {
  /**
   * 17 av de 24 kontona i prod är testkonton. "Codex-rootprobe-1781133865680"
   * i sidfoten hade varit sämre än adressen: det ser ut som ett namn någon
   * satt, och döljer att kontot inte hör hemma i produktionen.
   */
  for (const e of [
    'codex-promote-1781134744251@hairtpclinic.com',
    'risk-owner+hair-tp-clinic@arcana.local',
    'ops-owner+hair-tp-clinic@arcana.local',
  ]) {
    assert.equal(namnUrEpost(e), null, e);
  }
});

test('FUNKTIONSADRESSER GER NULL — de är inte personer', () => {
  // "Journal" eller "Kons" i sidfoten läser som ett förnamn. Det är det inte.
  for (const e of [
    'journal@curatiio.com',
    'kons@hairtpclinic.com',
    'info@curatiio.com',
    'owner@hairtpclinic.se',
    'no-reply@hairtpclinic.com',
    'faktura@hairtpclinic.com',
  ]) {
    assert.equal(namnUrEpost(e), null, e);
  }
});

test('skräp in ger null, inte skräp ut', () => {
  for (const e of [null, undefined, '', '@', 'a@b.se', 'x'.repeat(40) + '@b.se']) {
    assert.equal(namnUrEpost(e), null, JSON.stringify(e));
  }
});

test('RUTTEN FÖREDRAR ETT RIKTIGT NAMN — härledningen är sista utvägen', () => {
  /**
   * Ordningen spelar roll. Sätter någon ett riktigt namn på kontot ska det
   * vinna över härledningen, annars vore fältet meningslöst att fylla i.
   */
  const fs = require('node:fs');
  const path = require('node:path');
  const kod = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'routes', 'staffPortal.js'),
    'utf8'
  );
  const block = (kod.match(/name:\n[\s\S]{0,400}?auth\.email \?\? *\n?\s*null,/) || [''])[0];
  assert.ok(block.length > 0, 'hittade inte name-kedjan i /staff/me');
  const iNamn = block.indexOf('user.displayName');
  const iHarledd = block.indexOf('namnUrEpost');
  const iEpost = block.indexOf('auth.email ??');
  assert.ok(iNamn >= 0 && iHarledd > iNamn, 'härledningen ligger före det riktiga namnet');
  assert.ok(iEpost > iHarledd, 'mejladressen ligger före härledningen');
});
