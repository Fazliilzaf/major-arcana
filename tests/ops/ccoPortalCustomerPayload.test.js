'use strict';

/* Kundvänd nivå-2-payload ur ett commercialCase. Read-only. Signeringsstatus
 * härleds ur quoteStatus + betänketid: preparing → cooling_off → ready_to_sign
 * → signed. offerPlan speglas rått (portalen escape:ar vid rendering). */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLevelTwoPayload,
  deriveSigningStatus,
} = require('../../src/ops/ccoPortalCustomerPayload');

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

test('inget case → hasOffer=false, preparing', () => {
  const p = buildLevelTwoPayload({ patientId: 'p-1', commercialCase: null, nowMs: NOW });
  assert.equal(p.patientId, 'p-1');
  assert.equal(p.hasOffer, false);
  assert.equal(p.offerPlan, null);
  assert.equal(p.quoteStatus, 'missing');
  assert.equal(p.signing.status, 'preparing');
});

test('draft-offert → preparing, kan inte accepteras', () => {
  const p = buildLevelTwoPayload({
    patientId: 'p-1',
    commercialCase: { quoteStatus: 'draft', offerPlan: { method: 'DHI' } },
    nowMs: NOW,
  });
  assert.equal(p.hasOffer, true);
  assert.equal(p.offerPlan.method, 'DHI');
  assert.equal(p.signing.status, 'preparing');
  assert.equal(p.signing.canAccept, false);
});

test('skickad offert i betänketid → cooling_off, kan inte accepteras än', () => {
  const p = buildLevelTwoPayload({
    patientId: 'p-1',
    commercialCase: {
      quoteStatus: 'sent',
      coolingOffEndsAt: new Date(NOW + 3 * DAY).toISOString(),
      offerPlan: { method: 'DHI' },
    },
    nowMs: NOW,
  });
  assert.equal(p.signing.status, 'cooling_off');
  assert.equal(p.signing.canAccept, false);
  assert.equal(p.signing.coolingOff.active, true);
  assert.equal(p.signing.coolingOff.remainingDays, 3);
});

test('skickad offert efter betänketid → ready_to_sign, kan accepteras', () => {
  const p = buildLevelTwoPayload({
    patientId: 'p-1',
    commercialCase: {
      quoteStatus: 'sent',
      coolingOffEndsAt: new Date(NOW - DAY).toISOString(),
      offerPlan: { method: 'DHI' },
    },
    nowMs: NOW,
  });
  assert.equal(p.signing.status, 'ready_to_sign');
  assert.equal(p.signing.canAccept, true);
  assert.equal(p.signing.coolingOff.active, false);
});

test('accepterad offert → signed', () => {
  const p = buildLevelTwoPayload({
    patientId: 'p-1',
    commercialCase: { quoteStatus: 'accepted', offerPlan: { method: 'DHI' } },
    nowMs: NOW,
  });
  assert.equal(p.signing.status, 'signed');
  assert.equal(p.signing.canAccept, false);
});

test('displayName faller tillbaka på customerName', () => {
  const p = buildLevelTwoPayload({
    patientId: 'p-1',
    commercialCase: { quoteStatus: 'draft', customerName: 'Anna K' },
    nowMs: NOW,
  });
  assert.equal(p.displayName, 'Anna K');
});

test('deriveSigningStatus är ren och exporterad', () => {
  const s = deriveSigningStatus({ quoteStatus: 'accepted' }, NOW);
  assert.equal(s.status, 'signed');
});
