#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');

function parseArgs(argv) {
  const args = {
    tenantId: process.env.CCO_DEFAULT_TENANT_ID || 'hair-tp-clinic',
    patientMasterPath: path.join(process.cwd(), 'data', 'cco-patient-master.json'),
    outPath: path.join(process.cwd(), 'data', 'pilot-patients.json'),
    count: 5,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--count') args.count = Number(argv[++i]) || 5;
    else if (token === '--out') args.outPath = argv[++i];
    else if (token === '--patient-master') args.patientMasterPath = argv[++i];
    else if (token === '--tenant') args.tenantId = argv[++i];
  }
  return args;
}

function scorePatient(patient) {
  let score = 0;
  if (patient.matchStatus === 'matched') score += 100;
  if (patient.personnummer) score += 50;
  if (patient.primaryEmail) score += 10;
  if (patient.primaryPhone) score += 5;
  const journalPdfs = Number(patient.fileSummary?.journalPdfs || 0);
  const totalFiles = Number(patient.fileSummary?.totalFiles || 0);
  score += Math.min(journalPdfs, 30) * 3;
  score += Math.min(totalFiles, 50);
  if (patient.matchStatus === 'needs_review') score -= 40;
  if (patient.duplicateEmail) score -= 30;
  if (!patient.cliento) score -= 20;
  if (!patient.drive) score -= 10;
  return score;
}

async function main() {
  const args = parseArgs(process.argv);
  const store = await createCcoPatientMasterStore({ filePath: args.patientMasterPath });
  const listed = await store.listPatients({
    tenantId: args.tenantId,
    limit: 20000,
    offset: 0,
  });

  const candidates = listed.patients
    .filter((patient) => patient.personnummer)
    .filter((patient) => Number(patient.fileSummary?.journalPdfs || 0) > 0)
    .map((patient) => ({
      patientId: patient.id,
      displayName: patient.displayName,
      personnummer: patient.personnummer,
      primaryEmail: patient.primaryEmail || '',
      primaryPhone: patient.primaryPhone || '',
      matchStatus: patient.matchStatus,
      journalPdfs: Number(patient.fileSummary?.journalPdfs || 0),
      totalFiles: Number(patient.fileSummary?.totalFiles || 0),
      score: scorePatient(patient),
    }))
    .sort((a, b) => b.score - a.score);

  const selected = candidates.slice(0, args.count);
  if (selected.length < args.count) {
    console.warn(`Varning: hittade bara ${selected.length} kandidater (önskade ${args.count}).`);
  }

  const payload = {
    version: 1,
    tenantId: args.tenantId,
    selectedAt: new Date().toISOString(),
    count: selected.length,
    patientIds: selected.map((row) => row.patientId),
    patients: selected,
  };

  fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
  fs.writeFileSync(args.outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Sparade ${selected.length} pilotkunder → ${args.outPath}`);
  selected.forEach((row, index) => {
    console.log(
      `${index + 1}. ${row.displayName} (${row.personnummer}) — ${row.journalPdfs} journal-PDF, score ${row.score}`
    );
  });
  console.log('\nARCANA_PILOT_PATIENT_IDS=' + payload.patientIds.join(','));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
