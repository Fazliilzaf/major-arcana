const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createClientoBookingStore,
  normalizeBooking,
} = require('../../src/ops/clientoBookingStore');

test('importBatch with blank tenantId accepts nothing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-blank-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });
  const r = await store.importBatch({
    tenantId: '   ',
    bookings: [{ bookingId: 'x', customerEmail: 'a@b.co' }],
  });
  assert.equal(r.accepted, 0);
  assert.equal(r.rejected, 0);
  await fs.rm(dir, { recursive: true, force: true });
});

test('normalizeBooking returns null without bookingId or customer identity', () => {
  assert.equal(normalizeBooking({}), null);
  assert.equal(normalizeBooking({ bookingId: 'x' }), null);
  assert.equal(normalizeBooking({ customerEmail: 'a@b.co' }), null);
});

test('store retains identityless Cliento rows in the existing booking model for review', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-unlinked-'));
  const store = await createClientoBookingStore({ filePath: path.join(dir, 'bookings.json') });
  const result = await store.importBatch({
    tenantId: 'tenant-review',
    bookings: [
      {
        bookingId: 'review-1',
        source: 'cliento_csv',
        startsAt: '2024-07-02T09:00:00.000Z',
      },
    ],
  });
  assert.equal(result.accepted, 1);
  const rows = store.listAllBookings({ tenantId: 'tenant-review' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bookingId, 'review-1');
  assert.equal(rows[0].tenantId, 'tenant-review');
  assert.equal(rows[0].patientId, '');
  await fs.rm(dir, { recursive: true, force: true });
});

test('read-only list methods expose tenantId from the existing bucket key', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-tenant-read-'));
  const store = await createClientoBookingStore({ filePath: path.join(dir, 'bookings.json') });
  await store.importBatch({
    tenantId: 'hair_tp',
    bookings: [
      {
        bookingId: 'tenant-read-1',
        customerEmail: 'tenant@example.com',
        startsAt: '2026-01-10T09:00:00.000Z',
      },
    ],
  });
  const all = store.listAllBookings({ tenantId: '' });
  const inRange = store.listBookingsInRange({
    tenantId: '',
    fromDate: '2026-01-10',
    toDate: '2026-01-10',
  });
  assert.equal(all[0].tenantId, 'hair_tp');
  assert.equal(inRange[0].tenantId, 'hair_tp');
  await fs.rm(dir, { recursive: true, force: true });
});

test('normalizeBooking accepts phone or Cliento id when historical email is missing', () => {
  const byPhone = normalizeBooking({ bookingId: 'phone-only', customerPhone: '070 123 45 67' });
  const byClientoId = normalizeBooking({
    bookingId: 'cliento-only',
    clientoCustomerId: 'client-123',
  });
  assert.ok(byPhone);
  assert.ok(byClientoId);
  assert.equal(byPhone.customerEmail, '');
  assert.equal(byClientoId.clientoCustomerId, 'client-123');
});

test('importBatch retains phone-only historical bookings for population matching', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-phone-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });
  const result = await store.importBatch({
    tenantId: 'tenant-phone',
    bookings: [
      {
        bookingId: 'phone-history-1',
        customerPhone: '070 123 45 67',
        clientoCustomerId: 'client-phone',
        status: 'completed',
      },
    ],
  });
  assert.equal(result.accepted, 1);
  assert.equal(store.listAllBookings({ tenantId: 'tenant-phone' }).length, 1);
  await fs.rm(dir, { recursive: true, force: true });
});

test('normalizeBooking uses id when bookingId missing', () => {
  const b = normalizeBooking({
    id: 'from-id-field',
    customerEmail: 'user@example.com',
    service: 'Cut',
    staff: 'Sam',
    location: 'Main',
  });
  assert.ok(b);
  assert.equal(b.bookingId, 'from-id-field');
  assert.equal(b.customerEmail, 'user@example.com');
  assert.equal(b.serviceLabel, 'Cut');
  assert.equal(b.staffName, 'Sam');
  assert.equal(b.locationName, 'Main');
});

test('normalizeBooking strips mailto prefix from customerEmail', () => {
  const b = normalizeBooking({
    bookingId: 'b-mailto',
    customerEmail: 'mailto:Person@Example.COM',
  });
  assert.ok(b);
  assert.equal(b.customerEmail, 'person@example.com');
});

test('normalizeBooking preserves Cliento journey identity, status and notes', () => {
  const b = normalizeBooking({
    bookingId: 'journey-1',
    customerEmail: 'journey@example.com',
    customerPhone: '070 123 45 67',
    clientoCustomerId: 'cl-99',
    status: 'no_show',
    rawStatus: 'No show',
    notes: 'Kunden kom inte till konsultationen.',
    bookingNotes: 'Bokningsnot',
    internalNotes: 'Intern not',
    treatmentNotes: 'Behandlingsnot',
    patientId: 'patient-canonical',
    encounterId: 'encounter-1',
    sourceMessageId: '<message-1@cliento.com>',
    priceSek: '2 500 kr',
  });
  assert.equal(b.customerPhone, '070 123 45 67');
  assert.equal(b.clientoCustomerId, 'cl-99');
  assert.equal(b.status, 'no_show');
  assert.equal(b.rawStatus, 'No show');
  assert.equal(b.notes, 'Kunden kom inte till konsultationen.');
  assert.equal(b.bookingNotes, 'Bokningsnot');
  assert.equal(b.internalNotes, 'Intern not');
  assert.equal(b.treatmentNotes, 'Behandlingsnot');
  assert.equal(b.patientId, 'patient-canonical');
  assert.equal(b.encounterId, 'encounter-1');
  assert.equal(b.sourceMessageId, '<message-1@cliento.com>');
  assert.equal(b.priceSek, 2500);
});

test('getBookingsForCustomer returns empty for blank tenantId or customerEmail', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-get-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });

  await store.importBatch({
    tenantId: 'tenant-g',
    bookings: [{ bookingId: 'g1', customerEmail: 'guest@x.com', status: 'upcoming' }],
  });
  await store.flush();

  assert.deepEqual(
    store.getBookingsForCustomer({ tenantId: '', customerEmail: 'guest@x.com' }),
    []
  );
  assert.deepEqual(store.getBookingsForCustomer({ tenantId: 'tenant-g', customerEmail: '  ' }), []);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listAllBookings respects limit across customer buckets', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-limit-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });

  await store.importBatch({
    tenantId: 'tenant-lim',
    bookings: [
      { bookingId: 'l1', customerEmail: 'a@x.com', status: 'upcoming' },
      { bookingId: 'l2', customerEmail: 'b@x.com', status: 'upcoming' },
      { bookingId: 'l3', customerEmail: 'c@x.com', status: 'completed' },
    ],
  });
  await store.flush();

  const capped = store.listAllBookings({ tenantId: 'tenant-lim', limit: 2 });
  assert.equal(capped.length, 2);

  await fs.rm(dir, { recursive: true, force: true });
});

test('listBookingsInRange returns only the requested tenant and calendar range', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-range-'));
  const store = await createClientoBookingStore({ filePath: path.join(dir, 'bookings.json') });
  await store.importBatch({
    tenantId: 'tenant-range',
    bookings: [
      {
        bookingId: 'before',
        customerEmail: 'range@example.com',
        startsAt: '2026-05-31T09:00:00.000Z',
      },
      {
        bookingId: 'inside-a',
        customerEmail: 'range@example.com',
        startsAt: '2026-06-01T09:00:00.000Z',
      },
      {
        bookingId: 'inside-b',
        customerEmail: 'range@example.com',
        startsAt: '2026-06-07T17:00:00.000Z',
      },
      {
        bookingId: 'after',
        customerEmail: 'range@example.com',
        startsAt: '2026-06-08T09:00:00.000Z',
      },
    ],
  });
  await store.importBatch({
    tenantId: 'tenant-other',
    bookings: [
      {
        bookingId: 'other-tenant',
        customerEmail: 'range@example.com',
        startsAt: '2026-06-02T09:00:00.000Z',
      },
    ],
  });

  const rows = store.listBookingsInRange({
    tenantId: 'tenant-range',
    fromDate: '2026-06-01',
    toDate: '2026-06-07',
  });
  assert.deepEqual(
    rows.map((row) => row.bookingId),
    ['inside-a', 'inside-b']
  );
  assert.deepEqual(
    store.listBookingsInRange({
      tenantId: 'tenant-range',
      fromDate: '2026-06-07',
      toDate: '2026-06-01',
    }),
    []
  );
  await fs.rm(dir, { recursive: true, force: true });
});

test('bookings persist across store instances after flush', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-reload-'));
  const filePath = path.join(dir, 'bookings.json');

  const first = await createClientoBookingStore({ filePath });
  await first.upsertBooking({
    tenantId: 'tenant-re',
    booking: {
      bookingId: 'persist-b1',
      customerEmail: 'Keep@X.COM',
      status: 'upcoming',
      notes: 'reload me',
    },
  });
  await first.flush();

  const second = await createClientoBookingStore({ filePath });
  const rows = second.getBookingsForCustomer({
    tenantId: 'tenant-re',
    customerEmail: 'keep@x.com',
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bookingId, 'persist-b1');
  assert.equal(rows[0].notes, 'reload me');

  await fs.rm(dir, { recursive: true, force: true });
});

test('partial booking update does not erase Cliento notes, phone or original createdAt', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-preserve-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });
  await store.upsertBooking({
    tenantId: 'tenant-preserve',
    booking: {
      bookingId: 'preserve-1',
      customerEmail: 'preserve@example.com',
      customerPhone: '0701234567',
      notes: 'No show enligt Cliento',
      status: 'no_show',
    },
  });
  const before = store.getBookingsForCustomer({
    tenantId: 'tenant-preserve',
    customerEmail: 'preserve@example.com',
  })[0];
  await store.upsertBooking({
    tenantId: 'tenant-preserve',
    booking: {
      bookingId: 'preserve-1',
      customerEmail: 'preserve@example.com',
      status: 'no_show',
    },
  });
  const after = store.getBookingsForCustomer({
    tenantId: 'tenant-preserve',
    customerEmail: 'preserve@example.com',
  })[0];
  assert.equal(after.customerPhone, '0701234567');
  assert.equal(after.notes, 'No show enligt Cliento');
  assert.equal(after.createdAt, before.createdAt);
  await fs.rm(dir, { recursive: true, force: true });
});

test('importBatch upserts and getBookingsForCustomer reads bucket', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });

  const isoStart = '2026-06-01T09:00:00.000Z';
  const isoEnd = '2026-06-01T10:00:00.000Z';
  await store.importBatch({
    tenantId: 'tenant-1',
    source: 'mock',
    bookings: [
      {
        bookingId: 'b-1',
        customerEmail: 'Patient@Example.COM',
        customerName: 'Pat',
        serviceLabel: 'Consult',
        startsAt: isoStart,
        endsAt: isoEnd,
        status: 'upcoming',
        source: 'mock',
      },
    ],
  });

  const rows = store.getBookingsForCustomer({
    tenantId: 'tenant-1',
    customerEmail: 'patient@example.com',
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bookingId, 'b-1');
  assert.equal(rows[0].customerEmail, 'patient@example.com');
  assert.equal(rows[0].status, 'upcoming');

  await store.upsertBooking({
    tenantId: 'tenant-1',
    booking: {
      bookingId: 'b-1',
      customerEmail: 'patient@example.com',
      startsAt: isoStart,
      endsAt: isoEnd,
      status: 'completed',
      notes: 'Done',
    },
  });
  await store.flush();

  const updated = store.getBookingsForCustomer({
    tenantId: 'tenant-1',
    customerEmail: 'patient@example.com',
  });
  assert.equal(updated[0].status, 'completed');
  assert.equal(updated[0].notes, 'Done');

  const sum = store.summarize({ tenantId: 'tenant-1' });
  assert.equal(sum.totalBookings, 1);
  assert.equal(sum.totalCustomers, 1);
  assert.equal(sum.lastImport?.accepted, 1);

  const removed = await store.clearTenant({ tenantId: 'tenant-1' });
  assert.equal(removed, 1);
  assert.equal(
    store.getBookingsForCustomer({ tenantId: 'tenant-1', customerEmail: 'patient@example.com' })
      .length,
    0
  );

  await fs.rm(dir, { recursive: true, force: true });
});

test('importBatch rejects invalid rows and still records import stats', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento2-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });

  const r = await store.importBatch({
    tenantId: 't2',
    bookings: [
      { bookingId: '', customerEmail: 'x@y.z' },
      { bookingId: 'ok', customerEmail: 'x@y.z' },
    ],
  });
  assert.equal(r.accepted, 1);
  assert.equal(r.rejected, 1);

  await fs.rm(dir, { recursive: true, force: true });
});

test('normalizeBooking sätter durationMinutes till null vid icke-finit värde', () => {
  const b = normalizeBooking({
    bookingId: 'dm',
    customerEmail: 'u@e.com',
    durationMinutes: Number.NaN,
  });
  assert.ok(b);
  assert.equal(b.durationMinutes, null);
});

test('normalizeBooking default status unknown och source cliento nar fält saknas', () => {
  const b = normalizeBooking({
    bookingId: 'defs',
    customerEmail: 'u@e.com',
  });
  assert.ok(b);
  assert.equal(b.status, 'unknown');
  assert.equal(b.source, 'cliento');
});

test('importBatch tom bookings-array ger noll accept och reject', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-empty-batch-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });
  const r = await store.importBatch({ tenantId: 't-empty', bookings: [] });
  assert.equal(r.accepted, 0);
  assert.equal(r.rejected, 0);
  await fs.rm(dir, { recursive: true, force: true });
});

// 2026-08-08: ORD-100 Fas 0 hittade 17 727 dubbletter/tomma bookingId i prod.
// Rotorsak: samma bookingId importerad med olika identitetsfält ifyllda
// mellan körningar hamnade i olika hinkar (toBookingBucketKey), och dedupen
// var scoped per hink — inte global. De här testerna reproducerar buggen och
// bekräftar den globala bookingId-uppslagningen fixar den.
test('samma bookingId med olika identitetsfält mellan importer skapar INTE en dubblett', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-dedupe-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });

  // Körning 1: raden har bara e-post — hamnar i e-posthinken.
  await store.importBatch({
    tenantId: 'hair_tp',
    bookings: [
      {
        bookingId: 'dup-1',
        customerEmail: 'anna@example.com',
        status: 'Booked',
        source: 'cliento_csv',
      },
    ],
  });

  // Körning 2: samma bookingId, men raden saknar e-post och har i stället
  // telefon och clientoCustomerId — skulle naturligt hamna i en annan hink.
  await store.importBatch({
    tenantId: 'hair_tp',
    bookings: [
      {
        bookingId: 'dup-1',
        customerPhone: '+46701234567',
        clientoCustomerId: 'cliento-123',
        status: 'Show',
        source: 'cliento_csv',
      },
    ],
  });

  const rows = store.listAllBookings({ tenantId: 'hair_tp' });
  assert.equal(rows.length, 1, 'samma bookingId ska ge EN rad, inte två');
  assert.equal(rows[0].status, 'Show', 'andra körningens fält ska ha uppdaterat posten');
  assert.equal(rows[0].customerEmail, 'anna@example.com', 'e-posten från körning 1 ska bevaras');
  assert.equal(rows[0].customerPhone, '+46701234567');

  // Kundlookupen via ursprungsmejlet ska fortfarande hitta bokningen —
  // fixen flyttar aldrig posten till en ny hink.
  const forCustomer = store.getBookingsForCustomer({
    tenantId: 'hair_tp',
    customerEmail: 'anna@example.com',
  });
  assert.equal(forCustomer.length, 1);
  assert.equal(forCustomer[0].bookingId, 'dup-1');

  await fs.rm(dir, { recursive: true, force: true });
});

test('global bookingId-index återuppbyggs korrekt vid omstart (nytt store-objekt, samma fil)', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-reload-'));
  const filePath = path.join(dir, 'bookings.json');

  const store1 = await createClientoBookingStore({ filePath });
  await store1.importBatch({
    tenantId: 'hair_tp',
    bookings: [{ bookingId: 'reload-1', customerEmail: 'bob@example.com', source: 'cliento_csv' }],
  });
  await store1.flush();

  // Ny store-instans läser samma fil — index måste byggas om ur state.bookings,
  // inte bara finnas kvar i minnet från förra instansen.
  const store2 = await createClientoBookingStore({ filePath });
  await store2.importBatch({
    tenantId: 'hair_tp',
    bookings: [{ bookingId: 'reload-1', customerPhone: '+46709999999', source: 'cliento_csv' }],
  });

  const rows = store2.listAllBookings({ tenantId: 'hair_tp' });
  assert.equal(rows.length, 1, 'index efter omstart ska fortfarande förhindra dubblett');
  assert.equal(rows[0].customerEmail, 'bob@example.com');
  assert.equal(rows[0].customerPhone, '+46709999999');

  await fs.rm(dir, { recursive: true, force: true });
});

// dedupeBookings sanerar dubbletter som redan finns i lagret (skrivna INNAN
// den globala dedupen fanns). Injicerar en dubblett direkt via _state, sa
// samma sorts spridda kopior som prod-datan hade kan reproduceras utan att
// forlita sig pa import-ordning.
test('findDuplicateBookingGroups hittar en bookingId spridd over tva hinkar', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-finddupe-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });

  store._state.bookings['t1::carla@example.com'] = [
    {
      bookingId: 'legacy-dup-1',
      customerEmail: 'carla@example.com',
      status: 'Booked',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];
  store._state.bookings['t1::cliento:cust-77'] = [
    {
      bookingId: 'legacy-dup-1',
      clientoCustomerId: 'cust-77',
      status: 'Show',
      updatedAt: '2024-06-01T00:00:00.000Z',
    },
  ];

  const groups = store.findDuplicateBookingGroups({ tenantId: 't1' });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 2);

  await fs.rm(dir, { recursive: true, force: true });
});

test('dedupeBookings dry-run rapporterar men skriver ingenting', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-dedry-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });

  store._state.bookings['t1::carla@example.com'] = [
    {
      bookingId: 'legacy-dup-2',
      customerEmail: 'carla@example.com',
      status: 'Booked',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];
  store._state.bookings['t1::cliento:cust-88'] = [
    {
      bookingId: 'legacy-dup-2',
      clientoCustomerId: 'cust-88',
      status: 'Show',
      updatedAt: '2024-06-01T00:00:00.000Z',
    },
  ];

  const report = await store.dedupeBookings({ tenantId: 't1', commit: false });
  assert.equal(report.duplicateGroups, 1);
  assert.equal(report.recordsThatWouldBeRemoved, 1);
  assert.equal(report.samples[0].bookingId, 'legacy-dup-2');
  assert.equal(report.samples[0].bucketsFound, 2);
  // Rapporten läcker aldrig e-post/telefon — bara identitetstyp.
  assert.deepEqual(
    new Set(report.samples[0].identityTypesFound),
    new Set(['email', 'clientoCustomerId'])
  );

  // Dry-run ska inte ha ändrat något i lagret.
  assert.equal(store.listAllBookings({ tenantId: 't1' }).length, 2);

  await fs.rm(dir, { recursive: true, force: true });
});

test('dedupeBookings commit slår ihop dubbletten till en post och bevarar fält', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cliento-decommit-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });

  store._state.bookings['t1::carla@example.com'] = [
    {
      bookingId: 'legacy-dup-3',
      customerEmail: 'carla@example.com',
      bookingNotes: 'Första bokningen, ingen notis i den senare',
      status: 'Booked',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];
  store._state.bookings['t1::cliento:cust-99'] = [
    {
      bookingId: 'legacy-dup-3',
      clientoCustomerId: 'cust-99',
      status: 'Show',
      updatedAt: '2024-06-01T00:00:00.000Z',
    },
  ];

  const report = await store.dedupeBookings({ tenantId: 't1', commit: true });
  assert.equal(report.recordsThatWouldBeRemoved, 1);

  const rows = store.listAllBookings({ tenantId: 't1' });
  assert.equal(rows.length, 1, 'dubbletten ska vara sammanslagen till en rad');
  assert.equal(rows[0].status, 'Show', 'senaste updatedAt ska vinna för status');
  assert.equal(
    rows[0].customerEmail,
    'carla@example.com',
    'e-post från den äldre posten ska bevaras'
  );
  assert.equal(
    rows[0].clientoCustomerId,
    'cust-99',
    'clientoCustomerId från den nyare posten ska bevaras'
  );
  assert.equal(
    rows[0].bookingNotes,
    'Första bokningen, ingen notis i den senare',
    'anteckning från den äldre posten ska inte skrivas över av ett tomt fält'
  );

  // Global-index-fixen ska förhindra att en NY import återskapar dubbletten.
  await store.upsertBooking({
    tenantId: 't1',
    booking: { bookingId: 'legacy-dup-3', customerPhone: '+46700000000', source: 'cliento_csv' },
  });
  assert.equal(store.listAllBookings({ tenantId: 't1' }).length, 1);

  await fs.rm(dir, { recursive: true, force: true });
});
