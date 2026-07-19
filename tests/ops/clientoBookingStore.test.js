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
