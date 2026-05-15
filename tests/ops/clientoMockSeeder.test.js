const test = require('node:test');
const assert = require('node:assert/strict');

const { mockBookingsForCustomer, seedFromMailboxTruth } = require('../../src/ops/clientoMockSeeder');

function bookingFieldsWithoutClock(bookings) {
  return bookings.map(({ startsAt, endsAt, ...rest }) => rest);
}

test('mockBookingsForCustomer is PRNG-deterministic per email (excluding wall clock)', () => {
  const a = mockBookingsForCustomer('stable-seed@patient.example', 'Stable');
  const b = mockBookingsForCustomer('stable-seed@patient.example', 'Stable');
  assert.deepEqual(bookingFieldsWithoutClock(a), bookingFieldsWithoutClock(b));
  assert.equal(a.length, b.length);
  for (const booking of a) {
    assert.equal(booking.customerEmail, 'stable-seed@patient.example');
    assert.equal(booking.source, 'mock');
    assert.ok(['upcoming', 'completed', 'cancelled', 'no_show'].includes(booking.status));
    assert.match(booking.bookingId, /^mock_stable-seed@patient\.example_\d+$/);
    assert.ok(Number.isFinite(Date.parse(booking.startsAt)));
    assert.ok(Number.isFinite(Date.parse(booking.endsAt)));
  }
});

test('seedFromMailboxTruth throws without mailbox truth store', async () => {
  await assert.rejects(
    () =>
      seedFromMailboxTruth({
        tenantId: 't1',
        ccoMailboxTruthStore: null,
        clientoBookingStore: { importBatch: async () => ({ accepted: 0, rejected: 0 }) },
      }),
    /ccoMailboxTruthStore/i,
  );
});

test('seedFromMailboxTruth throws without cliento booking store', async () => {
  await assert.rejects(
    () =>
      seedFromMailboxTruth({
        tenantId: 't1',
        ccoMailboxTruthStore: { listMessages: () => [] },
        clientoBookingStore: null,
      }),
    /clientoBookingStore/i,
  );
});

test('seedFromMailboxTruth aggregates customers and calls importBatch', async () => {
  let captured = null;
  const ccoMailboxTruthStore = {
    listMessages: () => [
      {
        mailboxId: 'clinic@demo.se',
        customerEmail: 'one@patient.se',
        customerName: 'One',
        receivedAt: '2026-03-01T10:00:00.000Z',
      },
      {
        mailboxId: 'clinic@demo.se',
        customerEmail: 'two@patient.se',
        receivedAt: '2026-03-02T11:00:00.000Z',
      },
    ],
  };
  const clientoBookingStore = {
    importBatch: async (payload) => {
      captured = payload;
      return { accepted: payload.bookings.length, rejected: 0 };
    },
  };

  const summary = await seedFromMailboxTruth({
    tenantId: 'tenant-a',
    ccoMailboxTruthStore,
    clientoBookingStore,
    maxCustomers: 50,
  });

  assert.equal(summary.tenantId, 'tenant-a');
  assert.equal(summary.customersScanned, 2);
  assert.equal(captured.tenantId, 'tenant-a');
  assert.equal(captured.source, 'mock');
  assert.equal(summary.bookingsGenerated, captured.bookings.length);
  assert.equal(summary.accepted, summary.bookingsGenerated);
  assert.ok(captured.bookings.every((b) => b.source === 'mock'));
});

test('seedFromMailboxTruth handles null listMessages result', async () => {
  let batchCount = 0;
  const clientoBookingStore = {
    importBatch: async (payload) => {
      batchCount += 1;
      assert.deepEqual(payload.bookings, []);
      return { accepted: 0, rejected: 0 };
    },
  };
  const summary = await seedFromMailboxTruth({
    tenantId: 't-null',
    ccoMailboxTruthStore: { listMessages: () => null },
    clientoBookingStore,
  });
  assert.equal(summary.customersScanned, 0);
  assert.equal(summary.bookingsGenerated, 0);
  assert.equal(batchCount, 1);
});

test('mockBookingsForCustomer faller tillbaka till lokalt e-postnamn utan customerName', () => {
  const a = mockBookingsForCustomer('stable-seed@patient.example', '');
  const b = mockBookingsForCustomer('stable-seed@patient.example', null);
  assert.deepEqual(bookingFieldsWithoutClock(a), bookingFieldsWithoutClock(b));
  for (const booking of a) {
    assert.equal(booking.customerName, 'stable-seed');
  }
  for (const booking of b) {
    assert.equal(booking.customerName, 'stable-seed');
  }
});
