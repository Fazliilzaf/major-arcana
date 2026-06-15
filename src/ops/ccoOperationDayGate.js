'use strict';

const { isTodayVisit } = require('./ccoKunderBookingEnrichment');

const OPS_BLOCKED_JOURNAL_TYPES = new Set(['tp_treatment', 'prp_treatment']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function patientFitnessSigned(patient = {}) {
  if (patient.fitnessSigned === true) return true;
  if (patient.hasFitnessCertificate === true) return true;
  const cert = patient.fitnessCertificate;
  if (cert && typeof cert === 'object' && normalizeText(cert.signedAt)) return true;
  return false;
}

async function resolveFitnessSignedFromJournal({
  journalStore,
  tenantId,
  patientId,
  patient,
} = {}) {
  if (patientFitnessSigned(patient || {})) return true;
  if (!journalStore?.listEntries || !tenantId || !patientId) return false;
  try {
    const entries =
      (await journalStore.listEntries({
        tenantId,
        patientId,
        journalType: 'fitness_certificate',
      })) || [];
    return entries.some((entry) => {
      const status = normalizeKey(entry?.status);
      return status === 'signed' || Boolean(normalizeText(entry?.signedAt));
    });
  } catch {
    return false;
  }
}

function bookingCaseHasTodayVisit(bookingCase = {}) {
  const slots = asArray(bookingCase.selectedSlots || bookingCase.slots);
  return slots.some((slot) => isTodayVisit(slot?.startsAt || slot?.startAt || slot?.date));
}

async function resolveTodayVisitForPatient({
  patient = {},
  bookingStore = null,
  tenantId = '',
} = {}) {
  if (patient.todayVisit === true) return true;
  const email = normalizeText(patient.primaryEmail || patient.contactEmail);
  if (!bookingStore?.listCases || !tenantId || !email) return false;
  try {
    const cases =
      (await bookingStore.listCases({ tenantId, customerEmail: email, limit: 40 })) || [];
    return cases.some((bookingCase) => bookingCaseHasTodayVisit(bookingCase));
  } catch {
    return false;
  }
}

function assertOperationDayJournalAllowed({
  journalType = '',
  todayVisit = false,
  fitnessSigned = false,
} = {}) {
  const type = normalizeKey(journalType);
  if (!OPS_BLOCKED_JOURNAL_TYPES.has(type)) {
    return { allowed: true };
  }
  if (!todayVisit) {
    return { allowed: true };
  }
  if (fitnessSigned) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'operation_day_fitness_required',
    message:
      'Friskförsäkran måste signeras innan operationsjournal kan startas eller signeras på operationsdagen.',
  };
}

async function assertOperationDayJournalAllowedForPatient(ctx = {}) {
  const journalType = normalizeKey(ctx.journalType);
  if (!OPS_BLOCKED_JOURNAL_TYPES.has(journalType)) {
    return { allowed: true };
  }
  const fitnessSigned = await resolveFitnessSignedFromJournal(ctx);
  const todayVisit = await resolveTodayVisitForPatient(ctx);
  return assertOperationDayJournalAllowed({ journalType, todayVisit, fitnessSigned });
}

module.exports = {
  OPS_BLOCKED_JOURNAL_TYPES,
  assertOperationDayJournalAllowed,
  assertOperationDayJournalAllowedForPatient,
  bookingCaseHasTodayVisit,
  patientFitnessSigned,
  resolveFitnessSignedFromJournal,
  resolveTodayVisitForPatient,
};
