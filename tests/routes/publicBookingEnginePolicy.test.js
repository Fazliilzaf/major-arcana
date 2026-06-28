'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');
const { bookingMondayWindow } = require('../helpers/bookingTestDates');

test('setBookingPolicySettings affects availability and reservation enforcement', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-booking-policy-runtime-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });
    const { fromDate, toDate } = bookingMondayWindow();
    const baseline = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(baseline.length >= 1);

    store.setBookingPolicySettings({
      globalDefaults: {
        minNoticeOnlineMinutes: 999999,
        minNoticePhysicalMinutes: 999999,
        maxBookingDaysAhead: 1,
        cancellationPolicyHours: 24,
      },
      serviceOverrides: {
        'consultation-physical': { minNoticeMinutes: 999999 },
      },
    });

    const filtered = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.equal(filtered.length, 0);

    const tooSoonSlot = {
      ...baseline[0],
      startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    store.setBookingPolicySettings({
      globalDefaults: {
        minNoticeOnlineMinutes: 120,
        minNoticePhysicalMinutes: 240,
        maxBookingDaysAhead: 180,
        cancellationPolicyHours: 24,
      },
      serviceOverrides: {
        'consultation-physical': { minNoticeMinutes: 240 },
      },
    });

    await assert.rejects(
      () =>
        store.reserveSlots({
          tenantId: 'hair-tp-clinic',
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-policy-1',
          customerEmail: 'policy@example.com',
          customerName: 'Policy Test',
          selectedSlots: [tooSoonSlot],
        }),
      (error) => {
        assert.equal(error.statusCode, 409);
        return true;
      }
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('setBookingPolicySettings tightens cancellation policy at runtime', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-booking-policy-cancel-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });
    const { fromDate, toDate } = bookingMondayWindow({ minDaysAhead: 2 });
    const availability = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(availability.length >= 1);
    const slot = {
      ...availability[0],
      startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
    };

    await store.reserveSlots({
      tenantId: 'hair-tp-clinic',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-policy-cancel',
      customerEmail: 'cancel@example.com',
      customerName: 'Cancel Test',
      selectedSlots: [slot],
    });
    await store.confirmBooking({
      tenantId: 'hair-tp-clinic',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-policy-cancel',
      customerEmail: 'cancel@example.com',
      customerName: 'Cancel Test',
      slot,
    });

    store.setBookingPolicySettings({
      globalDefaults: {
        minNoticeOnlineMinutes: 120,
        minNoticePhysicalMinutes: 60,
        maxBookingDaysAhead: 180,
        cancellationPolicyHours: 168,
      },
      serviceOverrides: {
        'consultation-physical': { cancellationPolicyHours: 168 },
      },
    });

    await assert.rejects(
      () =>
        store.cancelBooking({
          tenantId: 'hair-tp-clinic',
          conversationId: 'conv-policy-cancel',
          customerEmail: 'cancel@example.com',
        }),
      (error) => {
        assert.equal(error.statusCode, 409);
        return true;
      }
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
