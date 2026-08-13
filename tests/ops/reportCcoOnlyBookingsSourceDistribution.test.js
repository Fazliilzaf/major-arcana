'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createClientoBookingStore } = require('../../src/ops/clientoBookingStore');
const {
  parseArgs,
  extractCsvBookingIds,
} = require('../../scripts/report-cco-only-bookings-source-distribution');

function csvText(rows) {
  const header = 'Boknings-id,Kundnamn';
  const body = rows.map((id) => `${id},Test Testsson`).join('\n');
  return `${header}\n${body}\n`;
}

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-only-bookings-'));
  const filePath = path.join(dir, 'bookings.json');
  const store = await createClientoBookingStore({ filePath });
  return { store, dir };
}

test('extractCsvBookingIds returns unique Boknings-id set and counts missing ids', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-only-bookings-csv-'));
  const csvPath = path.join(dir, 'export.csv');
  await fs.writeFile(csvPath, csvText(['B1', 'B2', 'B1', '']), 'utf8');

  const { ids, missingBookingId, totalRows } = extractCsvBookingIds(csvPath);

  assert.equal(ids.size, 2);
  assert.ok(ids.has('B1'));
  assert.ok(ids.has('B2'));
  assert.equal(missingBookingId, 1);
  assert.equal(totalRows, 4);

  await fs.rm(dir, { recursive: true, force: true });
});

test('parseArgs requires two distinct explicit tenants and existing files', () => {
  assert.throws(() => parseArgs(['node', 'script']), /--store <explicit path> krävs/);
});

test('onlyInCco booking-id diff excludes overlap and groups the remainder by source and year', async () => {
  const { store, dir } = await makeStore();
  const csvDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-only-bookings-csv-'));
  const csvPath = path.join(csvDir, 'export.csv');
  // CSV export only knows about OVERLAP.
  await fs.writeFile(csvPath, csvText(['OVERLAP']), 'utf8');

  await store.importBatch({
    tenantId: 'hair_tp',
    bookings: [
      {
        bookingId: 'OVERLAP',
        source: 'cliento_csv',
        startsAt: '2025-01-01T10:00:00Z',
        clientoCustomerId: 'CUST-1',
      },
      {
        bookingId: 'CCO-ONLY-1',
        source: 'cco_booking_engine',
        startsAt: '2026-02-01T10:00:00Z',
        clientoCustomerId: 'CUST-2',
      },
    ],
  });
  await store.importBatch({
    tenantId: 'hair-tp-clinic',
    bookings: [
      {
        bookingId: 'CCO-ONLY-2',
        source: 'cco_booking_engine',
        startsAt: '2026-03-01T10:00:00Z',
        clientoCustomerId: 'CUST-3',
      },
      {
        bookingId: 'CCO-ONLY-3',
        source: 'cliento_web_mail',
        startsAt: '2024-06-01T10:00:00Z',
        clientoCustomerId: 'CUST-4',
      },
    ],
  });

  const csv = extractCsvBookingIds(csvPath);
  const leftBookings = store.listAllBookings({ tenantId: 'hair_tp', limit: 0, exactTenant: true });
  const rightBookings = store.listAllBookings({
    tenantId: 'hair-tp-clinic',
    limit: 0,
    exactTenant: true,
  });
  const byBookingId = new Map();
  for (const b of [...leftBookings, ...rightBookings]) byBookingId.set(b.bookingId, b);
  const onlyInCco = [...byBookingId.values()].filter((b) => !csv.ids.has(b.bookingId));

  assert.equal(onlyInCco.length, 3);
  assert.ok(!onlyInCco.some((b) => b.bookingId === 'OVERLAP'));

  const bySource = {};
  const byYear = {};
  for (const b of onlyInCco) {
    bySource[b.source] = (bySource[b.source] || 0) + 1;
    const year = b.startsAt.slice(0, 4);
    byYear[year] = (byYear[year] || 0) + 1;
  }
  assert.equal(bySource.cco_booking_engine, 2);
  assert.equal(bySource.cliento_web_mail, 1);
  assert.equal(byYear['2026'], 2);
  assert.equal(byYear['2024'], 1);

  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(csvDir, { recursive: true, force: true });
});
