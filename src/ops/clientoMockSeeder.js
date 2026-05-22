'use strict';

/**
 * clientoMockSeeder (CL2) — genererar dummy-bokningar för befintliga
 * mail-customers så Cliento-integration kan demonstreras utan riktig
 * Cliento-export.
 *
 * Tar listan kunder från ccoMailboxTruthStore (deras email används som key)
 * och genererar 0-3 bokningar per kund (mix av upcoming + completed +
 * cancelled). Skriver till clientoBookingStore.
 */

const { aggregateByCustomer } = require('./crossMailboxAggregator');

const SERVICES = [
  'Hårtransplantation konsultation',
  'PRP-behandling',
  'Hårtransplantation FUE',
  'Uppföljning post-op',
  'Hårdiagnostik',
  'Mesoterapi skalp',
];

const STAFF = ['Egzona', 'Fazli', 'Ali', 'Sara'];
const LOCATIONS = ['Stockholm', 'Göteborg', 'Malmö'];

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function pick(arr) {
  return arr[randomInt(arr.length)];
}

function pseudoRandomFromString(str) {
  // Deterministisk PRNG baserat på email — så samma kund alltid får samma bokningar
  let seed = 0;
  for (let i = 0; i < str.length; i += 1) {
    seed = (seed * 31 + str.charCodeAt(i)) & 0xffffffff;
  }
  return () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return Math.abs(seed) / 0x7fffffff;
  };
}

function mockBookingsForCustomer(customerEmail, customerName) {
  const prng = pseudoRandomFromString(customerEmail);
  const count = Math.floor(prng() * 4); // 0-3 bookings
  const bookings = [];
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;
  for (let i = 0; i < count; i += 1) {
    const offsetDays = Math.floor((prng() - 0.5) * 90); // -45 till +45 dagar
    const startMs = now + offsetDays * dayMs + Math.floor(prng() * 8) * 3600 * 1000;
    const isUpcoming = startMs > now;
    const durationMin = [30, 45, 60, 90, 120][Math.floor(prng() * 5)];
    const status = isUpcoming
      ? 'upcoming'
      : prng() < 0.85
        ? 'completed'
        : prng() < 0.5
          ? 'cancelled'
          : 'no_show';
    const serviceIdx = Math.floor(prng() * SERVICES.length);
    const staffIdx = Math.floor(prng() * STAFF.length);
    const locationIdx = Math.floor(prng() * LOCATIONS.length);
    bookings.push({
      bookingId: 'mock_' + customerEmail + '_' + i,
      customerEmail,
      customerName: customerName || customerEmail.split('@')[0],
      serviceLabel: SERVICES[serviceIdx],
      staffName: STAFF[staffIdx],
      locationName: LOCATIONS[locationIdx],
      startsAt: new Date(startMs).toISOString(),
      endsAt: new Date(startMs + durationMin * 60 * 1000).toISOString(),
      durationMinutes: durationMin,
      status,
      source: 'mock',
      notes: '',
    });
  }
  return bookings;
}

async function seedFromMailboxTruth({
  tenantId,
  ccoMailboxTruthStore,
  clientoBookingStore,
  maxCustomers = 200,
}) {
  if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
    throw new Error('seedFromMailboxTruth kräver ccoMailboxTruthStore.');
  }
  if (!clientoBookingStore || typeof clientoBookingStore.importBatch !== 'function') {
    throw new Error('seedFromMailboxTruth kräver clientoBookingStore.');
  }
  const messages = ccoMailboxTruthStore.listMessages({}) || [];
  const aggregation = aggregateByCustomer(messages);

  const customers = Array.from(aggregation.values()).slice(0, maxCustomers);
  const allBookings = [];
  for (const c of customers) {
    const bookings = mockBookingsForCustomer(c.customerEmail, c.customerName);
    for (const b of bookings) allBookings.push(b);
  }

  const result = await clientoBookingStore.importBatch({
    tenantId,
    bookings: allBookings,
    source: 'mock',
  });
  return {
    tenantId,
    customersScanned: customers.length,
    bookingsGenerated: allBookings.length,
    accepted: result.accepted,
    rejected: result.rejected,
  };
}

module.exports = {
  seedFromMailboxTruth,
  mockBookingsForCustomer,
};
