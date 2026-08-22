const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoBookingEngineStore,
  isServiceRegisterPublicBookable,
  resolveServiceRegisterAlias,
} = require('../../src/ops/ccoBookingEngineStore');
const { buildServiceRegisterBookingPolicy } = require('../../src/ops/legacyCatalogRuntime');
const {
  addUtcDays,
  bookingMondayWindow,
  buildSlotId,
  nextBookableWeekday,
  slotStartsAt,
  toDateOnly,
} = require('../helpers/bookingTestDates');

const SERVICE_REGISTER_PUBLIC_SERVICE_IDS = buildServiceRegisterBookingPolicy().publicServiceIds;

test('ccoBookingEngineStore listar egna lediga tider, reserverar, bekräftar och avbokar', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-engine-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });

    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
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
      fromDate,
      toDate,
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

    const fromDate = nextBookableWeekday(1);
    const toDate = nextBookableWeekday(2, { minDaysAhead: 3 });
    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
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

    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
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
      fromDate,
      toDate,
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

    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
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

    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
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
      // 10:15–10:45 skär in i konsultationen 10:00–10:45. Tidigare stod här
      // 09:30, som överlappade när dagen började 09:30 — med öppettiden 10:00
      // låg den utanför och testet slutade pröva det den heter.
      startTimes: ['10:15'],
      locationLabel: 'Hair TP Clinic',
      active: true,
    });

    const { fromDate, toDate } = bookingMondayWindow();
    const overlapStartsAt = slotStartsAt(fromDate, '10:15');
    const consultationAvailability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
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
      fromDate,
      toDate,
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
              slotId: buildSlotId({
                resourceId: 'egzona',
                serviceId: 'consultation-short',
                startsAt: overlapStartsAt,
              }),
              startsAt: overlapStartsAt,
              // 30 minuter från 10:15. Slutade tidigare 10:00, alltså före
              // starten — ett negativt intervall överlappar ingenting, och
              // testet hade slutat pröva det den heter.
              endsAt: slotStartsAt(fromDate, '10:45'),
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
    const publicServices = await store.listPublicServices({ brand: 'hair-tp-clinic' });
    assert.deepEqual(
      publicServices.map((item) => item.id).sort(),
      [...SERVICE_REGISTER_PUBLIC_SERVICE_IDS].sort()
    );
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
    const allServices = await store.listServices({ brand: 'hair-tp-clinic' });
    const publicServices = await store.listPublicServices({ brand: 'hair-tp-clinic' });
    assert.equal(allServices.length, SERVICE_REGISTER_PUBLIC_SERVICE_IDS.length);
    assert.equal(publicServices.length, SERVICE_REGISTER_PUBLIC_SERVICE_IDS.length);
    const ids = publicServices.map((item) => item.id).sort();
    assert.deepEqual(ids, [...SERVICE_REGISTER_PUBLIC_SERVICE_IDS].sort());
    assert.ok(publicServices.every((item) => item.publicBookable === true));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore resolverar consultation/followup aliases genom tjänsteregistret', () => {
  assert.equal(resolveServiceRegisterAlias('consultation'), 'consultation-physical');
  assert.equal(resolveServiceRegisterAlias('followup'), 'followup-transplant');
  assert.equal(resolveServiceRegisterAlias('dhi'), 'dhi');
  assert.equal(isServiceRegisterPublicBookable('consultation'), true);
  assert.equal(isServiceRegisterPublicBookable('followup'), true);
  assert.equal(isServiceRegisterPublicBookable('legacy-cliento-60340'), false);
});

test('ccoBookingEngineStore nekar omappad tjänst i publik availability även med regel', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-unmapped-public-'));
  try {
    const filePath = path.join(tempDir, 'booking-engine.json');
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          resources: [{ id: 'fazli', label: 'Fazli', active: true, publicBookable: true }],
          services: [
            {
              id: 'legacy-cliento-60340',
              label: 'Konsultation · Telefon',
              active: true,
              publicBookable: false,
              durationMinutes: 30,
              catalogSource: 'cliento_catalog',
            },
          ],
          availabilityRules: [
            {
              ruleId: 'unmapped-public-deny',
              resourceId: 'fazli',
              serviceId: 'legacy-cliento-60340',
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
    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await store.listPublicAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'fazli',
      srvIds: 'legacy-cliento-60340',
    });
    assert.deepEqual(availability, []);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore listPublicResources returnerar Plan A-läkare utan sjuksköterskor', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-engine-public-res-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });
    const allResources = await store.listResources();
    const publicResources = await store.listPublicResources();
    assert.ok(allResources.length >= 7);
    assert.equal(publicResources.length, 3);
    assert.deepEqual(publicResources.map((item) => item.id).sort(), ['arya', 'egzona', 'fazli']);
    assert.ok(publicResources.every((item) => item.publicBookable === true));

    const tuesday = nextBookableWeekday(2);
    const availability = await store.listPublicAvailability({
      tenantId: 'tenant-a',
      fromDate: tuesday,
      toDate: tuesday,
      srvIds: 'consultation-physical',
    });
    assert.ok(availability.length >= 1);
    assert.ok(
      availability.every((slot) => ['arya', 'egzona', 'fazli'].includes(String(slot.resourceId)))
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore calendar blocks döljer tider och expanderar till kalenderposter', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-blocks-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });
    const iso = nextBookableWeekday(1);
    const weekday = new Date(`${iso}T12:00:00.000Z`).getUTCDay();
    await store.upsertCalendarBlock({
      blockId: 'vacation-egzona-test',
      label: 'Semester',
      blockType: 'vacation',
      resourceIds: ['egzona'],
      weekdays: [weekday],
      startTime: '08:00',
      endTime: '20:00',
      dateFrom: iso,
      dateTo: iso,
    });
    const blocks = await store.listCalendarBlocks({
      fromDate: iso,
      toDate: iso,
      resIds: 'egzona',
    });
    assert.ok(blocks.length >= 1);
    assert.equal(blocks[0].blockType, 'vacation');
    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate: iso,
      toDate: iso,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.equal(availability.length, 0);
    const lunchBlocks = await store.listCalendarBlocks({
      fromDate: iso,
      toDate: iso,
    });
    assert.ok(lunchBlocks.some((item) => item.blockType === 'lunch'));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore stamps priceTier on availability and exposes runtime catalog policy', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-pricing-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });
    const { fromDate, toDate } = bookingMondayWindow({ minDaysAhead: 14 });
    const availability = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate,
      toDate,
      resIds: 'fazli',
      srvIds: 'consultation-physical',
    });
    assert.ok(availability.length >= 1);
    assert.ok(availability.every((slot) => typeof slot.priceTier === 'string'));
    assert.ok(availability.every((slot) => Number.isFinite(Number(slot.priceSek))));

    const catalog = await store.getRuntimeCatalog();
    assert.equal(catalog.summary.bookingPolicy.minNoticeOnlineMinutes, 120);
    assert.equal(catalog.summary.bookingPolicy.maxBookingDaysAhead, 180);
    assert.equal(catalog.summary.resourceCatalog.total, 16);
    assert.ok(catalog.summary.pricingRules);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore markerar RFC-2606-bokningar som permanent testdata', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-booking-engine-testdata-'));
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });
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

    const realBooking = await store.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-real',
      customerEmail: 'real-patient@hairtpclinic.com',
      customerName: 'Real Patient',
      slot,
    });
    assert.equal(realBooking.isTestData, false);

    const testBooking = await store.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-test',
      customerEmail: 'test@example.com',
      customerName: 'Test Patient',
      slot: availability[1] || slot,
    });
    assert.equal(testBooking.isTestData, true);

    const all = store.listBookingsForEnrichment('tenant-a');
    assert.equal(all.length, 2);

    const excludingTest = store.listBookingsForEnrichment('tenant-a', { excludeTestData: true });
    assert.equal(excludingTest.length, 1);
    assert.equal(excludingTest[0].bookingId, realBooking.bookingId);

    const dossierBookings = store.getBookingsForCustomer({
      tenantId: 'tenant-a',
      customerEmail: 'test@example.com',
      excludeTestData: true,
    });
    assert.equal(dossierBookings.length, 0);

    const caseSummary = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-test',
      customerEmail: 'test@example.com',
      excludeTestData: true,
    });
    assert.equal(caseSummary.booking, null);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore bevarar isTestData vid ombokning', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-engine-rebook-testdata-')
  );
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });
    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(availability.length >= 2);

    const first = await store.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-rebook-test',
      customerEmail: 'test@example.com',
      customerName: 'Test Patient',
      slot: availability[0],
    });
    assert.equal(first.isTestData, true);

    const second = await store.rebookBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-rebook-test',
      customerEmail: 'test@example.com',
      selectedSlots: [availability[1]],
      slot: availability[1],
    });
    assert.equal(second.isTestData, true);

    const all = store.listBookingsForEnrichment('tenant-a', { excludeTestData: true });
    assert.equal(all.length, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore rullar tillbaka ombokning om ny tid inte kan reserveras', async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-engine-rebook-rollback-')
  );
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });

    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(availability.length >= 2);
    const firstSlot = availability[0];
    const secondSlot = availability[1];

    const originalBooking = await store.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-rebook-rollback',
      customerEmail: 'rollback@example.com',
      customerName: 'Rollback',
      slot: firstSlot,
    });
    assert.equal(originalBooking.status, 'confirmed');
    assert.equal(originalBooking.slot.slotId, firstSlot.slotId);

    // Uppta måltiden med en annan patient så att reserveSlots failar efter cancel.
    await store.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-rebook-rollback-other',
      customerEmail: 'other@example.com',
      customerName: 'Other',
      slot: secondSlot,
    });

    await assert.rejects(
      () =>
        store.rebookBooking({
          tenantId: 'tenant-a',
          workspaceId: 'major-arcana-preview',
          conversationId: 'conv-rebook-rollback',
          customerEmail: 'rollback@example.com',
          selectedSlots: [secondSlot],
          slot: secondSlot,
        }),
      (error) => {
        assert.equal(error.statusCode, 409);
        return true;
      }
    );

    const summary = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-rebook-rollback',
      customerEmail: 'rollback@example.com',
    });
    assert.equal(summary.booking.status, 'confirmed');
    assert.equal(summary.booking.slot.slotId, firstSlot.slotId);
    assert.equal(summary.booking.bookingId, originalBooking.bookingId);

    const otherSummary = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-rebook-rollback-other',
      customerEmail: 'other@example.com',
    });
    assert.equal(otherSummary.booking.status, 'confirmed');
    assert.equal(otherSummary.booking.slot.slotId, secondSlot.slotId);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('ccoBookingEngineStore rullar tillbaka kirurgiskt och rör inte andra patienters rader', async () => {
  // Regressionsskydd för det fönster som en helstate-återställning öppnar.
  //
  // Rollbacken vid misslyckad ombokning måste röra BARA den ombokande
  // patientens rader. Skriver någon annan till state medan ombokningen pågår
  // — personalen avbokar en annan patient, till exempel — får den skrivningen
  // inte tystas av vår rollback.
  //
  // `cancelBooking` går inte via createBookingMutationTail, så den kan landa
  // mitt i ombokningens fönster. Testet placerar den där med flit.
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-cco-booking-engine-rebook-kirurgisk-')
  );
  try {
    const store = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'booking-engine.json'),
    });

    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await store.listAvailability({
      tenantId: 'tenant-a',
      fromDate,
      toDate,
      resIds: 'egzona',
      srvIds: 'consultation-physical',
    });
    assert.ok(availability.length >= 3);
    const [egenTid, maltid, annanTid] = availability;

    const egen = await store.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-kirurgisk-egen',
      customerEmail: 'egen@example.com',
      customerName: 'Egen',
      slot: egenTid,
    });
    assert.equal(egen.status, 'confirmed');

    // Blockerar måltiden så att ombokningen failar efter avbokningen.
    await store.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-kirurgisk-blockerare',
      customerEmail: 'blockerare@example.com',
      customerName: 'Blockerare',
      slot: maltid,
    });

    // Den oskyldiga tredje parten. Den ska avbokas mitt i fönstret och
    // fortfarande vara avbokad när allt är över.
    await store.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-kirurgisk-tredje',
      customerEmail: 'tredje@example.com',
      customerName: 'Tredje',
      slot: annanTid,
    });

    const ombokning = store.rebookBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-kirurgisk-egen',
      customerEmail: 'egen@example.com',
      selectedSlots: [maltid],
      slot: maltid,
    });

    // Vänta tills vi bevisligen är inne i fönstret: originalet är avbokat men
    // ombokningen har inte returnerat än. Ingen sleep — vi pollar tillståndet.
    let inneIFonstret = false;
    for (let i = 0; i < 200 && !inneIFonstret; i += 1) {
      const s = await store.getCaseSummary({
        tenantId: 'tenant-a',
        conversationId: 'conv-kirurgisk-egen',
        customerEmail: 'egen@example.com',
      });
      if (!s.booking) inneIFonstret = true;
      else await new Promise((r) => setImmediate(r));
    }
    assert.ok(inneIFonstret, 'kom aldrig in i ombokningens fönster');

    await store.cancelBooking({
      tenantId: 'tenant-a',
      conversationId: 'conv-kirurgisk-tredje',
      customerEmail: 'tredje@example.com',
      reason: 'Patienten ringde och avbokade',
    });

    await assert.rejects(
      () => ombokning,
      (error) => {
        assert.equal(error.metadata?.rebookRolledBack, true);
        return true;
      }
    );

    // Vår egen bokning ska vara tillbaka.
    const egenEfter = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-kirurgisk-egen',
      customerEmail: 'egen@example.com',
    });
    assert.equal(egenEfter.booking.status, 'confirmed');
    assert.equal(egenEfter.booking.bookingId, egen.bookingId);

    // Den tredje partens avbokning ska INTE ha återuppstått.
    const tredjeEfter = await store.getCaseSummary({
      tenantId: 'tenant-a',
      conversationId: 'conv-kirurgisk-tredje',
      customerEmail: 'tredje@example.com',
    });
    assert.equal(
      tredjeEfter.booking,
      null,
      'rollbacken återuppväckte en avbokning som tillhörde någon annan'
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('staff-hanterade availabilityRules överlever sammanslagningen med defaults', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-staff-rule-'));
  try {
    const filePath = path.join(tempDir, 'booking-engine.json');
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          version: 1,
          resources: [{ id: 'veronica', label: 'Veronica', active: true, publicBookable: false }],
          services: [{ id: 'consultation-physical', label: 'Konsultation', durationMinutes: 45, active: true }],
          availabilityRules: [
            {
              ruleId: 'rule-cons-veronica',
              resourceId: 'veronica',
              serviceId: 'consultation-physical',
              weekdays: [1, 2, 3, 4, 5],
              startTimes: ['09:30'],
              locationLabel: 'Hair TP Clinic',
              managedBy: 'staff',
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
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const rule = persisted.availabilityRules.find((r) => r.ruleId === 'rule-cons-veronica');
    assert.ok(rule, 'regeln finns kvar');
    assert.equal(rule.managedBy, 'staff');
    assert.deepEqual(rule.startTimes, ['09:30'], 'personalens starttider ska inte skrivas över');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('cykliska availabilityRules gäller bara rätt vecka', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-cycle-rule-'));
  try {
    const filePath = path.join(tempDir, 'booking-engine.json');
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          version: 1,
          resources: [{ id: 'veronica', label: 'Veronica', active: true, publicBookable: false }],
          services: [{ id: 'consultation-physical', label: 'Konsultation', durationMinutes: 45, active: true }],
          availabilityRules: [
            {
              ruleId: 'rule-cons-veronica',
              resourceId: 'veronica',
              serviceId: 'consultation-physical',
              weekdays: [1],
              startTimes: ['10:00'],
              locationLabel: 'Hair TP Clinic',
              managedBy: 'staff',
              cycleWeeks: 4,
              cycleWeek: 1,
              cycleStart: '2026-08-24T00:00:00.000Z',
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

    // 2026-08-24 är måndag i cykelvecka 1 — ska ge en tid.
    const inCycle = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate: '2026-08-24',
      toDate: '2026-08-24',
      resIds: 'veronica',
      srvIds: 'consultation-physical',
    });
    assert.equal(inCycle.length, 1, 'cykelvecka 1 ska ge en tid på ankardatumet');

    // 2026-08-17 är måndag i cykelvecka 4 — ska inte ge någon tid för cycleWeek 1.
    const outOfCycle = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate: '2026-08-17',
      toDate: '2026-08-17',
      resIds: 'veronica',
      srvIds: 'consultation-physical',
    });
    assert.equal(outOfCycle.length, 0, 'cykelvecka 4 ska inte ge tid för cycleWeek 1');

    // 2026-09-21 är måndag i cykelvecka 1 igen.
    const nextCycle = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate: '2026-09-21',
      toDate: '2026-09-21',
      resIds: 'veronica',
      srvIds: 'consultation-physical',
    });
    assert.equal(nextCycle.length, 1, 'cykelvecka 1 ska återkomma fyra veckor senare');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('sjuksköterskor har aktiva cykliska konsultationsregler i defaultState', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-nurse-defaults-'));
  try {
    const filePath = path.join(tempDir, 'booking-engine.json');
    const store = await createCcoBookingEngineStore({ filePath });
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf8'));

    const nurseIds = ['veronica', 'clara', 'wendela', 'louise'];
    for (const resourceId of nurseIds) {
      const consRules = persisted.availabilityRules.filter(
        (r) => r.resourceId === resourceId && r.serviceId === 'consultation-physical'
      );
      const otherRules = persisted.availabilityRules.filter(
        (r) => r.resourceId === resourceId && r.serviceId !== 'consultation-physical'
      );

      assert.ok(consRules.length >= 4, `${resourceId} ska ha cykliska konsultationsregler`);
      assert.ok(
        consRules.every(
          (r) =>
            r.active === true &&
            r.managedBy === 'staff' &&
            r.cycleWeeks === 4 &&
            r.cycleStart === '2026-08-24T00:00:00.000Z'
        ),
        `${resourceId}s konsultationsregler ska vara aktiva, staff-märkta och cykliska`
      );
      assert.ok(
        otherRules.every((r) => r.active === false && r.managedBy === 'staff'),
        `${resourceId}s övriga regler ska vara avstängda`
      );
    }

    const { fromDate: monday } = bookingMondayWindow();
    const sunday = toDateOnly(addUtcDays(new Date(`${monday}T00:00:00.000Z`), 6));
    for (const resourceId of nurseIds) {
      const availability = await store.listAvailability({
        tenantId: 'hair-tp-clinic',
        fromDate: monday,
        toDate: sunday,
        resIds: resourceId,
        srvIds: 'consultation-physical',
      });
      assert.ok(availability.length > 0, `${resourceId} ska erbjuda tider kommande vecka`);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('post-migration stänger av aktiva sjuksköterskeregler från äldre data', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-nurse-migration-'));
  try {
    const filePath = path.join(tempDir, 'booking-engine.json');
    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          version: 1,
          resources: [
            { id: 'veronica', label: 'Veronica', active: true, publicBookable: false, role: 'Sjuksköterska' },
            { id: 'clara', label: 'Clara', active: true, publicBookable: false, role: 'Sjuksköterska' },
          ],
          services: [{ id: 'consultation-physical', label: 'Konsultation', durationMinutes: 45, active: true }],
          availabilityRules: [
            {
              ruleId: 'rule-cons-veronica',
              resourceId: 'veronica',
              serviceId: 'consultation-physical',
              weekdays: [1, 2, 3, 4, 5],
              startTimes: ['10:00'],
              locationLabel: 'Hair TP Clinic',
              active: true,
            },
            {
              ruleId: 'rule-cons-clara',
              resourceId: 'clara',
              serviceId: 'consultation-physical',
              weekdays: [1, 2, 3, 4, 5],
              startTimes: ['11:00'],
              locationLabel: 'Hair TP Clinic',
              active: true,
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
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf8'));

    const veronicaRule = persisted.availabilityRules.find((r) => r.ruleId === 'rule-cons-veronica');
    const claraRule = persisted.availabilityRules.find((r) => r.ruleId === 'rule-cons-clara');

    assert.equal(veronicaRule.active, false, 'Veronicas regel ska stängas av');
    assert.equal(veronicaRule.managedBy, 'staff', 'Veronicas regel ska staff-märkas');
    assert.equal(claraRule.active, false, 'Claras regel ska stängas av');
    assert.equal(claraRule.managedBy, 'staff', 'Claras regel ska staff-märkas');

    const { fromDate, toDate } = bookingMondayWindow();
    const availability = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate,
      toDate,
      resIds: 'veronica,clara',
      srvIds: 'consultation-physical',
    });
    assert.ok(availability.length > 0, 'cykliska regler ska ge tider för veronica och clara');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('Wendelas måndagstid återkommer i cykelvecka 2', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-wendela-cycle-'));
  try {
    const filePath = path.join(tempDir, 'booking-engine.json');
    const store = await createCcoBookingEngineStore({ filePath });

    // 2026-08-31 och 2026-09-28 är båda måndagar i cykelvecka 2 (v36 och v40).
    // Wendela har skift A dessa veckor (mån–fre 08–17) och ska därför ha tider.
    for (const date of ['2026-08-31', '2026-09-28']) {
      const availability = await store.listAvailability({
        tenantId: 'hair-tp-clinic',
        fromDate: date,
        toDate: date,
        resIds: 'wendela',
        srvIds: 'consultation-physical',
      });
      assert.ok(availability.length > 0, `Wendela ska ha måndagstid ${date}`);
    }

    // 2026-08-24 är måndag i cykelvecka 1; Wendela har skift D (ons–lör) och ska
    // inte ha någon måndagstid.
    const outOfShift = await store.listAvailability({
      tenantId: 'hair-tp-clinic',
      fromDate: '2026-08-24',
      toDate: '2026-08-24',
      resIds: 'wendela',
      srvIds: 'consultation-physical',
    });
    assert.equal(outOfShift.length, 0, 'Wendela ska inte ha måndagstid i cykelvecka 1');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
