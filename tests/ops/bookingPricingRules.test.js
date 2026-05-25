'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveSlotPriceTier,
  resolveServicePriceForTier,
  applyPricingToSlot,
  normalizePricingRules,
} = require('../../src/ops/bookingPricingRules');

test('resolveSlotPriceTier detects evening and weekend tiers', () => {
  const rules = normalizePricingRules({});
  assert.equal(resolveSlotPriceTier('2026-05-20T16:30:00.000Z', rules), 'base');
  assert.equal(resolveSlotPriceTier('2026-05-20T17:00:00.000Z', rules), 'evening');
  assert.equal(resolveSlotPriceTier('2026-05-23T10:00:00.000Z', rules), 'weekend');
});

test('resolveServicePriceForTier uses migration defaults per tier', () => {
  const rules = normalizePricingRules({});
  const service = { id: 'prp-hair' };
  assert.equal(resolveServicePriceForTier(service, 'base', rules), 4300);
  assert.equal(resolveServicePriceForTier(service, 'evening', rules), 4800);
  assert.equal(resolveServicePriceForTier(service, 'weekend', rules), 5200);
});

test('applyPricingToSlot stamps priceTier and priceSek on slot', () => {
  const rules = normalizePricingRules({});
  const slot = {
    startsAt: '2026-05-20T17:00:00.000Z',
    serviceId: 'prp-hair',
    resourceId: 'louise',
  };
  const priced = applyPricingToSlot(slot, { id: 'prp-hair' }, rules);
  assert.equal(priced.priceTier, 'evening');
  assert.equal(priced.priceSek, 4800);
  assert.equal(priced.currency, 'SEK');
});
