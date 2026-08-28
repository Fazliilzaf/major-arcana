'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  loadMeridiq,
  loadCliento,
  loadWebsite,
  comparePrices,
  parsePriceKr,
  CLIENTO_API_MAP,
} = require('../../scripts/check-price-divergence');

function correctedMeridiq() {
  const meridiq = loadMeridiq();
  const website = loadWebsite();
  for (const w of website.services) {
    const m = meridiq.byApiId.get(w.apiId);
    if (m) m.priceKr = w.priceKr;
  }
  return meridiq;
}

test('korrigerad Meridiq → 0 divergenser (grön)', () => {
  const d = comparePrices({ meridiq: loadMeridiq(), cliento: loadCliento(), website: loadWebsite() });
  assert.equal(d.length, 0);
  // korrigeringen är tillämpad — stickprov mot hemsidan (FUE 4500 = +2 000, Lip Flip = −400)
  const m = loadMeridiq().byApiId;
  assert.equal(m.get('7089').priceKr, 54000);
  assert.equal(m.get('7106').priceKr, 69000);
  assert.equal(m.get('7385').priceKr, 1400);
});

test('rättad katalog → 0 divergenser (grön)', () => {
  const d = comparePrices({ meridiq: correctedMeridiq(), cliento: loadCliento(), website: loadWebsite() });
  assert.equal(d.length, 0);
});

test('mutation: ett pris glider → larmet går (röd)', () => {
  const meridiq = correctedMeridiq();
  meridiq.byApiId.get('7089').priceKr = 53000; // ska vara 54000
  const d = comparePrices({ meridiq, cliento: loadCliento(), website: loadWebsite() });
  assert.equal(d.length, 1);
  assert.equal(d[0].apiId, '7089');
  assert.equal(d[0].meridiq, 53000);
  assert.equal(d[0].website, 54000);
});

test('Cliento-rättningen (Skägg-PRP 50559 → 4 300) ger ingen Cliento-divergens', () => {
  const cliento = loadCliento();
  assert.equal(cliento.bySrvId.get('50559').priceKr, 4300);
  const d = comparePrices({ meridiq: loadMeridiq(), cliento, website: loadWebsite() });
  assert.equal(d.filter((x) => x.source === 'cliento').length, 0);
});

test('parsePriceKr tolkar "51 000 kr" → 51000 och "0 kr" → 0', () => {
  assert.equal(parsePriceKr('51 000 kr'), 51000);
  assert.equal(parsePriceKr('0 kr'), 0);
  assert.equal(parsePriceKr(3900), 3900);
});

test('mappningstabellen är explicit (srvId → apiId), inte namnlikhet', () => {
  assert.equal(CLIENTO_API_MAP['58000'], '7105'); // "Ögonlocksplastik · Total" → "Övre och nedre"
  assert.equal(CLIENTO_API_MAP['50559'], '7116'); // "PRP · Skägg" → "PRP: Skägg"
});
