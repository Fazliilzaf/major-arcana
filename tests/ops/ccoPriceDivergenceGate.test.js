'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  loadCcoCatalog,
  loadCliento,
  loadWebsite,
  comparePrices,
  parsePriceKr,
  parsePriceSpec,
  pricesDiverge,
  CLIENTO_API_MAP,
} = require('../../scripts/check-price-divergence');

function priceDivergences(d) {
  return d.filter((x) => !x.problem);
}
function missingServices(d) {
  return d.filter((x) => x.problem);
}

test('ORD-137: CCO-katalog → 0 divergenser, 0 saknade, "från"-pris och 2 nya tjänster matchar', () => {
  const cco = loadCcoCatalog();
  const d = comparePrices({ cco, cliento: loadCliento(), website: loadWebsite() });
  assert.equal(priceDivergences(d).length, 0);
  assert.equal(missingServices(d).length, 0);
  // stickprov — korrigeringar (ORD-134) + nya tjänster (ORD-137 §9)
  const m = cco.byApiId;
  assert.equal(m.get('7089').priceKr, 54000);
  assert.equal(m.get('7106').priceKr, 69000);
  assert.equal(m.get('7385').priceKr, 1400);
  assert.equal(m.get('cco-btx5').priceKr, 5400);
  assert.equal(m.get('cco-filler1ml').priceKr, 3600);
  // DHI Ärr är repots första "från"-pris (ORD-137 §3)
  assert.equal(m.get('7414').priceKr, 15000);
  assert.equal(m.get('7414').from, true);
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

test('mutation: DHI Ärr-golvet höjs → grinden larmar på olika golv', () => {
  const cco = loadCcoCatalog();
  cco.byApiId.get('7414').priceKr = 16000; // golvet höjt — hemsidan säger fortfarande 15000
  const d = comparePrices({ cco, cliento: loadCliento(), website: loadWebsite() });
  const hit = priceDivergences(d).find((x) => x.apiId === '7414');
  assert.ok(hit, 'två olika golv ska upptäckas');
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

test('parsePriceSpec tolkar "från 15 000 kr" → { amount: 15000, from: true }', () => {
  assert.deepEqual(parsePriceSpec('från 15 000 kr'), { amount: 15000, from: true });
  assert.deepEqual(parsePriceSpec('15 000 kr'), { amount: 15000, from: false });
  assert.deepEqual(parsePriceSpec(15000), { amount: 15000, from: false });
});

test('pricesDiverge: fast pris på/över golvet är konsekvent, under golvet larmar', () => {
  const floor = { priceKr: 15000, from: true };
  assert.equal(pricesDiverge(floor, { priceKr: 15000, from: false }), false); // exakt golvet
  assert.equal(pricesDiverge(floor, { priceKr: 18000, from: false }), false); // över golvet
  assert.equal(pricesDiverge(floor, { priceKr: 14000, from: false }), true);  // under golvet
  assert.equal(pricesDiverge(floor, { priceKr: 15000, from: true }), false);  // samma golv
  assert.equal(pricesDiverge(floor, { priceKr: 16000, from: true }), true);   // olika golv
  assert.equal(pricesDiverge({ priceKr: 5400, from: false }, { priceKr: 5300, from: false }), true);
});

test('mappningstabellen är explicit (srvId → apiId), inte namnlikhet', () => {
  assert.equal(CLIENTO_API_MAP['58000'], '7105'); // "Ögonlocksplastik · Total" → "Övre och nedre"
  assert.equal(CLIENTO_API_MAP['50559'], '7116'); // "PRP · Skägg" → "PRP: Skägg"
});
