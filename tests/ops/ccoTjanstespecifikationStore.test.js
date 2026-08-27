'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  listServiceSpecs,
  getServiceSpec,
  resolveServicePrice,
  getRequiredUnderlag,
  parsePriceKr,
} = require('../../src/ops/ccoTjanstespecifikationStore');

test('listar 82 tjänster ur meridiq-katalogen med stabil serviceId', () => {
  const all = listServiceSpecs();
  assert.equal(all.length, 82);
  for (const spec of all) {
    assert.ok(spec.serviceId, 'serviceId ska finnas');
    assert.equal(typeof spec.priceKr, 'number');
  }
});

test('getServiceSpec resolverar en tjänst via serviceId (apiId)', () => {
  const botox = getServiceSpec(7382);
  assert.ok(botox);
  assert.equal(botox.brand, 'Curatiio');
  assert.equal(botox.category, 'Estetiska injektioner · Curatiio');
  assert.match(botox.name, /Botox/);
  assert.equal(botox.priceKr, 2300);
  assert.equal(botox.priceLabel, '2 300 kr');
  assert.equal(botox.durationMin, 60);
});

test('resolveServicePrice returnerar priset, aldrig null för känd tjänst', () => {
  assert.equal(resolveServicePrice(7085), '24 000 kr');
  assert.equal(resolveServicePrice('saknas'), null);
});

test('getRequiredUnderlag är tom tills Fazlis arbetsblad fyllt serviceIds', () => {
  // Katalogens serviceIds är förberedda (tomma) — reverse-mappningen är redo
  // men ska inte fabricera underlag.
  assert.deepEqual(getRequiredUnderlag(7382), []);
  assert.deepEqual(getRequiredUnderlag('saknas'), []);
});

test('parsePriceKr tolkar "28 000 kr" -> 28000 och "0 kr" -> 0', () => {
  assert.equal(parsePriceKr('28 000 kr'), 28000);
  assert.equal(parsePriceKr('0 kr'), 0);
  assert.equal(parsePriceKr(3900), 3900);
});
