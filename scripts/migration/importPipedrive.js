#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { resolveMigrationPaths } = require('./lib/migrationEnv');
const { discoverPipedriveCsvPair, parseCsv } = require('./lib/migrationUtils');

function parseArgs(argv) {
  const paths = resolveMigrationPaths();
  const args = {
    cwd: process.cwd(),
    tenantId: paths.tenantId,
    patientMasterPath: paths.patientMasterPath,
    peoplePath: '',
    dealsPath: '',
    migrationRoot: paths.migrationRoot,
    dryRun: false,
    nameFallback: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--tenant') args.tenantId = argv[++i];
    else if (token === '--patient-master') args.patientMasterPath = argv[++i];
    else if (token === '--people') args.peoplePath = argv[++i];
    else if (token === '--deals') args.dealsPath = argv[++i];
    else if (token === '--root') args.migrationRoot = argv[++i];
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--name-fallback') args.nameFallback = true;
  }
  return args;
}

function resolveCsvPaths(args) {
  if (args.peoplePath && args.dealsPath) {
    return { peoplePath: path.resolve(args.peoplePath), dealsPath: path.resolve(args.dealsPath) };
  }
  const discovered = discoverPipedriveCsvPair(args.cwd);
  if (discovered) return discovered;
  const discoveredRoot = discoverPipedriveCsvPair(args.migrationRoot);
  if (discoveredRoot) return discoveredRoot;
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  const csvPaths = resolveCsvPaths(args);
  if (!csvPaths) {
    throw new Error(
      'Hittade inga Pipedrive-CSV. Ange --people och --deals, eller lägg filer i migration/pipedrive/.'
    );
  }

  if (!fs.existsSync(args.patientMasterPath)) {
    throw new Error(
      `Patientmaster saknas: ${args.patientMasterPath}. Kör migration:import (Cliento) först.`
    );
  }

  const peopleRows = parseCsv(fs.readFileSync(csvPaths.peoplePath, 'utf8'));
  const dealRows = parseCsv(fs.readFileSync(csvPaths.dealsPath, 'utf8'));

  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: args.patientMasterPath,
  });

  const pipedriveImport = await patientMasterStore.mergePipedriveProfiles({
    tenantId: args.tenantId,
    peopleRows,
    dealRows,
    dryRun: args.dryRun,
    enableNameFallback: args.nameFallback,
  });

  const stats = await patientMasterStore.getTenantStats({ tenantId: args.tenantId });
  console.log(
    `\n=== PIPEDRIVE ENRICH ${args.dryRun ? '(DRY-RUN — inget skrivet)' : ''}${
      args.nameFallback ? ' [namn-fallback PÅ]' : ''
    } ===`
  );
  console.log(JSON.stringify(pipedriveImport, null, 2));
  console.log('\n=== TENANT STATS ===');
  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nPersoner: ${csvPaths.peoplePath}`);
  console.log(`Affärer: ${csvPaths.dealsPath}`);
  console.log(`Patientmaster: ${args.patientMasterPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
