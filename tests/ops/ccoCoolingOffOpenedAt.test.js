'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { getCoolingOffMeta } = require('../../src/ops/ccoOfferEsign');

// ORD-153 — betänketiden startar vid FÖRSTA VERIFIERADE inloggningen (BankID),
// inte vid en oidentifierad öppning och inte vid utskicket.

test('ORD-153: skickad men aldrig verifierad → betänketiden har inte börjat (blockerad)', () => {
  const meta = getCoolingOffMeta({
    quoteSentAt: '2026-08-28T10:00:00.000Z',
    // ingen coolingOffEndsAt → ingen verifierad inloggning
  });
  assert.equal(meta.blocked, 'not_verified');
  assert.equal(meta.active, true);
  assert.equal(meta.endsAt, '');
  assert.equal(meta.startsAt, '');
});

test('ORD-153: en oidentifierad öppning startar INTE fristen (ingen coolingOffEndsAt)', () => {
  const meta = getCoolingOffMeta({
    quoteSentAt: '2026-08-28T10:00:00.000Z',
    quoteOpenedAt: '2026-08-29T10:00:00.000Z', // oidentifierad öppning
    // men ingen coolingOffEndsAt
  });
  assert.equal(meta.blocked, 'not_verified');
});

test('ORD-153: verifierad → fristen räknas från verifieringen (endsAt − 2 dagar)', () => {
  const meta = getCoolingOffMeta(
    {
      quoteSentAt: '2026-08-28T10:00:00.000Z',
      coolingOffEndsAt: '2026-09-02T09:00:00.000Z',
    },
    Date.parse('2026-08-31T09:00:00.000Z')
  );
  assert.equal(meta.startsAt, '2026-08-31T09:00:00.000Z');
  assert.notEqual(meta.startsAt, '2026-08-28T10:00:00.000Z');
  assert.equal(meta.active, true);
  assert.ok(meta.remainingDays >= 1);
});

test('ORD-153: verifierad + frist slut → redo att acceptera', () => {
  const meta = getCoolingOffMeta(
    {
      quoteSentAt: '2026-08-28T10:00:00.000Z',
      coolingOffEndsAt: '2026-09-02T09:00:00.000Z',
    },
    Date.parse('2026-09-03T09:00:00.000Z')
  );
  assert.equal(meta.active, false);
  assert.equal(meta.startsAt, '2026-08-31T09:00:00.000Z');
});
