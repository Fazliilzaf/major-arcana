'use strict';

const { isTodayVisit } = require('./ccoKunderBookingEnrichment');

// ORD-163 — varje journaltyp bär ett uttryckligt beslut: grindad eller inte,
// och varför. En ny typ i JOURNAL_TYPES som varken står här eller i
// VANTAR_PA_BESLUT faller i testet (tests/ops/ccoOperationDayGate.test.js).
// Lägg inte till en typ utan att ta ställning — det var så luckan uppstod.
const OPS_JOURNAL_TYPE_DECISIONS = Object.freeze({
  historical_import: {
    blocked: false,
    why: 'Historisk import — inte en behandlingsjournal.',
  },
  tp_treatment: {
    blocked: true,
    why: 'Hårtransplantation: friskförsäkran ska vara signerad innan operationsjournalen startas eller signeras på behandlingsdagen.',
  },
  health_declaration: {
    blocked: false,
    why: 'Hälsodeklaration — inte en behandlingsjournal.',
  },
  fitness_certificate: {
    blocked: false,
    why: 'Friskförsäkran — grinden väntar på just den; den får aldrig blockera sig själv.',
  },
  follow_up: {
    blocked: false,
    why: 'Uppföljning — inte en behandlingsjournal.',
  },
  prp_treatment: {
    blocked: false,
    why: 'PRP kräver inte friskförsäkran — medvetet undantag (ägarbeslut, se test).',
  },
  consultation_plan: {
    blocked: false,
    why: 'Konsultationsplan — inte en behandlingsjournal.',
  },
  consent_bundle: {
    blocked: false,
    why: 'Samtyckesbunt — inte en behandlingsjournal.',
  },
});

// Väntelista: typer som väntar på ett beslut (får bara krympa, aldrig växa).
// En post UTAN datum faller i testet — listan får inte bli en soptunna.
const VANTAR_PA_BESLUT = Object.freeze({
  bleph_treatment: { fragad: '2026-09-02', av: 'medicinskt ansvarig' },
});

const OPS_BLOCKED_JOURNAL_TYPES = new Set(
  Object.entries(OPS_JOURNAL_TYPE_DECISIONS)
    .filter(([, d]) => d.blocked === true)
    .map(([key]) => key)
);
const CRITICAL_WARNING_ACK_REQUIRED_RISKS = new Set(['blocker', 'legal_blocker', 'legal']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeWarningId(value) {
  return normalizeKey(value).replace(/^customer\./, '');
}

function normalizeCriticalWarning(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const status = normalizeKey(raw.status);
  if (status && status !== 'active') return null;
  const risk = normalizeKey(raw.risk || raw.level || raw.severity);
  const explicitCritical =
    raw.critical === true ||
    raw.blocking === true ||
    normalizeKey(raw.tone) === 'red' ||
    CRITICAL_WARNING_ACK_REQUIRED_RISKS.has(risk);
  if (!explicitCritical) return null;
  const id =
    normalizeWarningId(raw.ruleId || raw.warningId || raw.id || raw.key || raw.code) ||
    `critical_warning_${index + 1}`;
  return {
    id,
    ruleId: normalizeText(raw.ruleId || raw.warningId || raw.id || raw.key || raw.code) || id,
    what: normalizeText(raw.what || raw.label || raw.title || raw.message) || 'Kritisk varning',
    why: normalizeText(raw.why || raw.reason || raw.description),
    risk: risk || (raw.legal === true ? 'legal' : 'blocker'),
  };
}

function collectVisitCriticalWarnings({
  encounter = null,
  patient = null,
  body = null,
  authoritativeWarnings = null,
} = {}) {
  const metadata =
    encounter?.metadata && typeof encounter.metadata === 'object' ? encounter.metadata : {};
  const sources = Array.isArray(authoritativeWarnings)
    ? authoritativeWarnings
    : [
        ...asArray(metadata.criticalWarnings),
        ...asArray(metadata.automationSignals),
        ...asArray(body?.criticalWarnings),
        ...asArray(body?.automationSignals),
        ...asArray(patient?.criticalWarnings),
        ...asArray(patient?.automationSignals),
      ];
  const seen = new Set();
  const out = [];
  sources.forEach((item, index) => {
    const warning = normalizeCriticalWarning(item, index);
    if (!warning || seen.has(warning.id)) return;
    seen.add(warning.id);
    out.push(warning);
  });
  return out;
}

function collectVisitCriticalWarningAcks({ encounter = null, body = null } = {}) {
  const metadata =
    encounter?.metadata && typeof encounter.metadata === 'object' ? encounter.metadata : {};
  return [
    ...asArray(metadata.criticalWarningAcknowledgements),
    ...asArray(body?.criticalWarningAcknowledgements),
    ...asArray(body?.criticalWarningAcks),
  ];
}

function ackMatchesScope(ack, { tenantId, patientId, encounterId, bookingId } = {}) {
  if (!ack || typeof ack !== 'object') return false;
  if (ack.acknowledged !== true && ack.ack !== true && !normalizeText(ack.acknowledgedAt)) {
    return false;
  }
  const ackTenantId = normalizeText(ack.tenantId);
  const ackPatientId = normalizeText(ack.patientId);
  const ackEncounterId = normalizeText(ack.encounterId);
  const ackBookingId = normalizeText(ack.bookingId);
  if (ackTenantId && ackTenantId !== normalizeText(tenantId)) return false;
  if (ackPatientId && ackPatientId !== normalizeText(patientId)) return false;
  if (ackEncounterId && encounterId && ackEncounterId !== normalizeText(encounterId)) return false;
  if (ackBookingId && bookingId && ackBookingId !== normalizeText(bookingId)) return false;
  return true;
}

function buildCriticalWarningAckRecord(
  warning,
  { actor = {}, tenantId, patientId, encounterId, bookingId, at } = {}
) {
  return {
    warningId: warning.id,
    ruleId: warning.ruleId,
    what: warning.what,
    acknowledgedAt: normalizeText(at) || new Date().toISOString(),
    acknowledgedBy: normalizeText(actor.userId || actor.id),
    actorRole: normalizeText(actor.role),
    tenantId: normalizeText(tenantId),
    patientId: normalizeText(patientId),
    encounterId: normalizeText(encounterId) || null,
    bookingId: normalizeText(bookingId) || null,
    source: 'v9_active_visit',
  };
}

function evaluateCriticalWarningAcknowledgements({
  patient = null,
  encounter = null,
  body = null,
  actor = {},
  tenantId = '',
  patientId = '',
  encounterId = '',
  bookingId = '',
  at = '',
  authoritativeWarnings = null,
} = {}) {
  const warnings = collectVisitCriticalWarnings({
    encounter,
    patient,
    body,
    authoritativeWarnings,
  });
  if (!warnings.length) {
    return { allowed: true, warnings: [], acknowledgements: [] };
  }
  const acks = collectVisitCriticalWarningAcks({ encounter, body }).filter((ack) =>
    ackMatchesScope(ack, { tenantId, patientId, encounterId, bookingId })
  );
  const acknowledgedIds = new Set(
    acks
      .map((ack) =>
        normalizeWarningId(ack.warningId || ack.ruleId || ack.id || ack.key || ack.code)
      )
      .filter(Boolean)
  );
  const missing = warnings.filter((warning) => !acknowledgedIds.has(warning.id));
  if (missing.length) {
    return { allowed: false, warnings: missing, acknowledgements: [] };
  }
  return {
    allowed: true,
    warnings,
    acknowledgements: warnings.map((warning) =>
      buildCriticalWarningAckRecord(warning, {
        actor,
        tenantId,
        patientId,
        encounterId,
        bookingId,
        at,
      })
    ),
  };
}

function assertVisitCriticalWarningsAcknowledged(ctx = {}) {
  const result = evaluateCriticalWarningAcknowledgements(ctx);
  if (result.allowed) return result;
  return {
    ...result,
    reason: 'critical_warning_ack_required',
    message: 'Kritiska varningar måste kvitteras innan besöket kan avslutas.',
  };
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
  CRITICAL_WARNING_ACK_REQUIRED_RISKS,
  OPS_BLOCKED_JOURNAL_TYPES,
  OPS_JOURNAL_TYPE_DECISIONS,
  VANTAR_PA_BESLUT,
  assertOperationDayJournalAllowed,
  assertOperationDayJournalAllowedForPatient,
  assertVisitCriticalWarningsAcknowledged,
  bookingCaseHasTodayVisit,
  collectVisitCriticalWarnings,
  evaluateCriticalWarningAcknowledgements,
  patientFitnessSigned,
  resolveFitnessSignedFromJournal,
  resolveTodayVisitForPatient,
};
