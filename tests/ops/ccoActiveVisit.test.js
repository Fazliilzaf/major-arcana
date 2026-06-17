'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildActiveVisitPayload,
  resolveActiveVisitState,
} = require('../../src/ops/ccoActiveVisit');

test('active visit defaults to scheduled_today for visible today booking without encounter progress', () => {
  const payload = buildActiveVisitPayload({
    card: { todayVisit: true, missingHealthDeclaration: true },
    bookingContext: {
      upcomingBookings: [
        {
          id: 'booking-1',
          startsAt: new Date().toISOString(),
          serviceName: 'Konsultation',
          resourceLabel: 'Erik Holm',
        },
      ],
      historyBookings: [],
    },
    journalEntries: [],
    encounter: null,
  });

  assert.equal(payload.visible, true);
  assert.equal(payload.state, 'scheduled_today');
  assert.equal(payload.bookingId, 'booking-1');
  assert.equal(payload.blockers[0].code, 'health_declaration');
});

test('active visit resolves checked_in from encounter metadata', () => {
  const payload = buildActiveVisitPayload({
    card: { todayVisit: true, encounterId: 'enc-1' },
    bookingContext: { upcomingBookings: [], historyBookings: [] },
    journalEntries: [],
    encounter: {
      encounterId: 'enc-1',
      status: 'checked_in',
      startsAt: new Date().toISOString(),
      metadata: { checkedInAt: new Date().toISOString() },
    },
  });

  assert.equal(payload.state, 'checked_in');
  assert.ok(payload.checkedInAt);
});

test('active visit resolves completed_today from signed journal metadata', () => {
  const now = new Date().toISOString();
  const state = resolveActiveVisitState({
    encounter: {
      status: 'confirmed',
      metadata: {},
    },
    journalSignals: {
      journalStarted: true,
      journalCompleted: true,
      startedAt: now,
      completedAt: now,
    },
  });

  assert.equal(state, 'completed_today');
});
