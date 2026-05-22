const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');

test('ccoBookingEngineStore listar egna lediga tider, reserverar, bekräftar och avbokar', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-engine-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });

    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: '2026-05-11',
      toDate: '2026-05-11',
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(availability.length >= 1);
    const chosenSlot = availability[0];

    const reservations = await store.reserveSlots({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-1',
      customerEmail: 'anna@example.com',
      customerName: 'Anna',
      selectedSlots: [chosenSlot],
    });
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0].slot.slotId, chosenSlot.slotId);

    const followupAvailability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: '2026-05-11',
      toDate: '2026-05-11',
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(followupAvailability.every((slot) => slot.slotId !== chosenSlot.slotId));

    const booking = await store.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-1',
      customerEmail: 'anna@example.com',
      customerName: 'Anna',
      slot: chosenSlot,
    });
    assert.equal(booking.status, 'confirmed');
    assert.equal(booking.slot.slotId, chosenSlot.slotId);

    const summary = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-engine-1',
      customerEmail: 'anna@example.com',
    });
    assert.equal(summary.booking.status, 'confirmed');
    assert.equal(summary.reservations.length, 0);
    assert.equal(summary.state, 'confirmed');
    assert.equal(summary.stateLabel, 'Bekräftad');
    assert.equal(summary.recommendedAction, 'none');
    assert.equal(summary.hasConfirmedBooking, true);
    assert.equal(summary.primarySlot.slotId, chosenSlot.slotId);
    assert.equal(summary.stateReason, 'Bokningen är bekräftad i CCO:s egen bokningsmotor.');

    const cancelled = await store.cancelBooking({
      tenantId: 'tenant-a',
      conversationId: 'conv-engine-1',
      customerEmail: 'anna@example.com',
      reason: 'Kunden behövde en annan dag',
    });
    assert.equal(cancelled.status, 'cancelled');

    const afterCancelSummary = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-engine-1',
      customerEmail: 'anna@example.com',
    });
    assert.equal(afterCancelSummary.booking, null);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore kräver ombokning när en annan tid redan är bekräftad', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-engine-rebook-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });

    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: '2026-05-11',
      toDate: '2026-05-12',
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(availability.length >= 2);
    const firstSlot = availability[0];
    const secondSlot = availability[1];

    await store.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-2',
      customerEmail: 'rebook@example.com',
      customerName: 'Rebook',
      slot: firstSlot,
    });

    await assert.rejects(
      () =>
        store.confirmBooking({
          tenantId: 'tenant-a',
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-engine-2',
          customerEmail: 'rebook@example.com',
          customerName: 'Rebook',
          slot: secondSlot,
        }),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.metadata.code, 'booking_rebook_required');
        return true;
      }
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore släpper utgångna reservationer ur availability och summary', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-engine-expiry-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });

    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: '2026-05-11',
      toDate: '2026-05-11',
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(availability.length >= 1);
    const chosenSlot = availability[0];

    await store.reserveSlots({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-expired',
      customerEmail: 'expired@example.com',
      customerName: 'Expired',
      selectedSlots: [chosenSlot],
    });

    store._state.reservations[0].expiresAt = '2000-01-01T00:00:00.000Z';

    const refreshedAvailability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: '2026-05-11',
      toDate: '2026-05-11',
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(refreshedAvailability.some((slot) => slot.slotId === chosenSlot.slotId));

    const summary = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-engine-expired',
      customerEmail: 'expired@example.com',
    });
    assert.equal(summary.reservations.length, 0);
    assert.equal(summary.state, 'idle');
    assert.equal(summary.recommendedAction, 'candidate_slots');
    assert.equal(store._state.reservations[0].status, 'expired');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore sammanfattar reservation expiry i workflow-summaryn', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-engine-expiry-meta-')
  );
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });

    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: '2026-05-11',
      toDate: '2026-05-11',
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    const chosenSlot = availability[0];
    await store.reserveSlots({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-expiry-meta',
      customerEmail: 'meta@example.com',
      customerName: 'Meta',
      selectedSlots: [chosenSlot],
    });

    store._state.reservations[0].expiresAt = '2099-01-01T00:30:00.000Z';
    const summary = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-engine-expiry-meta',
      customerEmail: 'meta@example.com',
    });
    assert.equal(summary.state, 'reserved');
    assert.equal(summary.recommendedAction, 'confirm_external');
    assert.equal(summary.nextExpiryAt, '2099-01-01T00:30:00.000Z');
    assert.equal(typeof summary.expiresSoon, 'boolean');
    assert.match(summary.stateReason, /Reservationen håller tiden till/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore kan förnya aktiva reservationer och byter rekommenderat steg', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-engine-renew-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });

    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: '2026-05-11',
      toDate: '2026-05-11',
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    const chosenSlot = availability[0];
    await store.reserveSlots({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-renew',
      customerEmail: 'renew@example.com',
      customerName: 'Renew',
      selectedSlots: [chosenSlot],
    });

    const expiringSoonIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    store._state.reservations[0].expiresAt = expiringSoonIso;
    const beforeSummary = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-engine-renew',
      customerEmail: 'renew@example.com',
    });
    assert.equal(beforeSummary.state, 'reserved');
    assert.equal(beforeSummary.recommendedAction, 'renew_reservation');

    const renewedReservations = await store.renewReservations({
      tenantId: 'tenant-a',
      conversationId: 'conv-engine-renew',
      customerEmail: 'renew@example.com',
      extensionMinutes: 180,
    });
    assert.equal(renewedReservations.length, 1);
    assert.notEqual(renewedReservations[0].expiresAt, expiringSoonIso);

    const afterSummary = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-engine-renew',
      customerEmail: 'renew@example.com',
    });
    assert.equal(afterSummary.state, 'reserved');
    assert.equal(afterSummary.recommendedAction, 'confirm_external');
    assert.equal(afterSummary.expiresSoon, false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore blockerar överlappande tider på samma resurs även med olika service-id', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-engine-overlap-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });

    store._state.services.push({
      id: 'consultation-short',
      label: 'Kort konsultation',
      durationMinutes: 30,
      active: true,
    });
    store._state.availabilityRules.push({
      ruleId: 'rule-consultation-short-egzona',
      resourceId: 'egzona',
      serviceId: 'consultation-short',
      weekdays: [1],
      startTimes: ['09:30'],
      locationLabel: 'Hair TP Clinic',
      active: true,
    });

    const consultationAvailability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: '2026-05-11',
      toDate: '2026-05-11',
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    const standardSlot = consultationAvailability[0];
    assert.ok(standardSlot);

    await store.reserveSlots({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-overlap-a',
      customerEmail: 'overlap-a@example.com',
      customerName: 'Overlap A',
      selectedSlots: [standardSlot],
    });

    const shortAvailability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: '2026-05-11',
      toDate: '2026-05-11',
      resIds: 'egzona',
      srvIds: 'consultation-short',
    });
    assert.equal(shortAvailability.length, 0);

    await assert.rejects(
      () =>
        store.reserveSlots({
          tenantId: 'tenant-a',
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-engine-overlap-b',
          customerEmail: 'overlap-b@example.com',
          customerName: 'Overlap B',
          selectedSlots: [
            {
              slotId: 'egzona::consultation-short::2026-05-11T09:30:00.000Z',
              startsAt: '2026-05-11T09:30:00.000Z',
              endsAt: '2026-05-11T10:00:00.000Z',
              resourceId: 'egzona',
              resourceLabel: 'Egzona',
              serviceId: 'consultation-short',
              serviceLabel: 'Kort konsultation',
              locationLabel: 'Hair TP Clinic',
            },
          ],
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

test('ccoBookingEngineStore migrerar legacy store till Plan A schema', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-engine-migrate-'));
  const filePath = path.join(tempDir, 'booking-engine.json');
  try {
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          version: 1,
          resources: [{ id: 'fazli', label: 'Fazli Krasniqi', active: true }],
          services: [
            { id: 'consultation', label: 'Konsultation', durationMinutes: 30, active: true },
            { id: 'fue', label: 'FUE', durationMinutes: 480, active: true },
          ],
          availabilityRules: [
            {
              ruleId: 'legacy-consultation',
              resourceId: 'fazli',
              serviceId: 'consultation',
              weekdays: [1, 2, 3, 4, 5],
              startTimes: ['09:00'],
              locationLabel: 'Hair TP Clinic',
            },
          ],
          reservations: [],
          bookings: [],
        },
        null,
        2
      ),
      'utf8'
    );
    const store = await createCcoBookingEngineStore({ filePath });
    const publicServices = await store.listPublicServices();
    assert.deepEqual(publicServices.map((item) => item.id).sort(), [
      'consultation-online',
      'consultation-physical',
      'followup-transplant',
    ]);
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.ok(
      persisted.availabilityRules.some(
        (rule) =>
          rule.serviceId === 'consultation-physical' || rule.serviceId === 'consultation-online'
      )
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore listPublicServices returnerar endast Plan A-tjänster', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-engine-public-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });
    const allServices = await store.listServices();
    const publicServices = await store.listPublicServices();
    assert.equal(allServices.length, 3);
    assert.equal(publicServices.length, 3);
    const ids = publicServices.map((item) => item.id).sort();
    assert.deepEqual(ids, ['consultation-online', 'consultation-physical', 'followup-transplant']);
    assert.ok(publicServices.every((item) => item.publicBookable === true));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
