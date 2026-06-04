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

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function nowIso() { return new Date().toISOString(); }

const SERIES_TEMPLATES = Object.freeze([
  { templateId: 'prp-hair-3', label: 'PRP Hår — 3 behandlingar', serviceId: 'prp-hair', count: 3, intervalWeeks: 4 },
  { templateId: 'prp-hair-6', label: 'PRP Hår — 6 behandlingar', serviceId: 'prp-hair', count: 6, intervalWeeks: 4 },
  { templateId: 'prp-skin-3', label: 'PRP Hud — 3 behandlingar', serviceId: 'prp-skin', count: 3, intervalWeeks: 4 },
  { templateId: 'microneedling-3', label: 'Microneedling — 3 behandlingar', serviceId: 'microneedling', count: 3, intervalWeeks: 6 },
  { templateId: 'microneedling-6', label: 'Microneedling — 6 behandlingar', serviceId: 'microneedling', count: 6, intervalWeeks: 4 },
  { templateId: 'followup-transplant', label: 'Uppföljning HT (4+6+12 mån)', serviceId: 'followup-transplant', count: 3, intervalWeeks: 8 },
]);

function createRecurringSeries({ patientId, patientName, serviceId, resourceId, startDate, count, intervalWeeks, templateId }) {
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
  return series.occurrences.find((o) => o.status === 'ready_to_book' || o.status === 'planned') || null;
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

module.exports = { createRecurringSeries, getNextUnbooked, markOccurrenceBooked, markOccurrenceCompleted, getSeriesProgress, SERIES_TEMPLATES };
