#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createClientoBookingStore } = require('../src/ops/clientoBookingStore');
const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const { buildUnlinkedClientoBookingReview } = require('../src/ops/ccoKunderBookingEnrichment');

function requireFile(value, label) {
  const resolved = value ? path.resolve(value) : '';
  if (!resolved) throw new Error(`${label} <explicit path> krävs.`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label}-filen finns inte: ${resolved}`);
  }
  return resolved;
}

function parseArgs(argv) {
  const args = {
    storePath: '',
    patientsStorePath: '',
    patientsTenant: '',
    leftTenant: 'hair_tp',
    rightTenant: 'hair-tp-clinic',
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--store') args.storePath = argv[++index] || '';
    else if (value === '--patients-store') args.patientsStorePath = argv[++index] || '';
    else if (value === '--patients-tenant') args.patientsTenant = argv[++index] || '';
    else if (value === '--left-tenant') args.leftTenant = argv[++index] || '';
    else if (value === '--right-tenant') args.rightTenant = argv[++index] || '';
    else throw new Error(`Okänt argument: ${value}`);
  }
  args.storePath = requireFile(args.storePath, '--store');
  args.patientsStorePath = requireFile(args.patientsStorePath, '--patients-store');
  if (!args.patientsTenant) throw new Error('--patients-tenant <explicit tenantId> krävs.');
  if (!args.leftTenant || !args.rightTenant || args.leftTenant === args.rightTenant) {
    throw new Error('Två olika tenant-id krävs.');
  }
  return args;
}

function dedupeRowsByBookingId(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    const bookingId = row?.bookingId;
    if (!bookingId || seen.has(bookingId)) continue;
    seen.add(bookingId);
    deduped.push(row);
  }
  return deduped;
}

async function main() {
  const args = parseArgs(process.argv);
  const bookingStore = await createClientoBookingStore({ filePath: args.storePath });
  const patientStore = await createCcoPatientMasterStore({ filePath: args.patientsStorePath });

  const patientsPage = await patientStore.listPatients({
    tenantId: args.patientsTenant,
    limit: 20000,
    offset: 0,
  });
  const patients = patientsPage?.patients || [];

  const leftBookings = bookingStore.listAllBookings({
    tenantId: args.leftTenant,
    limit: 0,
    exactTenant: true,
  });
  const rightBookings = bookingStore.listAllBookings({
    tenantId: args.rightTenant,
    limit: 0,
    exactTenant: true,
  });

  // Facit-metoden (CLIENTO-UNLINKED-RECONCILE-P0-2026-07-18.md): dedupliserad
  // union av bookingId:n från buildUnlinkedClientoBookingReview över båda
  // tenants, exakt en fail-closed reviewrad per unikt bookingId.
  const combinedReport = buildUnlinkedClientoBookingReview({
    patients,
    clientoBookings: [...leftBookings, ...rightBookings],
  });
  const rows = dedupeRowsByBookingId(combinedReport.rows);
  const byReason = {};
  for (const row of rows) byReason[row.reasonCode] = (byReason[row.reasonCode] || 0) + 1;

  const report = {
    readOnly: true,
    zeroWrites: true,
    generatedAt: new Date().toISOString(),
    leftTenant: args.leftTenant,
    rightTenant: args.rightTenant,
    patientsTenant: args.patientsTenant,
    patientsPopulation: patients.length,
    total: rows.length,
    byReason,
    rows,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module || process.argv[1] === '-') {
  main().catch((error) => {
    process.stderr.write(`FEL: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, dedupeRowsByBookingId };
