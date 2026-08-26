'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  klassificera,
  slaIhop,
  outcomeOf,
  statusOf,
} = require('../../scripts/resolve-cliento-outcome-status.js');

function booking(fields) {
  return {
    bookingId: fields.id,
    clientoCustomerId: fields.cid ?? '1001',
    status: fields.status ?? 'completed',
    rawStatus: fields.rawStatus ?? '',
    startsAt: fields.startsAt ?? '2026-06-01T10:00:00.000Z',
    endsAt: fields.startsAt ?? '2026-06-01T10:30:00.000Z',
    staffName: fields.staffName ?? 'Louise',
    bookingNotes: fields.bookingNotes ?? '',
    customerName: fields.name ?? 'Test',
    customerEmail: fields.email ?? 't@example.com',
  };
}

test('statusOf prioriterar rawStatus', () => {
  assert.equal(statusOf({ rawStatus: 'Show', status: 'completed' }), 'Show');
  assert.equal(statusOf({ rawStatus: '', status: 'completed' }), 'completed');
  assert.equal(statusOf({}), '');
});

test('outcomeOf klassar utfall, booked och tvetydigt', () => {
  assert.equal(outcomeOf('Show'), 'outcome');
  assert.equal(outcomeOf('Done'), 'outcome');
  assert.equal(outcomeOf('completed'), 'outcome');
  assert.equal(outcomeOf('Booked'), 'booked');
  assert.equal(outcomeOf('upcoming'), 'booked');
  assert.equal(outcomeOf('NoShow'), 'ambiguous');
  assert.equal(outcomeOf('Cancelled'), 'ambiguous');
});

test('klassificera: rent statusfall är mergebart', () => {
  const canon = booking({ id: 'B1', rawStatus: 'Booked', staffName: 'Louise' });
  const leg = booking({ id: 'B1', rawStatus: 'Show', staffName: 'Louise' });
  const r = klassificera(canon, leg);
  assert.equal(r.mergebar, true);
  assert.equal(r.krockar.length, 0);
  assert.equal(statusOf(r.outcome), 'Show');
  assert.equal(statusOf(r.booked), 'Booked');
});

test('klassificera: statusfall med annan fältkrock är INTE mergebart', () => {
  const canon = booking({ id: 'B2', rawStatus: 'Booked', staffName: 'Clara' });
  const leg = booking({ id: 'B2', rawStatus: 'Show', staffName: 'Louise' });
  const r = klassificera(canon, leg);
  assert.equal(r.mergebar, false);
  assert.ok(r.krockar.includes('staffName'));
});

test('klassificera: tvetydigt (no-show/cancelled) är INTE mergebart', () => {
  const canon = booking({ id: 'B3', rawStatus: 'Booked' });
  const leg = booking({ id: 'B3', rawStatus: 'NoShow' });
  assert.equal(klassificera(canon, leg).mergebar, false);
});

test('slaIhop: utfallet vinner för status, blanka fält fylls', () => {
  const outcome = booking({ id: 'B4', rawStatus: 'Show', status: 'completed', bookingNotes: '' });
  const booked = booking({
    id: 'B4',
    rawStatus: 'Booked',
    status: 'completed',
    bookingNotes: 'notis',
  });
  const merged = slaIhop(outcome, booked);
  assert.equal(merged.rawStatus, 'Show'); // utfallet vinner
  assert.equal(merged.status, 'completed');
  assert.equal(merged.bookingNotes, 'notis'); // blankt fält fylls från andra sidan
  assert.equal(merged.staffName, 'Louise');
});
