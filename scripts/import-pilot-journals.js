#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const { createCcoJournalStore } = require('../src/ops/ccoJournalStore');
const { normalizePersonnummer } = require('./migration/lib/migrationUtils');

function parseArgs(argv) {
  const args = {
    tenantId: process.env.CCO_DEFAULT_TENANT_ID || 'hair-tp-clinic',
    patientMasterPath: path.join(process.cwd(), 'data', 'cco-patient-master.json'),
    journalPath: path.join(process.cwd(), 'data', 'cco-journal.json'),
    indexPath: path.join(process.cwd(), 'data', 'migration-index.json'),
    pilotPath: path.join(process.cwd(), 'data', 'pilot-patients.json'),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--pilot') args.pilotPath = argv[++i];
    else if (token === '--patient-master') args.patientMasterPath = argv[++i];
    else if (token === '--journal') args.journalPath = argv[++i];
    else if (token === '--index') args.indexPath = argv[++i];
    else if (token === '--tenant') args.tenantId = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const pilot = JSON.parse(fs.readFileSync(args.pilotPath, 'utf8'));
  const ids = new Set(pilot.patientIds || []);
  if (!ids.size) throw new Error('pilot-patients.json saknar patientIds.');

  const indexRaw = JSON.parse(fs.readFileSync(args.indexPath, 'utf8'));
  const files = Array.isArray(indexRaw.files) ? indexRaw.files : [];
  const filesByPersonnummer = {};
  for (const file of files) {
    if (file.fileType !== 'journal_pdf') continue;
    const pnr = normalizePersonnummer(file.personnummer);
    if (!pnr) continue;
    if (!filesByPersonnummer[pnr]) filesByPersonnummer[pnr] = [];
    filesByPersonnummer[pnr].push(file);
  }

  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: args.patientMasterPath,
  });
  const journalStore = await createCcoJournalStore({ filePath: args.journalPath });

  const listed = await patientMasterStore.listPatients({
    tenantId: args.tenantId,
    limit: 20000,
    offset: 0,
  });
  const patients = listed.patients.filter((patient) => ids.has(patient.id));
  if (!patients.length) {
    throw new Error('Inga pilotpatienter hittades i patient-master.');
  }

  console.log(`Importerar historik för ${patients.length} pilotkunder…`);
  const result = await journalStore.importHistoricalForPatients({
    tenantId: args.tenantId,
    patients,
    filesByPersonnummer,
    actor: { userId: 'pilot-import', role: 'OWNER', displayName: 'Pilot import' },
    onProgress: ({ patientsTouched, created, skipped }) => {
      console.log(`… ${patientsTouched} patienter, ${created} nya, ${skipped} hoppade`);
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
