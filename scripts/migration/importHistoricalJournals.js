#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const { normalizePersonnummer } = require('./lib/migrationUtils');

function parseArgs(argv) {
  const args = {
    tenantId: process.env.CCO_DEFAULT_TENANT_ID || 'hair-tp-clinic',
    patientMasterPath: path.join(process.cwd(), 'data', 'cco-patient-master.json'),
    journalPath: path.join(process.cwd(), 'data', 'cco-journal.json'),
    indexPath: path.join(process.cwd(), 'data', 'migration-index.json'),
    includeImages: false,
    limitPatients: 0,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--tenant') args.tenantId = argv[++i];
    else if (token === '--patient-master') args.patientMasterPath = argv[++i];
    else if (token === '--journal') args.journalPath = argv[++i];
    else if (token === '--index') args.indexPath = argv[++i];
    else if (token === '--include-images') args.includeImages = true;
    else if (token === '--limit') args.limitPatients = Number(argv[++i]) || 0;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.indexPath)) {
    throw new Error(`Saknar migration-index: ${args.indexPath}. Kör migration:scan först.`);
  }

  const indexRaw = JSON.parse(fs.readFileSync(args.indexPath, 'utf8'));
  const files = Array.isArray(indexRaw.files) ? indexRaw.files : [];
  const filesByPersonnummer = {};
  for (const file of files) {
    const pnr = normalizePersonnummer(file.personnummer);
    if (!pnr) continue;
    if (!filesByPersonnummer[pnr]) filesByPersonnummer[pnr] = [];
    if (file.fileType === 'journal_pdf') {
      filesByPersonnummer[pnr].push(file);
    } else if (args.includeImages && file.fileType === 'image') {
      filesByPersonnummer[pnr].push(file);
    }
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
  let patients = listed.patients.filter((patient) => normalizePersonnummer(patient.personnummer));
  if (args.limitPatients > 0) {
    patients = patients.slice(0, args.limitPatients);
  }

  console.log(
    `Importerar historik för ${patients.length} patienter (${Object.keys(filesByPersonnummer).length} personnummer i index)…`
  );

  const startedAt = Date.now();
  const result = await journalStore.importHistoricalForPatients({
    tenantId: args.tenantId,
    patients,
    filesByPersonnummer,
    actor: { userId: 'migration-script', role: 'OWNER', displayName: 'Migration' },
    onProgress: ({ patientsTouched, created, skipped }) => {
      if (patientsTouched % 100 === 0) {
        console.log(
          `… ${patientsTouched} patienter, ${created} nya poster, ${skipped} hoppade över`
        );
      }
    },
  });

  console.log('\n=== HISTORISK JOURNALIMPORT ===');
  console.log(JSON.stringify(result, null, 2));
  console.log(`Tid: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(`Journal store: ${args.journalPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
