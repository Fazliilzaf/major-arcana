#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { resolveMigrationPaths } = require('./lib/migrationEnv');
const { normalizeEmail } = require('./lib/migrationUtils');

function parseArgs(argv) {
  const paths = resolveMigrationPaths();
  const args = {
    tenantId: paths.tenantId,
    patientMasterPath: paths.patientMasterPath,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--tenant') args.tenantId = argv[++i];
    else if (token === '--patient-master') args.patientMasterPath = argv[++i];
    else if (token === '--dry-run') args.dryRun = true;
  }
  return args;
}

function countFlags(patients) {
  return {
    needs_review: patients.filter((p) => p.matchStatus === 'needs_review').length,
    duplicateEmail: patients.filter((p) => p.duplicateEmail).length,
  };
}

function deriveMatchStatus(patient) {
  const hasCliento = Boolean(patient.cliento);
  const hasDrive = Boolean(patient.drive);
  const hasPipedrive = Boolean(patient.pipedrive);
  if (hasCliento && hasDrive) return 'matched';
  if (hasPipedrive) return 'matched';
  if (hasCliento) return 'cliento_only';
  if (hasDrive) return 'drive_only';
  const prior = patient.matchStatus;
  if (prior && prior !== 'needs_review') return prior;
  return 'unmatched';
}

function buildPrimaryEmailIndex(patients) {
  const byEmail = new Map();
  for (const patient of patients) {
    const email = normalizeEmail(patient.primaryEmail);
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, new Set());
    byEmail.get(email).add(patient.id);
  }
  return byEmail;
}

async function main() {
  const args = parseArgs(process.argv);
  const store = await createCcoPatientMasterStore({ filePath: args.patientMasterPath });
  const list = await store.listPatients({ tenantId: args.tenantId, limit: 20000 });
  const patients = list.patients;
  const before = countFlags(patients);
  console.log('BEFORE', JSON.stringify(before));

  const emailIndex = buildPrimaryEmailIndex(patients);
  const targets = patients.filter(
    (p) => p.matchStatus === 'needs_review' || p.duplicateEmail
  );
  let updated = 0;
  const changes = [];

  for (const patient of targets) {
    const email = normalizeEmail(patient.primaryEmail);
    const sharedCount = email ? (emailIndex.get(email)?.size || 0) : 0;
    if (sharedCount >= 2) continue;

    const nextStatus = deriveMatchStatus(patient);
    const patch = {
      ...patient,
      tenantId: args.tenantId,
      duplicateEmail: false,
      matchStatus: nextStatus,
    };
    changes.push({
      id: patient.id,
      email: patient.primaryEmail,
      from: { matchStatus: patient.matchStatus, duplicateEmail: patient.duplicateEmail },
      to: { matchStatus: nextStatus, duplicateEmail: false },
    });
    if (!args.dryRun) {
      await store.upsertPatient(patch);
    }
    updated += 1;
  }

  const afterList = args.dryRun
    ? {
        patients: patients.map((p) => {
          const ch = changes.find((c) => c.id === p.id);
          if (!ch) return p;
          return { ...p, duplicateEmail: false, matchStatus: ch.to.matchStatus };
        }),
      }
    : await store.listPatients({ tenantId: args.tenantId, limit: 20000 });
  const after = countFlags(afterList.patients);
  console.log('AFTER', JSON.stringify(after));
  console.log(`UPDATED ${updated} patients${args.dryRun ? ' (dry-run)' : ''}`);
  if (changes.length <= 20) {
    console.log(JSON.stringify(changes, null, 2));
  } else {
    console.log(JSON.stringify(changes.slice(0, 10), null, 2));
    console.log(`... and ${changes.length - 10} more`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
