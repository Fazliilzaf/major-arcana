'use strict';

/* Kundvänd nivå-2-payload ur ett commercialCase. Read-only. Signeringsstatus
 * härleds ur quoteStatus + betänketid: preparing → cooling_off → ready_to_sign
 * → signed. offerPlan speglas rått (portalen escape:ar vid rendering). */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLevelTwoPayload,
  deriveSigningStatus,
  buildJournalReference,
  buildBookingsView,
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

test('journal-referens: antal, signerade, senaste, distinkta typer — inget innehåll', () => {
  const ref = buildJournalReference([
    {
      journalType: 'behandling',
      status: 'signed',
      signedAt: '2026-01-10T00:00:00Z',
      fields: { hemligt: 'x' },
    },
    { journalType: 'behandling', status: 'draft', updatedAt: '2026-02-01T00:00:00Z' },
    { journalType: 'uppfoljning', locked: true, createdAt: '2026-01-05T00:00:00Z' },
  ]);
  assert.equal(ref.count, 3);
  assert.equal(ref.signedCount, 2); // en signed + en locked
  assert.equal(ref.latestAt, '2026-02-01T00:00:00Z');
  assert.deepEqual(ref.types.sort(), ['behandling', 'uppfoljning']);
  assert.equal('fields' in ref, false); // inget kliniskt innehåll läcker
  assert.equal('personnummer' in ref, false);
});

test('journal-referens tom → nollor', () => {
  const ref = buildJournalReference([]);
  assert.equal(ref.count, 0);
  assert.equal(ref.signedCount, 0);
  assert.equal(ref.latestAt, null);
});

test('bokningsvy: bara kommande, sorterade, säkra fält', () => {
  const view = buildBookingsView(
    [
      {
        bookingId: 'b-past',
        startsAt: new Date(NOW - DAY).toISOString(),
        serviceLabel: 'DHI',
        notes: 'internt',
      },
      {
        bookingId: 'b-2',
        startsAt: new Date(NOW + 2 * DAY).toISOString(),
        serviceLabel: 'Kontroll',
      },
      {
        bookingId: 'b-1',
        startsAt: new Date(NOW + DAY).toISOString(),
        serviceLabel: 'Konsultation',
        state: 'confirmed',
      },
    ],
    NOW
  );
  assert.equal(view.upcomingCount, 2);
  assert.equal(view.pastCount, 1);
  assert.equal(view.upcoming[0].bookingId, 'b-1'); // närmast först
  assert.equal(view.upcoming[1].bookingId, 'b-2');
  assert.equal('notes' in view.upcoming[0], false); // inga interna anteckningar
});

test('buildLevelTwoPayload inkluderar journal + bookings', () => {
  const p = buildLevelTwoPayload({
    patientId: 'p-1',
    commercialCase: { quoteStatus: 'draft' },
    journalEntries: [{ journalType: 'behandling', status: 'signed' }],
    bookingCases: [{ bookingId: 'b-1', startsAt: new Date(NOW + DAY).toISOString() }],
    nowMs: NOW,
  });
  assert.equal(p.journal.count, 1);
  assert.equal(p.journal.signedCount, 1);
  assert.equal(p.bookings.upcomingCount, 1);
});
