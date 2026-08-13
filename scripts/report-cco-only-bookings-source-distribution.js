#!/usr/bin/env node
'use strict';

/**
 * CCO-STATUS.md punkt 4 (ursprung: ORD-100 Fas 0 del 3, 2026-08-08 —
 * "10 991 bokningar finns bara i CCO, inte i senaste exporten").
 *
 * Testar den obekräftade hypotesen: är dessa CCO-egna bokningar (annat
 * `source`-fält än `cliento_csv`), inte en Cliento-migreringslucka?
 * Metoden speglar exakt Fas 0 del 3: unika `Boknings-id` extraherade ur
 * senaste Cliento-CSV-exporten (samma parseCsv/kolumn som den betrodda
 * importern, src/ops/clientoBookingCsvImport.js) och ur CCO:s
 * clientoBookingStore (union av hair_tp/hair-tp-clinic, exactTenant),
 * jämförda som mängder. Läs-endast, ingen mutation av någon fil.
 *
 * Skriver ALDRIG ut bookingId eller annat bokningsinnehåll — bara antal
 * och en fördelning över `source`-fältet för delmängden som bara finns
 * i CCO, i linje med hur Fas 0 del 3 hanterade boknings-ID-mängderna
 * ("Ingen lista med ID:n har någonsin synts i en agent-konversation —
 * bara antal").
 *
 *   node scripts/report-cco-only-bookings-source-distribution.js \
 *     --store /var/data/cco/cliento-bookings.json \
 *     --cliento-export-csv /path/utanför/repo/senaste-export.csv
 */

const fs = require('node:fs');
const path = require('node:path');
const { parseCsv } = require('../src/ops/clientoBookingCsvImport');
const { createClientoBookingStore } = require('../src/ops/clientoBookingStore');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requireFile(value, label) {
  const resolved = value ? path.resolve(value) : '';
  if (!resolved) throw new Error(`${label} <explicit path> krävs.`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label}-filen finns inte: ${resolved}`);
  }
  return resolved;
}

function parseArgs(argv = process.argv) {
  const args = {
    storePath: '',
    csvPath: '',
    leftTenant: 'hair_tp',
    rightTenant: 'hair-tp-clinic',
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--store') args.storePath = argv[++index] || '';
    else if (value === '--cliento-export-csv') args.csvPath = argv[++index] || '';
    else if (value === '--left-tenant') args.leftTenant = argv[++index] || '';
    else if (value === '--right-tenant') args.rightTenant = argv[++index] || '';
    else throw new Error(`Okänt argument: ${value}`);
  }
  args.storePath = requireFile(args.storePath, '--store');
  args.csvPath = requireFile(args.csvPath, '--cliento-export-csv');
  if (!args.leftTenant || !args.rightTenant || args.leftTenant === args.rightTenant) {
    throw new Error('Två olika tenant-id krävs.');
  }
  return args;
}

function extractCsvBookingIds(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8');
  const { rows } = parseCsv(text);
  const ids = new Set();
  let missing = 0;
  for (const row of rows) {
    const id = normalizeText(row['Boknings-id']);
    if (id) ids.add(id);
    else missing += 1;
  }
  return { ids, missingBookingId: missing, totalRows: rows.length };
}

function bookingIdOf(booking) {
  return normalizeText(booking?.bookingId || booking?.id);
}

async function main() {
  const args = parseArgs();
  const csv = extractCsvBookingIds(args.csvPath);

  const store = await createClientoBookingStore({ filePath: args.storePath });
  const leftBookings = store.listAllBookings({
    tenantId: args.leftTenant,
    limit: 0,
    exactTenant: true,
  });
  const rightBookings = store.listAllBookings({
    tenantId: args.rightTenant,
    limit: 0,
    exactTenant: true,
  });

  // En post per unikt bookingId. Kanonisk tenant (right, default
  // hair-tp-clinic) vinner vid dubblett — matchar tenant-dedupens
  // canonicalTenant-konvention.
  const byBookingId = new Map();
  for (const booking of leftBookings) {
    const id = bookingIdOf(booking);
    if (id) byBookingId.set(id, booking);
  }
  for (const booking of rightBookings) {
    const id = bookingIdOf(booking);
    if (id) byBookingId.set(id, booking);
  }

  const onlyInCco = [];
  for (const [id, booking] of byBookingId) {
    if (!csv.ids.has(id)) onlyInCco.push(booking);
  }

  const bySource = {};
  const byYear = {};
  for (const booking of onlyInCco) {
    const source = normalizeText(booking.source) || '(tomt)';
    bySource[source] = (bySource[source] || 0) + 1;
    const year = normalizeText(booking.startsAt).slice(0, 4);
    const key = /^\d{4}$/.test(year) ? year : '(okänt datum)';
    byYear[key] = (byYear[key] || 0) + 1;
  }

  const report = {
    readOnly: true,
    zeroWrites: true,
    generatedAt: new Date().toISOString(),
    csvExport: {
      path: path.basename(args.csvPath),
      totalRows: csv.totalRows,
      uniqueBookingIds: csv.ids.size,
      missingBookingId: csv.missingBookingId,
    },
    ccoStore: {
      leftTenant: args.leftTenant,
      rightTenant: args.rightTenant,
      uniqueBookingIds: byBookingId.size,
    },
    onlyInCco: {
      count: onlyInCco.length,
      bySource,
      byYear,
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module || process.argv[1] === '-') {
  main().catch((error) => {
    process.stderr.write(`FEL: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, extractCsvBookingIds };
