#!/usr/bin/env node
'use strict';

/**
 * Torrkörning: mät hur många befintliga bokningar som kan få ett kanoniskt
 * patientId, utan att skriva något.
 *
 * Använder samma uppslagslogik som src/ops/ccoKunderBookingEnrichment.js.
 * Läser patient-master och cliento-bookings från <stateRoot>.
 * Skriver ingenting.
 */

const fs = require('node:fs');
const path = require('node:path');
const { config } = require('../src/config');
const {
  buildPatientLookupMaps,
  resolvePatientIdFromClientoBooking,
} = require('../src/ops/ccoKunderBookingEnrichment');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Kunde inte läsa ${filePath}: ${err.message}`);
    return null;
  }
}

function analyzeClientoBookings({ patients, clientoBookings }) {
  const lookup = buildPatientLookupMaps(patients);

  let linked = 0;
  let unlinked = 0;
  const byReason = {};
  const byIdentity = {
    explicit: 0,
    email: 0,
    clientoId: 0,
    phone: 0,
    none: 0,
  };

  for (const booking of clientoBookings) {
    const resolved = resolvePatientIdFromClientoBooking(booking, lookup);

    if (resolved) {
      linked += 1;
      if (normalizeText(booking.patientId)) byIdentity.explicit += 1;
      else if (lookup.emailToPatient.has(normalizeText(booking.customerEmail).toLowerCase())) byIdentity.email += 1;
      else if (
        lookup.clientoIdToPatient.has(normalizeText(booking.clientoCustomerId || booking.customerId))
      )
        byIdentity.clientoId += 1;
      else if (lookup.phoneToPatient.has(booking.customerPhone || booking.phone)) byIdentity.phone += 1;
      continue;
    }

    unlinked += 1;
    let reason = 'no_match';
    const hasEmail = Boolean(normalizeText(booking.customerEmail));
    const hasClientoId = Boolean(normalizeText(booking.clientoCustomerId || booking.customerId));
    const hasPhone = Boolean(normalizeText(booking.customerPhone || booking.phone));

    if (!hasEmail && !hasClientoId && !hasPhone) {
      reason = 'missing_identity';
    } else {
      const email = normalizeText(booking.customerEmail).toLowerCase();
      const clientoId = normalizeText(booking.clientoCustomerId || booking.customerId);
      const phoneKey = (booking.customerPhone || booking.phone || '').replace(/\D/g, '').slice(-10);

      const emailAmbiguous = email && lookup.ambiguous.emails.has(email);
      const clientoAmbiguous = clientoId && lookup.ambiguous.clientoIds.has(clientoId);
      const phoneAmbiguous = phoneKey && lookup.ambiguous.phones.has(phoneKey);

      if (emailAmbiguous || clientoAmbiguous || phoneAmbiguous) {
        reason = 'ambiguous_identity';
      } else {
        reason = 'no_canonical_match';
      }
    }

    byReason[reason] = (byReason[reason] || 0) + 1;
  }

  return { linked, unlinked, byReason, byIdentity };
}

function analyzeEngineBookings({ patients, engineBookings }) {
  const lookup = buildPatientLookupMaps(patients);
  let withCanonical = 0;
  let withoutCanonical = 0;
  let resolvable = 0;

  for (const booking of engineBookings) {
    if (normalizeText(booking.canonicalPatientId)) {
      withCanonical += 1;
      continue;
    }
    withoutCanonical += 1;
    // Kolla om den hade kunnat matchas via samma logik som cliento
    const resolved = resolvePatientIdFromClientoBooking(
      {
        patientId: booking.patientId,
        customerEmail: booking.customerEmail,
        clientoCustomerId: booking.clientoCustomerId,
        customerPhone: booking.customerPhone,
      },
      lookup
    );
    if (resolved) resolvable += 1;
  }

  return { withCanonical, withoutCanonical, resolvable };
}

function main() {
  const patientMasterPath = config.ccoPatientMasterStorePath;
  const clientoBookingPath = config.clientoBookingStorePath;
  const engineBookingPath = path.join(config.stateRoot, 'cco-booking-engine.json');

  console.log('=== Torrkörning: patientId på bokningar ===\n');
  console.log(`stateRoot:        ${config.stateRoot}`);
  console.log(`patientMaster:    ${patientMasterPath}`);
  console.log(`clientoBookings:  ${clientoBookingPath}`);
  console.log(`engineBookings:   ${engineBookingPath}\n`);

  const patientMaster = readJsonSafe(patientMasterPath);
  const clientoStore = readJsonSafe(clientoBookingPath);
  const engineStore = readJsonSafe(engineBookingPath);

  const patients = patientMaster && Array.isArray(patientMaster.patients) ? patientMaster.patients : [];
  const clientoBookings = Array.isArray(clientoStore?.bookings)
    ? clientoStore.bookings
    : Array.isArray(clientoStore)
      ? clientoStore
      : [];
  const engineBookings = Array.isArray(engineStore?.bookings)
    ? engineStore.bookings
    : Array.isArray(engineStore)
      ? engineStore
      : [];

  console.log(`Patienter totalt:      ${patients.length}`);
  console.log(`Cliento-bokningar:     ${clientoBookings.length}`);
  console.log(`Engine-bokningar:      ${engineBookings.length}\n`);

  const clientoStats = analyzeClientoBookings({ patients, clientoBookings });
  console.log('--- Cliento-bokningar ---');
  console.log(`Kopplade:              ${clientoStats.linked}`);
  console.log(`  - explicit:          ${clientoStats.byIdentity.explicit}`);
  console.log(`  - via e-post:        ${clientoStats.byIdentity.email}`);
  console.log(`  - via clientoId:     ${clientoStats.byIdentity.clientoId}`);
  console.log(`  - via telefon:       ${clientoStats.byIdentity.phone}`);
  console.log(`Okopplade:             ${clientoStats.unlinked}`);
  for (const [reason, count] of Object.entries(clientoStats.byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${reason}: ${count}`);
  }
  console.log(
    `Täckning:              ${clientoBookings.length ? ((clientoStats.linked / clientoBookings.length) * 100).toFixed(1) : 0}%\n`
  );

  const engineStats = analyzeEngineBookings({ patients, engineBookings });
  console.log('--- Engine-bokningar ---');
  console.log(`Med canonicalPatientId: ${engineStats.withCanonical}`);
  console.log(`Utan canonicalPatientId: ${engineStats.withoutCanonical}`);
  console.log(`  - därav uppslagsbara: ${engineStats.resolvable}`);
  console.log(
    `Täckning efter migrering: ${engineBookings.length ? (((engineStats.withCanonical + engineStats.resolvable) / engineBookings.length) * 100).toFixed(1) : 0}%\n`
  );

  console.log('=== INGA SKRIVNINGAR GJORDES ===');
}

main();
