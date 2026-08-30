'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { getCoolingOffMeta } = require('../../src/ops/ccoOfferEsign');

// ORD-151 — betänketiden räknas från quoteOpenedAt (öppningen), inte quoteSentAt (utskicket).

test('ORD-151: skickad men aldrig öppnad → betänketiden har inte börjat (blockerad)', () => {
  const meta = getCoolingOffMeta({
    quoteSentAt: '2026-08-28T10:00:00.000Z',
    // ingen quoteOpenedAt, ingen coolingOffEndsAt
  });
  assert.equal(meta.blocked, 'not_opened');
  assert.equal(meta.active, true);
  assert.equal(meta.endsAt, '');
  assert.equal(meta.startsAt, '');
});

test('ORD-151: öppnad → betänketiden räknas från öppningen, inte utskicket', () => {
  const openedAt = '2026-08-31T09:00:00.000Z';
  const meta = getCoolingOffMeta(
    {
      quoteSentAt: '2026-08-28T10:00:00.000Z',
      quoteOpenedAt: openedAt,
      // coolingOffEndsAt = öppning + 2 dagar (sätts av recordQuoteOpen)
      coolingOffEndsAt: '2026-09-02T09:00:00.000Z',
    },
    Date.parse('2026-08-31T09:00:00.000Z')
  );
  assert.equal(meta.startsAt, openedAt);
  assert.notEqual(meta.startsAt, '2026-08-28T10:00:00.000Z');
  assert.equal(meta.active, true);
  assert.ok(meta.remainingDays >= 1);
});

test('ORD-151: öppnad + betänketid slut → redo att acceptera', () => {
  const meta = getCoolingOffMeta(
    {
      quoteSentAt: '2026-08-28T10:00:00.000Z',
      quoteOpenedAt: '2026-08-31T09:00:00.000Z',
      coolingOffEndsAt: '2026-09-02T09:00:00.000Z',
    },
    Date.parse('2026-09-03T09:00:00.000Z')
  );
  assert.equal(meta.active, false);
  assert.equal(meta.startsAt, '2026-08-31T09:00:00.000Z');
});
