#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoMigrationIndexStore } = require('../../src/ops/ccoMigrationIndexStore');
const { discoverClientoCsv, parseCsv } = require('./lib/migrationUtils');

function parseArgs(argv) {
  const args = {
    migrationRoot: '',
    tenantId: process.env.CCO_DEFAULT_TENANT_ID || 'hair-tp-clinic',
    patientMasterPath: path.join(process.cwd(), 'data', 'cco-patient-master.json'),
    migrationIndexPath: path.join(process.cwd(), 'data', 'migration-index.json'),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--root') args.migrationRoot = argv[++i];
    else if (token === '--tenant') args.tenantId = argv[++i];
    else if (token === '--patient-master') args.patientMasterPath = argv[++i];
    else if (token === '--index') args.migrationIndexPath = argv[++i];
  }
  args.migrationRoot =
    args.migrationRoot ||
    process.env.ARCANA_MIGRATION_ROOT ||
    path.resolve(process.cwd(), '..');
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const csvPath = discoverClientoCsv(args.migrationRoot);
  if (!csvPath) {
    throw new Error(`Hittade ingen Cliento CSV i ${args.migrationRoot}`);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(csvContent);
  const emailCounts = rows.reduce((acc, row) => {
    const email = String(row['E-post'] || '').trim().toLowerCase();
    if (!email) return acc;
    acc[email] = (acc[email] || 0) + 1;
    return acc;
  }, {});
  const duplicateEmails = new Set(Object.keys(emailCounts).filter((email) => emailCounts[email] > 1));

  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: args.patientMasterPath,
  });
  const clientoImport = await patientMasterStore.importClientoRows({
    tenantId: args.tenantId,
    rows,
    duplicateEmails,
  });

  let driveImport = null;
  if (fs.existsSync(args.migrationIndexPath)) {
    const indexRaw = JSON.parse(fs.readFileSync(args.migrationIndexPath, 'utf8'));
    const profiles = Object.values(indexRaw.profilesByPersonnummer || {});
    driveImport = await patientMasterStore.mergeDriveProfiles({
      tenantId: args.tenantId,
      profiles,
    });
  } else {
    console.warn(`Ingen migration-index hittades: ${args.migrationIndexPath}`);
    console.warn('Kör migration:scan-folder eller migration:scan-drive-api först om Drive-data ska kopplas.');
  }

  const stats = await patientMasterStore.getTenantStats({ tenantId: args.tenantId });
  console.log('\n=== CLIENTO IMPORT ===');
  console.log(JSON.stringify(clientoImport, null, 2));
  if (driveImport) {
    console.log('\n=== DRIVE MATCH ===');
    console.log(JSON.stringify(driveImport, null, 2));
  }
  console.log('\n=== TENANT STATS ===');
  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nPatientmaster: ${args.patientMasterPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
