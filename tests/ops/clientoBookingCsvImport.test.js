'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapClientoCsvStatus,
  rowsToClientoBookings,
  buildClientoIdEmailLookup,
} = require('../../src/ops/clientoBookingCsvImport');

describe('clientoBookingCsvImport', () => {
  it('maps Cliento CSV statuses', () => {
    assert.equal(mapClientoCsvStatus('Avbokad', '2026-01-01T10:00:00.000Z'), 'cancelled');
    assert.equal(mapClientoCsvStatus('No show', '2026-01-01T10:00:00.000Z'), 'no_show');
    assert.equal(mapClientoCsvStatus('Show', '2026-01-01T10:00:00.000Z'), 'completed');
    assert.equal(mapClientoCsvStatus('Cancelled', '2026-01-01T10:00:00.000Z'), 'cancelled');
    assert.equal(mapClientoCsvStatus('NoShow', '2026-01-01T10:00:00.000Z'), 'no_show');
    assert.equal(mapClientoCsvStatus('Done', '2026-01-01T10:00:00.000Z'), 'completed');
    assert.equal(mapClientoCsvStatus('Booked', '2020-01-01T10:00:00.000Z'), 'completed');
  });

  it('maps the real Cliento Dataexport headers and reuses identity across history rows', () => {
    const { bookings, stats } = rowsToClientoBookings(
      [
        {
          'Kund-id': 'client-1',
          'Kund e-post': 'patient@example.com',
          'Kund (mobilnummer)': '070 123 45 67',
          Starttid: '2024-05-13 14:30',
          Sluttid: '2024-05-13 15:15',
          Status: 'Show',
          'Boknings-id': 'real-1',
          Bokningsreferens: 'ref-1',
          'Tjänstens namn': 'Fysisk konsultation',
          Bokningsanteckning: 'Intern anteckning',
          'Meddelande från kund': 'Kundens meddelande',
          'Bokningens längd': '45',
        },
        {
          'Kund-id': 'client-1',
          'Kund (mobilnummer)': '070 123 45 67',
          Starttid: '2024-06-01 10:00',
          Status: 'NoShow',
          'Boknings-id': 'real-2',
          'Tjänstens namn': 'PRP',
        },
      ],
      new Map()
    );

    assert.equal(stats.accepted, 2);
    assert.equal(bookings[1].customerEmail, 'patient@example.com');
    assert.equal(bookings[1].status, 'no_show');
    assert.equal(bookings[0].customerPhone, '070 123 45 67');
    assert.equal(bookings[0].durationMinutes, 45);
    assert.equal(bookings[0].sourceMessageId, 'ref-1');
    assert.equal(bookings[0].bookingNotes, 'Intern anteckning');
    assert.equal(bookings[0].customerMessage, 'Kundens meddelande');
    assert.equal(bookings[0].internalNotes, '');
    assert.equal(bookings[0].notes, 'Intern anteckning\n\nKundens meddelande');
  });

  it('retains real export rows that only have phone and Cliento identity', () => {
    const { bookings, stats } = rowsToClientoBookings(
      [
        {
          'Kund-id': 'client-phone-only',
          'Kund (mobilnummer)': '070 999 88 77',
          Starttid: '2024-07-01 09:00',
          Status: 'Done',
          'Boknings-id': 'phone-only-1',
          'Tjänstens namn': 'PRP',
        },
      ],
      new Map()
    );
    assert.equal(stats.accepted, 1);
    assert.equal(stats.skippedNoEmail, 0);
    assert.equal(bookings[0].customerEmail, '');
    assert.equal(bookings[0].customerPhone, '070 999 88 77');
  });

  it('builds bookings with cliento id email lookup', () => {
    const lookup = buildClientoIdEmailLookup([
      {
        primaryEmail: 'patient@example.com',
        cliento: { sourceId: '12345' },
      },
    ]);
    const { bookings, stats } = rowsToClientoBookings(
      [
        {
          'Kund-id': '12345',
          Starttid: '2024-05-13 14:30',
          Status: 'Show',
          'Boknings-id': 'b-1',
          'Tjänstens namn': 'Konsultation',
          Resursnamn: 'Egzona',
        },
        {
          'Kund-id': '99999',
          Starttid: '2024-05-13 14:30',
          Status: 'No show',
          'Boknings-id': 'b-2',
        },
      ],
      lookup
    );
    assert.equal(stats.accepted, 2);
    assert.equal(bookings[0].customerEmail, 'patient@example.com');
    assert.equal(bookings[0].status, 'completed');
    assert.equal(bookings[0].clientoCustomerId, '12345');
    assert.equal(bookings[1].customerEmail, '');
    assert.equal(bookings[1].clientoCustomerId, '99999');
  });

  it('keeps cancelled/no-show rows and preserves notes and phone for journey truth', () => {
    const lookup = new Map([
      ['12345', 'patient@example.com'],
      ['54321', 'other@example.com'],
    ]);
    const { bookings, stats } = rowsToClientoBookings(
      [
        {
          'Kund-id': '12345',
          Starttid: '2026-05-21 17:15',
          Status: 'Avbokad',
          'Boknings-id': 'cancelled-1',
          'Tjänstens namn': 'Online konsultation',
          Telefon: '0790246587',
          Anteckningar: 'Avbokade via telefon',
        },
        {
          'Kund-id': '54321',
          Starttid: '2026-05-22 12:00',
          Status: 'No show',
          'Boknings-id': 'noshow-1',
          'Tjänstens namn': 'PRP',
          Kommentar: 'Dök inte upp',
          Beskrivning: 'Behandlingsnotering',
        },
      ],
      lookup
    );
    assert.equal(stats.accepted, 2);
    assert.equal(stats.skippedCancelled, 0);
    assert.deepEqual(
      bookings.map((row) => row.status),
      ['cancelled', 'no_show']
    );
    assert.equal(bookings[0].customerPhone, '0790246587');
    assert.equal(bookings[0].notes, 'Avbokade via telefon');
    assert.equal(bookings[1].notes, 'Dök inte upp\n\nBehandlingsnotering');
    assert.equal(bookings[1].internalNotes, 'Dök inte upp');
    assert.equal(bookings[1].treatmentNotes, 'Behandlingsnotering');
  });
});
