'use strict';

/**
 * Recurring Bookings — PRP-serier och återkommande behandlingar.
 *
 * Skapar en serie av bokningar baserat på:
 * - Antal tillfällen (t.ex. 3 PRP-behandlingar)
 * - Intervall (t.ex. var 4:e vecka)
 * - Resurser och tjänst
 *
 * Varje tillfälle är en separat bokning kopplad till ett "serieId".
 */

const crypto = require('node:crypto');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

const SERIES_TEMPLATES = Object.freeze([
  {
    templateId: 'prp-hair-3',
    label: 'PRP Hår — 3 behandlingar',
    serviceId: 'prp-hair',
    count: 3,
    intervalWeeks: 4,
    // Föreslås när en PRP-hårbehandling journalförs (Block 4.3). Specifika
    // behandlingsnycklar träffar först; journalTyp är en generell fallback.
    suggestOnTreatmentKeys: ['prp_hair', 'prp-hair'],
    suggestOnJournalTypes: [],
  },
  {
    templateId: 'prp-hair-6',
    label: 'PRP Hår — 6 behandlingar',
    serviceId: 'prp-hair',
    count: 6,
    intervalWeeks: 4,
    // Förlängd serie. Föreslås inte automatiskt (3 är standardkadensen) —
    // personalen väljer denna manuellt.
    suggestOnTreatmentKeys: [],
    suggestOnJournalTypes: [],
  },
  {
    templateId: 'prp-skin-3',
    label: 'PRP Hud — 3 behandlingar',
    serviceId: 'prp-skin',
    count: 3,
    intervalWeeks: 4,
    suggestOnTreatmentKeys: ['prp_skin', 'prp-skin'],
    suggestOnJournalTypes: [],
  },
  {
    templateId: 'microneedling-3',
    label: 'Microneedling — 3 behandlingar',
    serviceId: 'microneedling',
    count: 3,
    intervalWeeks: 6,
  },
  {
    templateId: 'microneedling-6',
    label: 'Microneedling — 6 behandlingar',
    serviceId: 'microneedling',
    count: 6,
    intervalWeeks: 4,
  },
  // 4/8/12 månader från operationsdagen (Fazli 2026-08-26). Fyra månaders
  // mellanrum ≈ 17 veckor. startDate ska alltså vara op-dagen + 4 månader,
  // inte op-dagen — annars hamnar första tillfället fel.
  //
  // Inkopplad via ccoRecurringSeriesStore (Block 4): serien föreslås när en
  // transplantation journalförs (väg B) och kan bokas som riktiga
  // reservationer (väg A).
  {
    templateId: 'followup-transplant',
    label: 'Uppföljning HT (4/8/12 mån)',
    serviceId: 'followup-transplant',
    count: 3,
    intervalWeeks: 17,
    // Serien ska börja 4 månader efter operationen, inte på op-dagen. Callern
    // (serie-storen) lägger därför till detta offset när den bygger första
    // tillfället — annars hamnar tillfällena på 0/4/8 månader i stället för
    // 4/8/12. Värde i veckor (17 ≈ 4 månader).
    firstOccurrenceOffsetWeeks: 17,
    // Föreslås när en transplantation journalförs (Block 4.2). Nyckeln är
    // journalTyp (`tp_treatment`, `bleph_treatment`) eller behandlingsnyckeln
    // på encountern (fue/dhi/beard/eyebrow). Förslag — inte bokning.
    suggestOnTreatmentKeys: ['fue', 'dhi', 'beard', 'eyebrow', 'transplant'],
    suggestOnJournalTypes: ['tp_treatment', 'bleph_treatment'],
  },
]);

function createRecurringSeries({
  patientId,
  patientName,
  serviceId,
  resourceId,
  startDate,
  count,
  intervalWeeks,
  templateId,
}) {
  const seriesId = crypto.randomUUID();
  const occurrences = [];

  const start = new Date(normalizeText(startDate) || nowIso());

  for (let i = 0; i < count; i++) {
    const occurrenceDate = new Date(start.getTime() + i * intervalWeeks * 7 * 86400000);
    occurrences.push({
      occurrenceId: crypto.randomUUID(),
      seriesId,
      sequenceNumber: i + 1,
      totalInSeries: count,
      patientId: normalizeText(patientId),
      patientName: normalizeText(patientName),
      serviceId: normalizeText(serviceId),
      resourceId: normalizeText(resourceId),
      scheduledDate: occurrenceDate.toISOString().slice(0, 10),
      status: i === 0 ? 'ready_to_book' : 'planned',
      bookedAt: null,
      bookingId: null,
      completedAt: null,
    });
  }

  return {
    seriesId,
    templateId: normalizeText(templateId),
    patientId: normalizeText(patientId),
    patientName: normalizeText(patientName),
    serviceId: normalizeText(serviceId),
    resourceId: normalizeText(resourceId),
    count,
    intervalWeeks,
    startDate: start.toISOString().slice(0, 10),
    status: 'active',
    occurrences,
    createdAt: nowIso(),
  };
}

function getNextUnbooked(series) {
  if (!series?.occurrences) return null;
  return (
    series.occurrences.find((o) => o.status === 'ready_to_book' || o.status === 'planned') || null
  );
}

function markOccurrenceBooked(series, occurrenceId, bookingId) {
  const occ = series.occurrences.find((o) => o.occurrenceId === occurrenceId);
  if (!occ) return null;
  occ.status = 'booked';
  occ.bookedAt = nowIso();
  occ.bookingId = normalizeText(bookingId);

  const nextIdx = series.occurrences.indexOf(occ) + 1;
  if (nextIdx < series.occurrences.length) {
    series.occurrences[nextIdx].status = 'ready_to_book';
  }
  return occ;
}

function markOccurrenceCompleted(series, occurrenceId) {
  const occ = series.occurrences.find((o) => o.occurrenceId === occurrenceId);
  if (!occ) return null;
  occ.status = 'completed';
  occ.completedAt = nowIso();

  const allDone = series.occurrences.every((o) => o.status === 'completed');
  if (allDone) series.status = 'completed';
  return occ;
}

function getSeriesProgress(series) {
  if (!series?.occurrences) return { completed: 0, total: 0, percent: 0 };
  const completed = series.occurrences.filter((o) => o.status === 'completed').length;
  return {
    completed,
    total: series.occurrences.length,
    percent: Math.round((completed / series.occurrences.length) * 100),
    nextDate: getNextUnbooked(series)?.scheduledDate || null,
  };
}

/**
 * Matcha en journalhändelse mot de serie-mallar som ska föreslås när den
 * journalförs (Block 4.2 / 4.3). Kandidatnycklarna är en union av:
 *   - journalTyp (t.ex. 'tp_treatment', 'prp_treatment')
 *   - behandlingsnyckeln (t.ex. 'fue', 'prp_hair')
 *   - tjänste-id (t.ex. 'prp-hair', 'followup-transplant')
 *
 * Matching sker i två nivåer, så en generisk journalTyp inte träffar alla
 * serier samtidigt:
 *   1. Specifika behandlings-/tjänstenycklar (suggestOnTreatmentKeys). Träffar
 *      de → returnera bara dem (t.ex. prp_hair → enbart prp-hair-3).
 *   2. Annars journalTyp-fallback (suggestOnJournalTypes). Träffar de →
 *      returnera dem (t.ex. tp_treatment → followup-transplant).
 *
 * Om flera mallar matchar returneras alla (ett förslag per mall, personalen
 * väljer). Ett förslag är aldrig en bokning.
 */
function normalizeSeriesKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function intersect(keys = [], haystack = []) {
  const dict = new Set(
    (Array.isArray(haystack) ? haystack : []).map((key) => normalizeSeriesKey(key)).filter(Boolean)
  );
  return (Array.isArray(keys) ? keys : []).some((key) => dict.has(normalizeSeriesKey(key)));
}

function findSeriesTemplatesForJournal(candidateKeys = []) {
  const keys = (Array.isArray(candidateKeys) ? candidateKeys : [])
    .map((key) => normalizeSeriesKey(key))
    .filter(Boolean);
  if (keys.length === 0) return [];

  const specific = SERIES_TEMPLATES.filter((template) =>
    intersect(template.suggestOnTreatmentKeys || [], keys)
  );
  if (specific.length > 0) return specific;

  return SERIES_TEMPLATES.filter((template) =>
    intersect(template.suggestOnJournalTypes || [], keys)
  );
}

module.exports = {
  createRecurringSeries,
  getNextUnbooked,
  markOccurrenceBooked,
  markOccurrenceCompleted,
  getSeriesProgress,
  findSeriesTemplatesForJournal,
  normalizeSeriesKey,
  SERIES_TEMPLATES,
};
