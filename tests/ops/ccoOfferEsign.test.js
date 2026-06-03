'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { addDaysIso, canAcceptOffer, getCoolingOffMeta } = require('../../src/ops/ccoOfferEsign');
const { HAIR_TP_COOLING_OFF_DAYS } = require('../../src/ops/ccoHairTpCoolingOffPolicy');
const {
  listOfferTemplates,
  resolveTemplateKeyFromPlan,
} = require('../../src/ops/ccoOfferTemplateStore');

test('listOfferTemplates returns 14 templates', () => {
  assert.equal(listOfferTemplates().length, 14);
});

test('offer templates use Hair TP 2-day cooling off', () => {
  for (const t of listOfferTemplates()) {
    assert.equal(t.coolingOffDays, HAIR_TP_COOLING_OFF_DAYS);
  }
});

test('resolveTemplateKeyFromPlan picks combo template for FUE + PRP', () => {
  const key = resolveTemplateKeyFromPlan({
    fields: { method: 'FUE', prpIncluded: true, zones: ['Front'] },
  });
  assert.equal(key, 'combo-fue-prp');
});

test('canAcceptOffer blocks during cooling off', () => {
  const sentAt = '2026-05-22T10:00:00.000Z';
  const gate = canAcceptOffer(
    {
      quoteStatus: 'sent',
      quoteSentAt: sentAt,
      coolingOffEndsAt: addDaysIso(sentAt, HAIR_TP_COOLING_OFF_DAYS),
    },
    { nowMs: Date.parse('2026-05-23T10:00:00.000Z') }
  );
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /Betänketid/);
});

test('canAcceptOffer allows accept after cooling off', () => {
  const sentAt = '2026-05-01T10:00:00.000Z';
  const gate = canAcceptOffer(
    {
      quoteStatus: 'sent',
      coolingOffEndsAt: addDaysIso(sentAt, HAIR_TP_COOLING_OFF_DAYS),
    },
    { nowMs: Date.parse('2026-05-03T10:00:00.000Z') }
  );
  assert.equal(gate.allowed, true);
});

test('getCoolingOffMeta reports remaining days', () => {
  const sentAt = new Date().toISOString();
  const meta = getCoolingOffMeta(
    { coolingOffEndsAt: addDaysIso(sentAt, HAIR_TP_COOLING_OFF_DAYS) },
    Date.now() + 24 * 60 * 60 * 1000
  );
  assert.equal(meta.active, true);
  assert.ok(meta.remainingDays >= 1);
});
