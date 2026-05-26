'use strict';

const {
  normalizeEmail,
  normalizeKey,
  normalizePersonnummer,
} = require('../../scripts/migration/lib/migrationUtils');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function slotIsoDate(slot) {
  if (!slot || typeof slot !== 'object') return '';
  const raw = slot.date || slot.isoDate || slot.startDate || '';
  return String(raw).slice(0, 10);
}

function rebuildPatientMasterIndexes(bucket = {}) {
  const patients = asArray(bucket.patients);
  const patientById = new Map();
  const patientByEmail = new Map();
  const patientByPnr = new Map();

  patients.forEach((patient, index) => {
    if (!patient?.id) return;
    patientById.set(patient.id, index);
    const pnr = normalizePersonnummer(patient.personnummer);
    if (pnr) patientByPnr.set(pnr, index);
    const emails = [
      normalizeEmail(patient.primaryEmail),
      ...asArray(patient.emails).map(normalizeEmail),
    ].filter(Boolean);
    emails.forEach((email) => {
      if (!patientByEmail.has(email)) patientByEmail.set(email, index);
    });
  });

  bucket._indexes = {
    version: 1,
    patientById: Object.fromEntries(patientById),
    patientByEmail: Object.fromEntries(patientByEmail),
    patientByPnr: Object.fromEntries(patientByPnr),
    builtAt: new Date().toISOString(),
  };
  return bucket._indexes;
}

function resolvePatientIndex(bucket, { patientId, email, personnummer } = {}) {
  const indexes = bucket?._indexes || {};
  const byId = indexes.patientById || {};
  const byEmail = indexes.patientByEmail || {};
  const byPnr = indexes.patientByPnr || {};
  const patients = asArray(bucket?.patients);

  const id = String(patientId || '').trim();
  if (id && byId[id] !== undefined) return Number(byId[id]);

  const pnr = normalizePersonnummer(personnummer);
  if (pnr && byPnr[pnr] !== undefined) return Number(byPnr[pnr]);

  const mail = normalizeEmail(email);
  if (mail && byEmail[mail] !== undefined) return Number(byEmail[mail]);

  return -1;
}

function lookupPatientsByQuery(bucket, query = '') {
  const q = normalizeKey(query);
  if (!q) return null;

  const pnr = normalizePersonnummer(query);
  if (pnr) {
    const idx = resolvePatientIndex(bucket, { personnummer: pnr });
    if (idx >= 0) return [idx];
  }

  const email = normalizeEmail(query);
  if (email && email.includes('@')) {
    const idx = resolvePatientIndex(bucket, { email });
    if (idx >= 0) return [idx];
  }

  return null;
}

function rebuildJournalIndexes(state = {}) {
  const journalByPatientId = {};
  asArray(state.entries).forEach((entry, index) => {
    const patientId = String(entry?.patientId || '').trim();
    if (!patientId) return;
    if (!journalByPatientId[patientId]) journalByPatientId[patientId] = [];
    journalByPatientId[patientId].push(index);
  });
  state._indexes = {
    version: 1,
    journalByPatientId,
    builtAt: new Date().toISOString(),
  };
  return state._indexes;
}

function rebuildBookingCasesByDate(state = {}) {
  const casesByDate = {};
  asArray(state.cases).forEach((bookingCase, caseIndex) => {
    asArray(bookingCase?.selectedSlots).forEach((slot) => {
      const iso = slotIsoDate(slot);
      if (!iso) return;
      if (!casesByDate[iso]) casesByDate[iso] = [];
      casesByDate[iso].push(caseIndex);
    });
  });
  state._indexes = {
    version: 1,
    casesByDate,
    builtAt: new Date().toISOString(),
  };
  return state._indexes;
}

function listCasesInDateRange(state = {}, { tenantId, fromDate, toDate, limit = 200 } = {}) {
  const tenant = String(tenantId || '').trim();
  const from = String(fromDate || '').slice(0, 10);
  const to = String(toDate || '').slice(0, 10);
  const max = Math.max(1, Math.min(500, Number(limit) || 200));
  const cases = asArray(state.cases);
  const indexes = state._indexes?.casesByDate || {};
  const seen = new Set();
  const result = [];

  if (from && to && Object.keys(indexes).length) {
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (cursor <= end && result.length < max) {
      const iso = cursor.toISOString().slice(0, 10);
      asArray(indexes[iso]).forEach((caseIndex) => {
        if (seen.has(caseIndex) || result.length >= max) return;
        const item = cases[caseIndex];
        if (!item) return;
        if (tenant && item.tenantId !== tenant) return;
        seen.add(caseIndex);
        result.push(item);
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
  }

  return cases
    .filter((item) => !tenant || item.tenantId === tenant)
    .filter((item) =>
      asArray(item.selectedSlots).some((slot) => {
        const iso = slotIsoDate(slot);
        return iso && iso >= from && iso <= to;
      })
    )
    .slice(0, max);
}

module.exports = {
  rebuildPatientMasterIndexes,
  rebuildJournalIndexes,
  rebuildBookingCasesByDate,
  resolvePatientIndex,
  lookupPatientsByQuery,
  listCasesInDateRange,
};
