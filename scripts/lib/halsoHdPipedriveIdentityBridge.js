'use strict';

const {
  collectPipedriveEmails,
  collectPipedrivePhones,
  normalizePersonnummer,
  parseCsv,
  phoneMatchKey,
} = require('../migration/lib/migrationUtils');
const { buildPipedrivePatientLookup } = require('../../src/ops/ccoPatientMasterStore');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildHalsoPipedriveIdentityBridge(csvText = '', patients = []) {
  const rows = parseCsv(csvText);
  const patientLookup = buildPipedrivePatientLookup(patients);
  const proposed = new Map();
  const ambiguousPnr = new Set();

  for (const row of rows) {
    const personnummer = normalizePersonnummer(row['Social Number']);
    if (!personnummer) continue;

    const candidates = new Map();
    for (const email of collectPipedriveEmails(row)) {
      for (const patient of asArray(patientLookup.byEmail.get(email))) {
        const patientId = patient?.id || patient?.patientId;
        if (patientId) candidates.set(patientId, patient);
      }
    }
    for (const phone of collectPipedrivePhones(row)) {
      const phoneKey = phoneMatchKey(phone);
      for (const patient of asArray(patientLookup.byPhone.get(phoneKey))) {
        const patientId = patient?.id || patient?.patientId;
        if (patientId) candidates.set(patientId, patient);
      }
    }

    if (candidates.size !== 1) {
      if (candidates.size > 1) ambiguousPnr.add(personnummer);
      continue;
    }
    const [patientId] = candidates.keys();
    const existing = proposed.get(personnummer);
    if (existing && existing !== patientId) {
      proposed.delete(personnummer);
      ambiguousPnr.add(personnummer);
      continue;
    }
    proposed.set(personnummer, patientId);
  }

  for (const pnr of ambiguousPnr) proposed.delete(pnr);

  const pnrsByPatient = new Map();
  for (const [personnummer, patientId] of proposed) {
    if (!pnrsByPatient.has(patientId)) pnrsByPatient.set(patientId, []);
    pnrsByPatient.get(patientId).push(personnummer);
  }

  const byPersonnummer = new Map();
  const byPatientId = new Map();
  let rejectedPatientConflicts = 0;
  for (const [personnummer, patientId] of proposed) {
    if (pnrsByPatient.get(patientId).length !== 1) {
      rejectedPatientConflicts += 1;
      continue;
    }
    byPersonnummer.set(personnummer, patientId);
    byPatientId.set(patientId, personnummer);
  }

  const enrichedPatients = patients.map((patient) => {
    const patientId = patient?.id || patient?.patientId;
    if (!patientId || normalizePersonnummer(patient.personnummer)) return patient;
    const bridgedPersonnummer = byPatientId.get(patientId);
    if (!bridgedPersonnummer) return patient;
    return {
      ...patient,
      personnummer: bridgedPersonnummer,
      halsoIdentityBridge: 'pipedrive_social_number_exact_contact',
    };
  });

  return {
    patients: enrichedPatients,
    byPersonnummer,
    stats: {
      rows: rows.length,
      linked: byPersonnummer.size,
      ambiguousPnr: ambiguousPnr.size,
      rejectedPatientConflicts,
    },
  };
}

module.exports = { buildHalsoPipedriveIdentityBridge };
