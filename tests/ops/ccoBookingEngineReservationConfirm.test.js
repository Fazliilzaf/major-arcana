'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { bookingMondayWindow } = require('../helpers/bookingTestDates');

async function makeStore() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ord146-'));
  const store = await createCcoBookingEngineStore({
    filePath: path.join(tempDir, 'booking-engine.json'),
  });
  return { tempDir, store };
}

test('ORD-146: accept → reservation (active, 14 dagar), signering → confirmed', async () => {
  const { tempDir, store } = await makeStore();
  try {
    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(availability.length >= 1);
    const slot = availability[0];

    // Accept → reservation, ALDRIG confirmed.
    const reservations = await store.reserveSlots({
      tenantId: 'tenant-a',
      conversationId: 'conv-ord146',
      customerEmail: 'anna@example.com',
      customerName: 'Anna',
      selectedSlots: [slot],
    });
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0].status, 'active');

    // 14-dagars livslängd (Fazli 2026-08-29).
    const expiryMs = Date.parse(reservations[0].expiresAt);
    const createdMs = Date.parse(reservations[0].createdAt);
    const days = Math.round((expiryMs - createdMs) / (24 * 60 * 60 * 1000));
    assert.equal(days, 14);

    // Signering → confirmed (enda vägen).
    const booking = await store.confirmReservationForCustomer({
      tenantId: 'tenant-a',
      customerEmail: 'anna@example.com',
    });
    assert.equal(booking.status, 'confirmed');
    assert.equal(booking.slot.slotId, slot.slotId);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ORD-146 mutationstest: enbart reservation ger aldrig confirmed', async () => {
  const { tempDir, store } = await makeStore();
  try {
    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    const slot = availability[0];

    await store.reserveSlots({
      tenantId: 'tenant-a',
      conversationId: 'conv-ord146b',
      customerEmail: 'anna@example.com',
      customerName: 'Anna',
      selectedSlots: [slot],
    });

    const summary = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-ord146b',
      customerEmail: 'anna@example.com',
    });
    // En accept/reservation får INTE bekräfta: ingen confirmed-booking, läget är reserved.
    assert.equal(summary.hasConfirmedBooking, false);
    assert.equal(summary.state, 'reserved');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ORD-146: utgången reservation stängs med orsak och anmäler signeringsuppmaning', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ord146-expiry-'));
  const filePath = path.join(tempDir, 'booking-engine.json');
  try {
    // Förseedad reservation med en tid som redan gått ut (osignerat avtal).
    await fs.writeFile(
      filePath,
      JSON.stringify({
        reservations: [
          {
            tenantId: 'tenant-a',
            workspaceId: 'major-arcana-preview',
            conversationId: 'conv-expiry',
            customerEmail: 'anna@example.com',
            customerName: 'Anna',
            status: 'active',
            expiresAt: '2020-01-01T00:00:00.000Z',
            slot: {
              startsAt: '2026-01-01T10:00:00.000Z',
              resourceId: 'egzona',
              serviceId: 'consultation-physical',
            },
          },
        ],
      }),
      'utf8'
    );

    const expiredNotifications = [];
    const store = await createCcoBookingEngineStore({
      filePath,
      onReservationsExpired: (expired) => {
        expiredNotifications.push(...expired);
      },
    });

    // getActiveReservations triggar expireStaleReservations.
    await store.getActiveReservations({ tenantId: 'tenant-a' });

    assert.equal(expiredNotifications.length, 1);
    assert.equal(expiredNotifications[0].status, 'expired');
    assert.ok(expiredNotifications[0].expiredReason.length > 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
