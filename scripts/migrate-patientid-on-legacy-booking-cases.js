#!/usr/bin/env node
'use strict';

/**
 * Migrering: satt kanoniskt patientId pa befintliga legacy-bokningsarenden
 * (cco-bookings.json).
 *
 * - Default ar torrkorning (--dry-run). Inga skrivningar gors.
 * - --commit kravs for att skriva. En backup tas automatiskt fore skrivning.
 * - Anvander samma matchningslogik som ccoKunderBookingEnrichment.js.
 * - Tvetydig identitet ger inget patientId; arendet markeras med
 *   patientIdResolutionStatus for granskning.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { config } = require('../src/config');
const { createCcoBookingStore } = require('../src/ops/ccoBookingStore');
const {
  buildPatientLookupMaps,
  resolvePatientIdFromClientoBooking,
} = require('../src/ops/ccoKunderBookingEnrichment');

async function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, filePath);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nowIso() {
  return new Date().toISOString();
}

function flattenTenantPatients(patientMaster) {
  if (!patientMaster) return [];
  if (Array.isArray(patientMaster.patients)) return patientMaster.patients;
  return Object.values(patientMaster.tenants || {}).flatMap((tenant) =>
    Array.isArray(tenant.patients) ? tenant.patients : []
  );
}

function classifyUnlink(bookingCase, lookup) {
  const email = normalizeText(bookingCase.customerEmail).toLowerCase();
  if (!email) return 'missing_identity';
  if (lookup.ambiguous.emails.has(email)) return 'ambiguous_identity';
  return 'no_canonical_match';
}

async function readJsonSafe(filePath, { required = false } = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      if (required) {
        console.error(`Fil finns inte: ${filePath}`);
        process.exit(1);
      }
      return null;
    }
    throw err;
  }
}

async function takeBackup(sourcePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${sourcePath}.pre-legacy-patientid-migration-${timestamp}.json`;
  await fs.copyFile(sourcePath, backupPath);
  return backupPath;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const skipBackup = args.includes('--skip-backup');

  const patientMasterPath = config.ccoPatientMasterStorePath;
  const bookingCasePath = config.ccoBookingStorePath;

  console.log('=== Migrering: patientId pa legacy-bokningsarenden ===\n');
  console.log(
    `Lage:             ${commit ? 'SKARP (kommer skriva)' : 'TORRKORNING (ingen skrivning)'}`
  );
  console.log(`patientMaster:    ${patientMasterPath}`);
  console.log(`bookingCases:     ${bookingCasePath}\n`);

  if (commit) {
    console.log('⚠️  SKARP LAGE — detta kommer att mutera cco-bookings.json\n');
  }

  const patientMaster = await readJsonSafe(patientMasterPath, { required: true });
  const patients = flattenTenantPatients(patientMaster);
  console.log(`Patienter laddade: ${patients.length}`);

  const store = await createCcoBookingStore({ filePath: bookingCasePath });
  const state = store._state;
  const totalCases = Array.isArray(state.cases) ? state.cases.length : 0;
  console.log(`Arenden laddade:  ${totalCases}\n`);

  const lookup = buildPatientLookupMaps(patients);

  let updated = 0;
  let alreadyLinked = 0;
  let unresolved = 0;
  const byReason = {};

  const resolutionTimestamp = nowIso();

  for (const bookingCase of state.cases || []) {
    const existingPatientId = normalizeText(bookingCase.patientId);

    if (existingPatientId) {
      alreadyLinked += 1;
      continue;
    }

    const resolved = resolvePatientIdFromClientoBooking(
      {
        customerEmail: bookingCase.customerEmail,
        clientoCustomerId: bookingCase.clientoCustomerId,
        customerPhone: bookingCase.customerPhone,
      },
      lookup
    );

    if (resolved) {
      bookingCase.patientId = resolved;
      bookingCase.patientIdResolutionAt = resolutionTimestamp;
      bookingCase.patientIdResolutionStatus = 'linked';
      delete bookingCase.patientIdResolutionReason;
      updated += 1;
    } else {
      const reason = classifyUnlink(bookingCase, lookup);
      byReason[reason] = (byReason[reason] || 0) + 1;
      bookingCase.patientIdResolutionStatus = reason;
      bookingCase.patientIdResolutionAt = resolutionTimestamp;
      unresolved += 1;
    }
  }

  console.log('--- Resultat ---');
  console.log(`Redan lankade:     ${alreadyLinked}`);
  console.log(`Nytt patientId:    ${updated}`);
  console.log(`Ej lankade:        ${unresolved}`);
  for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${reason}: ${count}`);
  }

  if (!commit) {
    console.log('\n=== TORRKORNING — INGA SKRIVNINGAR GJORDES ===');
    console.log('Kor med --commit for att verkstalla. Backup tas automatiskt.');
    return;
  }

  let backupPath = null;
  if (!skipBackup) {
    backupPath = await takeBackup(bookingCasePath);
    console.log(`\nBackup skapad: ${backupPath}`);
  }

  state.updatedAt = resolutionTimestamp;
  await writeJsonAtomic(bookingCasePath, state);

  const verifieringsFel = [];
  const efter = await readJsonSafe(bookingCasePath);

  if (!efter) {
    verifieringsFel.push('filen gick inte att lasa tillbaka');
  } else {
    let arendenEfter = Array.isArray(efter.cases) ? efter.cases.length : 0;
    let medPatientId = 0;
    for (const c of efter.cases || []) {
      if (normalizeText(c.patientId)) medPatientId += 1;
    }

    const forvantatMedPatientId = alreadyLinked + updated;
    if (arendenEfter !== totalCases) {
      verifieringsFel.push(`antal arenden ${arendenEfter}, forvantat ${totalCases}`);
    }
    if (medPatientId !== forvantatMedPatientId) {
      verifieringsFel.push(`med patientId ${medPatientId}, forvantat ${forvantatMedPatientId}`);
    }

    console.log('\n--- Efterkontroll ---');
    console.log(`Arenden i filen:   ${arendenEfter} (forvantat ${totalCases})`);
    console.log(`Med patientId:     ${medPatientId} (forvantat ${forvantatMedPatientId})`);
  }

  if (verifieringsFel.length > 0) {
    console.error('\n=== EFTERKONTROLLEN MISSLYCKADES ===');
    for (const fel of verifieringsFel) console.error(`  - ${fel}`);
    console.error(
      `\nAterstall med:\n  cp ${backupPath || '<backup saknas>'} ${bookingCasePath}`
    );
    process.exit(1);
  }

  console.log('\n=== SKARP KORNING KLAR ===');
  console.log(`Backup: ${backupPath || 'SKIPPAD'}`);
  console.log(`Fil:    ${bookingCasePath}`);
}

main().catch((err) => {
  console.error('\n[ERROR]', err);
  process.exit(1);
});
