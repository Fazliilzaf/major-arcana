const test = require('node:test');
const assert = require('node:assert/strict');

const { CcoCustomerBookingsCapability } = require('../../src/capabilities/ccoCustomerBookings');

test('CcoCustomerBookingsCapability warns when customerEmail missing', async () => {
  const cap = new CcoCustomerBookingsCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerEmail: '   ' },
  });
  assert.ok(out.warnings.some((w) => /customerEmail saknas/i.test(w)));
  assert.deepEqual(out.data.upcomingBookings, []);
});

test('CcoCustomerBookingsCapability returns empty payload when booking store missing', async () => {
  const cap = new CcoCustomerBookingsCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerEmail: 'pat@example.com' },
  });
  assert.ok(out.warnings.some((w) => /clientoBookingStore saknas/i.test(w)));
  assert.equal(out.data.vipScore, 0);
  assert.equal(out.data.customerEmail, 'pat@example.com');
});

test('CcoCustomerBookingsCapability aggregates upcoming completed and vip', async () => {
  const now = Date.now();
  const cap = new CcoCustomerBookingsCapability();
  const future = new Date(now + 3 * 24 * 3600 * 1000).toISOString();
  const pastDone = new Date(now - 5 * 24 * 3600 * 1000).toISOString();
  const pastCancel = new Date(now - 10 * 24 * 3600 * 1000).toISOString();

  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    requestId: 'r1',
    input: { customerEmail: 'Pat@Example.com' },
    clientoBookingStore: {
      getBookingsForCustomer: () => [
        { id: '1', status: 'completed', startsAt: pastDone },
        { id: '2', status: 'cancelled', startsAt: pastCancel },
        { id: '3', status: 'scheduled', startsAt: future },
      ],
    },
  });

  assert.equal(out.data.customerEmail, 'pat@example.com');
  assert.equal(out.data.upcomingBookings.length, 1);
  assert.equal(out.data.upcomingBookings[0].id, '3');
  assert.equal(out.data.recentVisits.length, 1);
  assert.equal(out.data.recentVisits[0].id, '1');
  assert.equal(out.data.cancelledBookings.length, 1);
  assert.equal(typeof out.data.lastVisitDays, 'number');
  assert.equal(typeof out.data.nextBookingInDays, 'number');
  assert.equal(out.data.vipScore, 5);
  assert.equal(out.metadata.requestId, 'r1');
});

test('CcoCustomerBookingsCapability sorts upcoming by startsAt ascending', async () => {
  const now = Date.now();
  const cap = new CcoCustomerBookingsCapability();
  const sooner = new Date(now + 1 * 24 * 3600 * 1000).toISOString();
  const later = new Date(now + 5 * 24 * 3600 * 1000).toISOString();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerEmail: 'a@b.co' },
    clientoBookingStore: {
      getBookingsForCustomer: () => [
        { id: 'later', status: 'scheduled', startsAt: later },
        { id: 'sooner', status: 'scheduled', startsAt: sooner },
      ],
    },
  });
  assert.equal(out.data.upcomingBookings[0].id, 'sooner');
  assert.equal(out.data.upcomingBookings[1].id, 'later');
});

test('CcoCustomerBookingsCapability skips upcoming with invalid startsAt', async () => {
  const future = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  const cap = new CcoCustomerBookingsCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerEmail: 'u@v.w' },
    clientoBookingStore: {
      getBookingsForCustomer: () => [
        { id: 'bad', status: 'scheduled', startsAt: 'not-a-date' },
        { id: 'good', status: 'scheduled', startsAt: future },
      ],
    },
  });
  assert.equal(out.data.upcomingBookings.length, 1);
  assert.equal(out.data.upcomingBookings[0].id, 'good');
});

test('CcoCustomerBookingsCapability drops cancelled older than six months', async () => {
  const now = Date.now();
  const oldCancel = new Date(now - 200 * 24 * 3600 * 1000).toISOString();
  const recentCancel = new Date(now - 10 * 24 * 3600 * 1000).toISOString();
  const cap = new CcoCustomerBookingsCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerEmail: 'c@example.com' },
    clientoBookingStore: {
      getBookingsForCustomer: () => [
        { id: 'old', status: 'cancelled', startsAt: oldCancel },
        { id: 'new', status: 'cancelled', startsAt: recentCancel },
      ],
    },
  });
  assert.equal(out.data.cancelledBookings.length, 1);
  assert.equal(out.data.cancelledBookings[0].id, 'new');
});

test('CcoCustomerBookingsCapability vipScore clamps at 100', async () => {
  const many = Array.from({ length: 15 }, (_, i) => ({
    id: String(i),
    status: 'completed',
    startsAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
  }));
  const cap = new CcoCustomerBookingsCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { customerEmail: 'vip@example.com' },
    clientoBookingStore: {
      getBookingsForCustomer: () => many,
    },
  });
  assert.equal(out.data.vipScore, 100);
});

test('CcoCustomerBookingsCapability metadata tenantId okand when context lacks tenant', async () => {
  const cap = new CcoCustomerBookingsCapability();
  const out = await cap.execute({
    channel: 'admin',
    input: { customerEmail: 'x@y.z' },
  });
  assert.equal(out.metadata.tenantId, 'okand');
});
