'use strict';

/**
 * Dedupen ska behålla den senast skrivna kopian, inte den först påträffade.
 *
 * Bakgrund 2026-08-24. Samma bokning ligger i storen två gånger: en gång under
 * `hair_tp` och en gång under `hair-tp-clinic` (tenant-splitten i ORD-101 —
 * 25 505 + 27 811 rader). Kalendern läser båda namnrymderna, och dedupen tog
 * den FÖRSTA posten. Iterationsordningen över hinkarna är insättningsordning,
 * alltså den äldsta kopian.
 *
 * Följden var tyst: omimporten skrev `isReservation` och `serviceId` till
 * `hair-tp-clinic`, men kalendern läste ändå den gamla `hair_tp`-kopian utan
 * fälten. 9 219 reservationer visades som bokningar, och att köra om importen
 * ändrade ingenting — vi körde den två gånger med identiskt resultat innan vi
 * förstod varför.
 *
 * Det här är läs-sidans skydd. Datan städas separat; det här ser till att en
 * framtida dubblett inte tyst ger fel svar igen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { collectCalendarEntries } = require('../../src/ops/clinicCalendarView');

const BAS = {
  bookingId: 'r1',
  serviceLabel: '',
  staffName: 'Egzona',
  startsAt: '2025-06-19T10:00:00.000Z',
  endsAt: '2025-06-19T10:30:00.000Z',
  customerName: '',
  customerEmail: '',
  status: 'completed',
  source: 'cliento_csv',
};

const GAMMAL = { ...BAS, tenantId: 'hair_tp', updatedAt: '2026-08-01T10:00:00.000Z' };
const NY = {
  ...BAS,
  tenantId: 'hair-tp-clinic',
  isReservation: true,
  serviceId: '60041',
  updatedAt: '2026-08-24T10:00:00.000Z',
};

function vy(rows) {
  return collectCalendarEntries({
    clientoBookingStore: { listAllBookings: () => rows },
    tenantId: 'hair-tp-clinic',
    brand: 'hair-tp-clinic',
  });
}

test('nyaste kopian vinner när den gamla kommer först', () => {
  const d = vy([GAMMAL, NY]);
  assert.equal(d.entries.length, 1, 'dubbletten ska fortfarande slås ihop till en post');
  assert.equal(d.entries[0].type, 'reservation', 'den gamla kopian saknar isReservation');
  assert.equal(d.entries[0].serviceId, '60041');
});

test('nyaste kopian vinner även när den kommer först', () => {
  const d = vy([NY, GAMMAL]);
  assert.equal(d.entries.length, 1);
  assert.equal(d.entries[0].type, 'reservation');
});

test('utan updatedAt behålls den första — oförändrat beteende', () => {
  const d = vy([
    { ...GAMMAL, updatedAt: '' },
    { ...NY, updatedAt: '' },
  ]);
  assert.equal(d.entries.length, 1);
  assert.equal(d.entries[0].type, 'booking', 'ingen tidsstämpel = ingen omsortering');
});

test('localDate följer med den vinnande posten', () => {
  const d = vy([GAMMAL, NY]);
  assert.equal(
    d.entries[0].localDate,
    '2025-06-19',
    'ersätts en post måste localDate räknas om, annars faller den ur dagsvyn'
  );
});

test('olika bokningar slås inte ihop', () => {
  const d = vy([
    NY,
    {
      ...NY,
      bookingId: 'r2',
      startsAt: '2025-06-19T12:00:00.000Z',
      updatedAt: '2026-08-24T10:00:00.000Z',
    },
  ]);
  assert.equal(d.entries.length, 2, 'dedupen får inte bli girig');
});

test('tre kopior av samma bokning ger den nyaste', () => {
  const mellan = { ...BAS, tenantId: 'hair_tp', updatedAt: '2026-08-10T10:00:00.000Z' };
  const d = vy([GAMMAL, mellan, NY]);
  assert.equal(d.entries.length, 1);
  assert.equal(d.entries[0].updatedAt, '2026-08-24T10:00:00.000Z');
});
