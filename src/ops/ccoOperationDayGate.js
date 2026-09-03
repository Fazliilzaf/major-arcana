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
  bleph_treatment: {
    blocked: true,
    why:
      'Ögonlocksplastik är kirurgi: friskförsäkran ska vara signerad innan ' +
      'operationsjournalen startas eller signeras på behandlingsdagen. ' +
      'Ägarbeslut 2026-09-02 ("vi har inte det så idag men jag tycker vi ska ha det"). ' +
      'Grinden kunde inte slås på förrän Curatiio hade en signerbar friskförsäkran — ' +
      'den byggdes 2026-09-02 ur Meridiq 16389 (schema fitness_certificate:curatiio_bleph, ' +
      '6 fält) och verifierades i prod: signEnabled true, schemat på plats.',
  },
});

// Väntelista: typer som väntar på ett beslut (får bara krympa, aldrig växa).
// En post UTAN datum faller i testet — listan får inte bli en soptunna.
//
// Tom sedan 2026-09-02: bleph_treatment var den sista posten och är nu avgjord.
const VANTAR_PA_BESLUT = Object.freeze({});

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

/**
 * ORD-188 — GRINDEN. Inget ingrepp utan godkänd ordination.
 *
 * Allt som byggts i läkarkedjan fram till nu är SYNLIGHET: ordinationskravet
 * per tjänst (ORD-177), ärendet som skapas vid bekräftelse (ORD-179),
 * T−14-fönstret (ORD-180), avbokningen som släcker godkännandet (ORD-171),
 * underlagshashen (ORD-172). Alla svarar på frågan "vad borde hända". Ingen av
 * dem hindrar något.
 *
 * Den här funktionen är det enda stället som säger nej.
 *
 * VARFÖR PÅ OPERATIONSDAGEN OCH INTE VID BOKNINGEN. Ordinationen godkänns två
 * veckor före ingreppet, alltså långt EFTER att tiden bokats. Att kräva ett
 * godkännande vid bokningen hade varit att kräva ett beslut om något som ännu
 * inte finns. Grinden hör där ingreppet faktiskt utförs och journalförs.
 *
 * Den ligger tillsammans med friskförsäkranskravet med flit: samma seam, samma
 * ögonblick, samma sorts krav. Två grindar på två ställen hade gett två svar på
 * frågan "får vi börja".
 *
 * FAIL-CLOSED PÅ TRE LÄGEN:
 *   true   godkänd ordination finns → tillåt
 *   false  ingen godkänd ordination → NEKA
 *   null   vi vet inte              → NEKA
 *
 * `null` nekar, och det är hela poängen. Ett okänt ordinationsläge betyder att
 * någon länk i kedjan inte svarade — ärendet saknas, storen är nere, tjänsten
 * är oklassificerad. Att tolka tystnad som ja vore att låta ett tekniskt fel bli
 * ett medicinskt beslut.
 */
function assertOperationDayJournalAllowed({
  journalType = '',
  todayVisit = false,
  fitnessSigned = false,
  ordinationApproved = null,
  ordinationRequired = true,
} = {}) {
  const type = normalizeKey(journalType);
  if (!OPS_BLOCKED_JOURNAL_TYPES.has(type)) {
    return { allowed: true };
  }
  if (!todayVisit) {
    return { allowed: true };
  }
  if (!fitnessSigned) {
    return {
      allowed: false,
      reason: 'operation_day_fitness_required',
      message:
        'Friskförsäkran måste signeras innan operationsjournal kan startas eller signeras på operationsdagen.',
    };
  }
  // Kräver tjänsten ingen ordination är frågan inte relevant. Bara ett BESLUTAT
  // nej öppnar — `null` gör det inte, av samma skäl som i ORD-177.
  if (ordinationRequired === false) {
    return { allowed: true };
  }
  if (ordinationApproved === true) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason:
      ordinationApproved === null
        ? 'operation_day_ordination_unknown'
        : 'operation_day_ordination_required',
    message:
      ordinationApproved === null
        ? 'Ordinationsläget kunde inte fastställas. Operationsjournal får inte startas förrän läkarens godkännande är verifierat.'
        : 'Läkaren har inte godkänt ordinationen för det här ingreppet. Operationsjournal kan inte startas eller signeras.',
  };
}

/**
 * ORD-188 — hämtar ordinationsläget för dagens besök.
 *
 * @returns {{required: true|false, approved: true|false|null}}
 *
 * FAIL-CLOSED I VARJE GREN. Saknas storen, går anropet fel, hittas inget
 * ärende — svaret blir `approved: null`, och grinden nekar på null. Det är
 * medvetet: ett tekniskt fel får inte bli ett medicinskt beslut.
 *
 * `required` kommer ur samma facit som resten av kedjan
 * (config/ordinationskravande-tjanster.json). Är tjänsten ett beslutat nej
 * spelar godkännandet ingen roll.
 */
/**
 * ORD-188 — grinden är byggd men AVSTÄNGD, och det är ett medvetet val.
 *
 * Att slå på den i dag hade stoppat kliniken. Två skäl, båda uppmätta:
 *
 * 1. FEL STORE. Journalvägen (ccoJournal.js:176) får `ccoBookingStore` — den
 *    KOMMERSIELLA storen (cco-booking.json, 369 ärenden, triage och offerter).
 *    Ordinationsbesluten bor i ccoBookingCaseStore, den KLINISKA storen. Läser
 *    grinden fel store hittar den aldrig ett godkännande och nekar allt.
 *    Därför tar den emot `bookingCaseStore` separat, inte `bookingStore`.
 *
 * 2. DEN KLINISKA STOREN ÄR TOM I PROD. Ärenden skapas först från ORD-179, vid
 *    bekräftelse. Inga befintliga bokningar har ett ärende. En fail-closed grind
 *    hade alltså nekat varenda operationsjournal i morgon.
 *
 * ARCANA_ORDINATIONSGRIND_ENABLED, default av. Läses per anrop.
 *
 * NÄR DEN KAN SLÅS PÅ: när bokningsärenden finns för de operationer som faktiskt
 * ska utföras, och läkaren har hunnit godkänna dem. Konkret: efter cutovern, när
 * ORD-179 har skapat ärenden och T−14-fönstret har öppnat för de närmaste
 * ingreppen. Innan dess är ett ja från grinden inte ett ja — det är okunskap.
 *
 * Att den är av GÖMS INTE. Utfallet bär `ordinationGateOff: true`, så en läsare
 * ser att kravet inte prövades i stället för att tro att det godkändes.
 */
/**
 * ORD-188 — dagens besök i den KLINISKA ärendeformen.
 *
 * `bookingCaseHasTodayVisit` ovan läser `selectedSlots` / `slots`. Det är den
 * KOMMERSIELLA storens form (cco-booking.json: triage, offerter, föreslagna
 * tider). Den kliniska storen bär tiden direkt på posten som `startsAt` —
 * ORD-179 sätter den vid bekräftelse.
 *
 * Att återanvända den befintliga hjälparen gav därför alltid falskt: grinden
 * hittade aldrig dagens ärende och svarade "vet inte" på allt. Fångat av det
 * egna testet.
 *
 * Egen funktion i stället för att bända den befintliga — friskförsäkranskravet
 * läser samma hjälpare, och att ändra den hade rört en grind som fungerar.
 * `selectedSlots` tas ändå med, för ett ärende kan bära båda.
 */
function kliniskaArendetArIdag(bookingCase = {}) {
  if (isTodayVisit(bookingCase?.startsAt)) return true;
  if (isTodayVisit(bookingCase?.scheduledAt)) return true;
  return bookingCaseHasTodayVisit(bookingCase);
}

function arOrdinationsgrindenPa(env = process.env) {
  const v = String(env.ARCANA_ORDINATIONSGRIND_ENABLED || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

async function resolveOrdinationForTodayVisit({
  patient = {},
  bookingCaseStore = null,
  tenantId = '',
} = {}) {
  if (!arOrdinationsgrindenPa()) {
    return { required: false, approved: true, gateOff: true };
  }
  const { caseRequiresOrdination } = require('./ordinationRequirement');
  const email = normalizeText(patient.primaryEmail || patient.contactEmail);
  if (!bookingCaseStore?.listCases || !tenantId || !email) {
    return { required: true, approved: null };
  }
  let cases = [];
  try {
    cases = (await bookingCaseStore.listCases({ tenantId, customerEmail: email, limit: 40 })) || [];
  } catch {
    return { required: true, approved: null };
  }
  const dagensArenden = cases.filter((bookingCase) => kliniskaArendetArIdag(bookingCase));
  if (!dagensArenden.length) return { required: true, approved: null };

  // Kräver INGET av dagens ärenden ordination är frågan inte relevant. Men ett
  // enda `null` bland dem räcker för att vi inte vet — då nekar grinden.
  const krav = dagensArenden.map((c) => caseRequiresOrdination(c));
  if (krav.every((k) => k === false)) return { required: false, approved: true };
  if (krav.some((k) => k === null)) return { required: true, approved: null };

  // Alla ärenden som kräver ordination måste ha ett godkänt beslut. Ett
  // 'lapsed' (avbokad tid, ORD-171) räknas inte som godkänt.
  const kravande = dagensArenden.filter((c) => caseRequiresOrdination(c) === true);
  const allaGodkanda = kravande.every(
    (c) => normalizeKey(c?.ordinationReview?.status) === 'approved'
  );
  return { required: true, approved: allaGodkanda };
}

async function assertOperationDayJournalAllowedForPatient(ctx = {}) {
  const journalType = normalizeKey(ctx.journalType);
  if (!OPS_BLOCKED_JOURNAL_TYPES.has(journalType)) {
    return { allowed: true };
  }
  const fitnessSigned = await resolveFitnessSignedFromJournal(ctx);
  const todayVisit = await resolveTodayVisitForPatient(ctx);
  const ordination = await resolveOrdinationForTodayVisit(ctx);
  const utfall = assertOperationDayJournalAllowed({
    journalType,
    todayVisit,
    fitnessSigned,
    ordinationRequired: ordination.required,
    ordinationApproved: ordination.approved,
  });
  // Att grinden är av ska SYNAS i utfallet. Annars går det inte att skilja
  // "läkaren har godkänt" från "vi frågade inte".
  return ordination.gateOff ? { ...utfall, ordinationGateOff: true } : utfall;
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
  resolveOrdinationForTodayVisit,
};
