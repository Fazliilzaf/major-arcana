#!/usr/bin/env node
'use strict';

/**
 * import-cliento-bookings-to-store.js
 *
 * Importerar Cliento booking-export CSV till data/cco/cliento-bookings.json.
 * CSV får INTE ligga i GitHub-repo (compliance).
 *
 * Usage:
 *   node scripts/import-cliento-bookings-to-store.js --csv /path/outside/repo/bookings.csv
 *   node scripts/import-cliento-bookings-to-store.js --csv /path/bookings.csv --commit
 *   node scripts/import-cliento-bookings-to-store.js --csv /path/bookings.csv --commit --tenant hair_tp --limit 1000
 */

const path = require('node:path');
const { importClientoBookingsFromCsv } = require('../src/ops/clientoBookingCsvImport');

function parseArgs(argv) {
  const args = {
    csv: '',
    commit: false,
    tenant: 'hair_tp',
    limit: 0,
    storePath: path.join(process.cwd(), 'data', 'cco', 'cliento-bookings.json'),
    patientMasterPath: path.join(process.cwd(), 'data', 'cco-patient-master.json'),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--commit') args.commit = true;
    else if (a === '--csv') args.csv = argv[++i];
    else if (a === '--tenant') args.tenant = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]) || 0;
    else if (a === '--store') args.storePath = path.resolve(argv[++i]);
    else if (a === '--patient-master') args.patientMasterPath = path.resolve(argv[++i]);
  }
  if (!args.csv) {
    console.error('FEL: --csv <path> krävs (utanför repo).');
    process.exit(2);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log('=== Cliento CSV → cliento-bookings.json ===');
  console.log('CSV:     ', args.csv);
  console.log('Tenant:  ', args.tenant);
  console.log('Store:   ', args.storePath);
  console.log('Mode:    ', args.commit ? 'COMMIT' : 'DRY-RUN');
  if (args.limit > 0) console.log('Limit:   ', args.limit);

  const result = await importClientoBookingsFromCsv({
    csvPath: args.csv,
    tenantId: args.tenant,
    storePath: args.storePath,
    patientMasterPath: args.patientMasterPath,
    dryRun: !args.commit,
    limit: args.limit,
  });

  console.log('');
  console.log('Resultat:');
  Object.entries(result).forEach(([key, value]) => {
    if (typeof value === 'object') return;
    console.log(`  ${key}: ${value}`);
  });
  if (result.dryRun) {
    console.log('');
    console.log('DRY-RUN — kör med --commit för att skriva till store.');
  }
}

main().catch((err) => {
  console.error('FEL:', err.message || err);
  process.exit(1);
});
