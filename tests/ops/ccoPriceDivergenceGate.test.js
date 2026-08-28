'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  loadCcoCatalog,
  loadCliento,
  loadWebsite,
  comparePrices,
  parsePriceKr,
  CLIENTO_API_MAP,
} = require('../../scripts/check-price-divergence');

function priceDivergences(d) {
  return d.filter((x) => !x.problem);
}
function missingServices(d) {
  return d.filter((x) => x.problem);
}

test('korrigerad CCO-katalog → 0 prisdivergenser, 2 publicerade tjänster saknas i CCO', () => {
  const d = comparePrices({ cco: loadCcoCatalog(), cliento: loadCliento(), website: loadWebsite() });
  assert.equal(priceDivergences(d).length, 0);
  assert.equal(missingServices(d).length, 2);
  assert.ok(missingServices(d).some((x) => /Rynkbehandling BTX, 5/.test(x.name)));
  assert.ok(missingServices(d).some((x) => /Filler 1 ml/.test(x.name)));
  // korrigeringen tillämpad — stickprov (FUE 4500 = +2 000, inte +3 000; Lip Flip = −400)
  const m = loadCcoCatalog().byApiId;
  assert.equal(m.get('7089').priceKr, 54000);
  assert.equal(m.get('7106').priceKr, 69000);
  assert.equal(m.get('7385').priceKr, 1400);
});

test('mutation: ett pris glider → larmet pekar ut exakt raden', () => {
  const cco = loadCcoCatalog();
  cco.byApiId.get('7089').priceKr = 53000; // ska vara 54000
  const d = comparePrices({ cco, cliento: loadCliento(), website: loadWebsite() });
  const hit = priceDivergences(d).find((x) => x.apiId === '7089');
  assert.ok(hit, 'mutationen ska upptäckas');
  assert.equal(hit.cco, 53000);
  assert.equal(hit.website, 54000);
});

test('Cliento-rättningen (Skägg-PRP 50559 → 4 300) ger ingen Cliento-divergens', () => {
  const cliento = loadCliento();
  assert.equal(cliento.bySrvId.get('50559').priceKr, 4300);
  const d = comparePrices({ cco: loadCcoCatalog(), cliento, website: loadWebsite() });
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
