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
    assert.equal(stats.accepted, 1);
    assert.equal(bookings[0].customerEmail, 'patient@example.com');
    assert.equal(bookings[0].status, 'completed');
    assert.equal(bookings[0].clientoCustomerId, '12345');
  });
});
