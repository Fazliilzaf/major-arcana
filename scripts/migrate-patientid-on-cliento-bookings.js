#!/usr/bin/env node
'use strict';

/**
 * Migrering: sätt kanoniskt patientId på befintliga Cliento-bokningar.
 *
 * - Default är torrkörning (--dry-run). Inga skrivningar görs.
 * - --commit krävs för att skriva. En backup tas automatiskt före skrivning.
 * - Återanvänder samma matchningslogik som ccoKunderBookingEnrichment.js.
 * - Matchad bokning får fältet `patientId` satt.
 * - Ej matchad bokning får `patientIdResolutionStatus` och `patientIdResolutionAt`
 *   så att granskning kan ske i efterhand.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { config } = require('../src/config');
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

function identitySourceForLinkedBooking(booking, lookup) {
  const email = normalizeText(booking.customerEmail).toLowerCase();
  if (email && lookup.emailToPatient.has(email)) return 'email';

  const clientoId = normalizeText(booking.clientoCustomerId);
  if (clientoId && lookup.clientoIdToPatient.has(clientoId)) return 'clientoId';

  const phoneKey = normalizeText(booking.customerPhone || booking.phone)
    .replace(/\D/g, '')
    .slice(-10);
  if (phoneKey && lookup.phoneToPatient.has(phoneKey)) return 'phone';

  return 'explicit';
}

function classifyUnlink(booking, lookup) {
  const hasEmail = Boolean(normalizeText(booking.customerEmail));
  const hasClientoId = Boolean(normalizeText(booking.clientoCustomerId));
  const hasPhone = Boolean(normalizeText(booking.customerPhone));

  if (!hasEmail && !hasClientoId && !hasPhone) {
    return 'missing_identity';
  }

  const email = normalizeText(booking.customerEmail).toLowerCase();
  const clientoId = normalizeText(booking.clientoCustomerId);
  const phoneKey = normalizeText(booking.customerPhone || booking.phone)
    .replace(/\D/g, '')
    .slice(-10);

  const emailAmbiguous = email && lookup.ambiguous.emails.has(email);
  const clientoAmbiguous = clientoId && lookup.ambiguous.clientoIds.has(clientoId);
  const phoneAmbiguous = phoneKey && lookup.ambiguous.phones.has(phoneKey);

  if (emailAmbiguous || clientoAmbiguous || phoneAmbiguous) {
    return 'ambiguous_identity';
  }
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
  const backupPath = `${sourcePath}.pre-patientid-migration-${timestamp}.json`;
  await fs.copyFile(sourcePath, backupPath);
  return backupPath;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const skipBackup = args.includes('--skip-backup');

  const patientMasterPath = config.ccoPatientMasterStorePath;
  const clientoBookingPath = config.clientoBookingStorePath;

  console.log('=== Migrering: patientId på Cliento-bokningar ===\n');
  console.log(
    `Läge:             ${commit ? 'SKARP (kommer skriva)' : 'TORRKÖRNING (ingen skrivning)'}`
  );
  console.log(`patientMaster:    ${patientMasterPath}`);
  console.log(`clientoBookings:  ${clientoBookingPath}\n`);

  if (commit) {
    console.log('⚠️  SKARP LÄGE — detta kommer att mutera cco/cliento-bookings.json\n');
  }

  const patientMaster = await readJsonSafe(patientMasterPath, { required: true });
  const state = await readJsonSafe(clientoBookingPath, { required: true });

  const patients = flattenTenantPatients(patientMaster);
  console.log(`Patienter laddade: ${patients.length}`);

  let totalBookings = 0;
  for (const list of Object.values(state.bookings || {})) {
    totalBookings += Array.isArray(list) ? list.length : 0;
  }
  console.log(`Bokningar laddade: ${totalBookings}\n`);

  const lookup = buildPatientLookupMaps(patients);

  let updated = 0;
  let alreadyLinked = 0;
  let unresolved = 0;
  const byReason = {};
  const byIdentity = { explicit: 0, email: 0, clientoId: 0, phone: 0 };
  let bucketsTouched = 0;

  // Migreringens egen tidsstämpel skrivs till patientIdResolutionAt, aldrig till
  // booking.updatedAt.
  //
  // updatedAt betyder "när ändrades bokningen" och är bokningens egen historik.
  // Skulle migreringen skriva den skulle 53 000 bokningar få identisk stämpel och
  // sin verkliga ändringstid utraderad — oåterkalleligt, sånär som på backupen.
  // Det finns minst en läsare: dedupeBookings i clientoBookingStore.js sorterar
  // dubbletter på updatedAt för att välja vilken post som blir sammanslagnings-
  // bas. Med identiska värden blir den ordningen godtycklig.
  const resolutionTimestamp = nowIso();

  for (const [bucketKey, list] of Object.entries(state.bookings || {})) {
    if (!Array.isArray(list)) continue;
    let bucketModified = false;

    for (const booking of list) {
      const existingPatientId = normalizeText(booking.patientId);

      if (existingPatientId) {
        alreadyLinked += 1;
        continue;
      }

      const resolved = resolvePatientIdFromClientoBooking(booking, lookup);

      if (resolved) {
        booking.patientId = resolved;
        booking.patientIdResolutionAt = resolutionTimestamp;
        booking.patientIdResolutionStatus = 'linked';
        delete booking.patientIdResolutionReason;
        // booking.updatedAt lämnas medvetet orörd. Se kommentaren vid
        // resolutionTimestamp nedan.
        updated += 1;
        bucketModified = true;

        const source = identitySourceForLinkedBooking(booking, lookup);
        byIdentity[source] += 1;
      } else {
        const reason = classifyUnlink(booking, lookup);
        byReason[reason] = (byReason[reason] || 0) + 1;
        booking.patientIdResolutionStatus = reason;
        booking.patientIdResolutionAt = resolutionTimestamp;
        unresolved += 1;
        bucketModified = true;
      }
    }

    if (bucketModified) bucketsTouched += 1;
  }

  console.log('--- Resultat ---');
  console.log(`Redan länkade:     ${alreadyLinked}`);
  console.log(`Nytt patientId:    ${updated}`);
  console.log(`  - via e-post:    ${byIdentity.email}`);
  console.log(`  - via clientoId: ${byIdentity.clientoId}`);
  console.log(`  - via telefon:   ${byIdentity.phone}`);
  console.log(`Ej länkade:        ${unresolved}`);
  for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${reason}: ${count}`);
  }
  console.log(`Hinkar berörda:    ${bucketsTouched}`);

  if (!commit) {
    console.log('\n=== TORRKÖRNING — INGA SKRIVNINGAR GJORDES ===');
    console.log('Kör med --commit för att verkställa. Backup tas automatiskt.');
    return;
  }

  // Skarp körning
  let backupPath = null;
  if (!skipBackup) {
    backupPath = await takeBackup(clientoBookingPath);
    console.log(`\nBackup skapad: ${backupPath}`);
  }

  state.updatedAt = resolutionTimestamp;
  await writeJsonAtomic(clientoBookingPath, state);

  // Läs tillbaka och räkna. En skrivning som tystnar halvvägs lämnar en fil som
  // ser rimlig ut men saknar poster — och just den här filen har vi ingen
  // rimlighetskontroll på någon annanstans. Backupen är bara till nytta om vi
  // upptäcker att vi behöver den.
  const verifieringsFel = [];
  const efter = await readJsonSafe(clientoBookingPath);

  if (!efter) {
    verifieringsFel.push('filen gick inte att läsa tillbaka');
  } else {
    let bokningarEfter = 0;
    let medPatientId = 0;
    for (const list of Object.values(efter.bookings || {})) {
      if (!Array.isArray(list)) continue;
      bokningarEfter += list.length;
      for (const b of list) if (normalizeText(b.patientId)) medPatientId += 1;
    }

    const forvantatMedPatientId = alreadyLinked + updated;
    if (bokningarEfter !== totalBookings) {
      verifieringsFel.push(`antal bokningar ${bokningarEfter}, förväntat ${totalBookings}`);
    }
    if (medPatientId !== forvantatMedPatientId) {
      verifieringsFel.push(`med patientId ${medPatientId}, förväntat ${forvantatMedPatientId}`);
    }

    console.log('\n--- Efterkontroll ---');
    console.log(`Bokningar i filen: ${bokningarEfter} (förväntat ${totalBookings})`);
    console.log(`Med patientId:     ${medPatientId} (förväntat ${forvantatMedPatientId})`);
  }

  if (verifieringsFel.length > 0) {
    console.error('\n=== EFTERKONTROLLEN MISSLYCKADES ===');
    for (const fel of verifieringsFel) console.error(`  - ${fel}`);
    console.error(
      `\nÅterställ med:\n  cp ${backupPath || '<backup saknas>'} ${clientoBookingPath}`
    );
    process.exit(1);
  }

  console.log('\n=== SKARP KÖRNING KLAR ===');
  console.log(`Backup: ${backupPath || 'SKIPPAD'}`);
  console.log(`Fil:    ${clientoBookingPath}`);
}

main().catch((err) => {
  console.error('\n[ERROR]', err);
  process.exit(1);
});
