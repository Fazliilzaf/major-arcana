'use strict';

/**
 * Reservationer är blockerad tid, inte patientbokningar.
 * Cliento-exporten har Typ = SimpleBooking | Reservation. Reservationer bär noll
 * patientdata (0 av 9 219 har kundnamn/id/e-post/telefon/pris) och deras
 * orsakskod (Reservationstyp: Lunch/Absence/Vacation/SickLeave/OnLeave) är
 * personaldata — 37 rader är sjukfrånvaro för namngiven personal. Därför sparas
 * bara en boolean (isReservation), aldrig orsaken.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { rowsToClientoBookings } = require('../../src/ops/clientoBookingCsvImport');
const { normalizeBooking } = require('../../src/ops/clientoBookingStore');
const { buildDayView } = require('../../src/ops/clinicCalendarView');

const DATUM = '2026-09-15';

function csvRad(overrides = {}) {
  return {
    'Boknings-id': 'b1',
    Starttid: `${DATUM} 08:00`,
    Sluttid: `${DATUM} 08:45`,
    Status: 'Bokad',
    Typ: 'SimpleBooking',
    Resursnamn: 'Egzona',
    'Tjänstens namn': 'Konsultation',
    Kundnamn: 'Anna Andersson',
    'Kund e-post': 'anna@exempel.se',
    ...overrides,
  };
}

test('Reservation → isReservation=true, och orsakskoden lagras INTE', () => {
  const rader = [
    csvRad({ 'Boknings-id': 'r1', Typ: 'Reservation', Reservationstyp: 'Lunch' }),
    csvRad({ 'Boknings-id': 'r2', Typ: 'Reservation', Reservationstyp: 'SickLeave' }),
    csvRad({ 'Boknings-id': 'r3', Typ: 'Reservation', Reservationstyp: 'Vacation' }),
    csvRad({ 'Boknings-id': 'r4', Typ: 'Reservation', Reservationstyp: 'Absence' }),
  ];
  const result = rowsToClientoBookings(rader, new Map(), {});
  assert.equal(result.bookings.length, 4);
  for (const b of result.bookings) assert.equal(b.isReservation, true);
  // Hela poängen med beslutet: orsakskoden får inte finnas i den lagrade raden.
  const json = JSON.stringify(result.bookings);
  for (const forbidden of ['Lunch', 'SickLeave', 'Vacation', 'Absence']) {
    assert.equal(json.includes(forbidden), false, `orsakskod "${forbidden}" får inte lagras`);
  }
});

test('SimpleBooking → isReservation=false (ingen regression)', () => {
  const result = rowsToClientoBookings([csvRad({ Typ: 'SimpleBooking' })], new Map(), {});
  assert.equal(result.bookings.length, 1);
  assert.equal(result.bookings[0].isReservation, false);
});

test('historisk rad utan isReservation → false, alltså booking (ingen tyst omklassning)', () => {
  const norm = normalizeBooking({
    bookingId: 'old-1',
    customerEmail: 'x@y.se',
    serviceLabel: 'Konsultation',
    startsAt: `${DATUM}T08:00:00.000Z`,
    status: 'completed',
    source: 'cliento_csv',
  });
  assert.equal(norm.isReservation, false);
});

test('kalendern: reservation får type=reservation och räknas inte som bokning', () => {
  const clientoStore = {
    listAllBookings: () => [
      {
        bookingId: 'b1',
        startsAt: `${DATUM}T08:00:00.000Z`,
        endsAt: `${DATUM}T08:45:00.000Z`,
        serviceLabel: 'Konsultation',
        staffName: 'Egzona',
        status: 'confirmed',
        source: 'cliento_csv',
        customerName: 'Anna',
        customerEmail: 'anna@exempel.se',
        isReservation: false,
      },
      {
        bookingId: 'r1',
        startsAt: `${DATUM}T09:00:00.000Z`,
        endsAt: `${DATUM}T09:30:00.000Z`,
        staffName: 'Egzona',
        status: 'unknown',
        source: 'cliento_csv',
        isReservation: true,
      },
    ],
  };
  const engineStore = {
    _state: { resources: [], bookings: [], reservations: [] },
    listBookingsForEnrichment: () => [],
  };
  const view = buildDayView({
    date: DATUM,
    bookingEngineStore: engineStore,
    clientoBookingStore: clientoStore,
    tenantId: 'hair-tp-clinic',
  });
  assert.equal(view.confirmedBookings, 1, 'bara bokningen räknas som bokning');
  assert.equal(view.totalSlots, 2, 'reservationen är fortfarande en slot i kalendern');

  const slots = view.resources.flatMap((r) => r.slots);
  const bookingSlot = slots.find((s) => s.id === 'b1');
  const reservationSlot = slots.find((s) => s.id === 'r1');
  assert.equal(bookingSlot.type, 'booking');
  assert.equal(reservationSlot.type, 'reservation');
});
