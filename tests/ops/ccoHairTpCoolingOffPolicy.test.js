'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HAIR_TP_COOLING_OFF_DAYS,
  resolveHairTpCoolingOffDays,
  coolingOffDaysForNewHairTpRecord,
} = require('../../src/ops/ccoHairTpCoolingOffPolicy');

test('Hair TP default cooling off is 2 days', () => {
  assert.equal(HAIR_TP_COOLING_OFF_DAYS, 2);
  assert.equal(resolveHairTpCoolingOffDays(), 2);
  assert.equal(coolingOffDaysForNewHairTpRecord(), 2);
});

test('legacy stored coolingOffDays 14 is preserved when explicitly set', () => {
  assert.equal(resolveHairTpCoolingOffDays(14), 14);
  assert.equal(coolingOffDaysForNewHairTpRecord(14), 14);
});
