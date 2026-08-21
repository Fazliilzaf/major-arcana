'use strict';

/**
 * Resursmapping fran Cliento-bokningar till booking engine-resurser.
 *
 * Bakgrund: Cliento-bokningar bar ofta bara fornamnet (t.ex. "Egzona") medan
 * motorn lagrar hela namnet ("Egzona Krasniqi"). Utan uppslag pa fornamn fick
 * samma person tva resourceId — "egzona" for motorbokningar och
 * "cliento-egzona" for Cliento-bokningar. Resursfiltret i kalendern byggs pa
 * resourceId, sa det ena filtret dolde det andra.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDayView } = require('../../src/ops/clinicCalendarView');

const DATUM = '2026-09-15';

function engineStoreMed(resources = [], bookings = []) {
  return {
    _state: {
      resources,
      bookings,
      reservations: [],
    },
    listBookingsForEnrichment: () => bookings,
  };
}

function clientoStoreMed(bookings) {
  return {
    listAllBookings: () => bookings,
  };
}

function motorbokning(overrides = {}) {
  return {
    bookingId: 'be-1',
    tenantId: 'hair-tp-clinic',
    startsAt: `${DATUM}T08:00:00.000Z`,
    endsAt: `${DATUM}T08:45:00.000Z`,
    slot: {
      resourceId: 'egzona',
      resourceLabel: 'Egzona Krasniqi',
      serviceId: 'consultation-physical',
      serviceLabel: 'Konsultation',
    },
    customerName: 'Anna Andersson',
    customerEmail: 'anna@exempel.se',
    status: 'confirmed',
    ...overrides,
  };
}

function clientobokning(overrides = {}) {
  return {
    id: 'cl-1',
    startsAt: `${DATUM}T09:00:00.000Z`,
    endsAt: `${DATUM}T10:00:00.000Z`,
    customerName: 'Bertil Bengtsson',
    customerEmail: 'bertil@exempel.se',
    staffName: 'Egzona',
    serviceLabel: 'Konsultation',
    status: 'completed',
    source: 'cliento_csv',
    ...overrides,
  };
}

function resurser(resources) {
  return resources.map((r) => ({
    resourceId: r.resourceId,
    resourceLabel: r.resourceLabel,
    slots: r.slots.length,
  }));
}

test('Cliento-bokning med bara fornamn mappas till samma resourceId som motorn', () => {
  const vy = buildDayView({
    date: DATUM,
    bookingEngineStore: engineStoreMed(
      [{ id: 'egzona', label: 'Egzona Krasniqi', active: true }],
      [motorbokning()]
    ),
    clientoBookingStore: clientoStoreMed([clientobokning()]),
    tenantId: 'hair-tp-clinic',
  });

  assert.equal(vy.resources.length, 1, 'bade motor- och Cliento-bokning ska ligga under samma resurs');
  assert.equal(vy.resources[0].resourceId, 'egzona');
  assert.equal(vy.resources[0].slots.length, 2);
});

test('tvetydigt fornamn faller tillbaka pa cliento-prefix for att inte gissa fel', () => {
  const vy = buildDayView({
    date: DATUM,
    bookingEngineStore: engineStoreMed(
      [
        { id: 'egzona-a', label: 'Egzona A', active: true },
        { id: 'egzona-b', label: 'Egzona B', active: true },
      ],
      []
    ),
    clientoBookingStore: clientoStoreMed([clientobokning({ staffName: 'Egzona' })]),
    tenantId: 'hair-tp-clinic',
  });

  const resurserUtanSlots = resurser(vy.resources);
  assert.ok(
    resurserUtanSlots.some((r) => r.resourceId === 'cliento-egzona'),
    'tvetydigt fornamn ska inte slumpas till en av resurserna'
  );
});

test('exakt match pa hela namnet gar fore token-match', () => {
  const vy = buildDayView({
    date: DATUM,
    bookingEngineStore: engineStoreMed(
      [
        { id: 'egzona', label: 'Egzona Krasniqi', active: true },
        { id: 'egzonas', label: 'Egzonas Sallskap', active: true },
      ],
      []
    ),
    clientoBookingStore: clientoStoreMed([clientobokning({ staffName: 'Egzona Krasniqi' })]),
    tenantId: 'hair-tp-clinic',
  });

  const resursMedSlots = vy.resources.filter((r) => r.slots.length > 0);
  assert.equal(resursMedSlots.length, 1, 'bara en resurs ska ha bokningen');
  assert.equal(resursMedSlots[0].resourceId, 'egzona');
});

test('okand resurs far fortfarande cliento-prefix', () => {
  const vy = buildDayView({
    date: DATUM,
    bookingEngineStore: engineStoreMed(
      [{ id: 'fazli', label: 'Fazli Krasniqi', active: true }],
      []
    ),
    clientoBookingStore: clientoStoreMed([clientobokning({ staffName: 'Okand Behandlare' })]),
    tenantId: 'hair-tp-clinic',
  });

  const ids = vy.resources.map((r) => r.resourceId);
  assert.ok(ids.includes('cliento-okand-behandlare'), 'okand resurs ska fa inferred cliento-id');
});
