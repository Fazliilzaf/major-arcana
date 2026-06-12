'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function dateKey(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const iso = raw.match(/\b(20\d{2}|19\d{2})[-_/. ](\d{2})[-_/. ](\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '';
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
}

function isDriveImportActor(value) {
  const key = normalizeKey(value);
  return key === 'drive-import' || key === 'drive import' || key === 'import';
}

function resolveJournalDate(entry = {}) {
  const safe = asObject(entry);
  const meta = asObject(safe.importMeta);
  const attachments = asArray(safe.attachments);
  const fromExplicit = dateKey(
    firstText(
      safe.journalDateReal,
      safe.documentDate,
      meta.journalDateReal,
      meta.documentDate,
      meta.modifiedTime,
      meta.createdTime
    )
  );
  if (fromExplicit) return fromExplicit;

  const haystack = [
    safe.title,
    meta.importKey,
    meta.relativePath,
    meta.fileName,
    ...attachments.map((item) => `${item.fileName || ''} ${item.relativePath || ''}`),
  ].join(' ');
  const fromName = dateKey(haystack);
  if (fromName) return fromName;

  if (normalizeKey(safe.source) !== 'drive_import') {
    return dateKey(safe.signedAt || safe.updatedAt);
  }
  return '';
}

function resolveTreatmentType(entry = {}) {
  const safe = asObject(entry);
  const fields = asObject(safe.fields);
  const meta = asObject(safe.importMeta);
  const direct = firstText(
    safe.treatmentType,
    fields.treatmentType,
    fields.bookingServiceId,
    meta.treatmentType,
    meta.serviceLabel,
    meta.serviceName
  );
  if (direct) return direct;
  const type = normalizeKey(safe.journalType);
  const map = {
    tp_treatment: 'TP behandling',
    prp_treatment: 'PRP',
    bleph_treatment: 'Curatiio',
    follow_up: 'Uppföljning',
    consultation_plan: 'Konsultation',
    consent_bundle: 'Avtal + samtycke',
    health_declaration: 'Hälsodeklaration',
    fitness_certificate: 'Friskförsäkran',
    historical_import: '',
  };
  return map[type] || '';
}

function resolveExistingTreater(entry = {}) {
  const safe = asObject(entry);
  const fields = asObject(safe.fields);
  const meta = asObject(safe.importMeta);
  const direct = firstText(
    safe.treater,
    safe.treatmentProvider,
    fields.treater,
    fields.treatmentProvider,
    fields.behandlare,
    meta.treater,
    meta.behandlare
  );
  if (direct) return direct;
  const signedBy = firstText(safe.signedByName, safe.authorName);
  return signedBy && !isDriveImportActor(signedBy) ? signedBy : '';
}

function resolveJournalStep(entry = {}) {
  const safe = asObject(entry);
  const fields = asObject(safe.fields);
  const meta = asObject(safe.importMeta);
  return firstText(
    safe.journalStep,
    safe.journeyStep,
    fields.journalStep,
    fields.journeyStep,
    fields.step,
    meta.journalStep,
    meta.journeyStep
  );
}

function buildBookingsByDate(bookings = []) {
  const byDate = new Map();
  for (const booking of asArray(bookings)) {
    const day = dateKey(booking.startsAt || booking.startAt || booking.date);
    if (!day) continue;
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day).push(booking);
  }
  return byDate;
}

function enrichJournalEntriesWithMetadata({ journalEntries = [], bookings = [] } = {}) {
  const bookingsByDate = buildBookingsByDate(bookings);
  return asArray(journalEntries).map((entry) => {
    const journalDateReal = resolveJournalDate(entry);
    const sameDayBooking = journalDateReal ? asArray(bookingsByDate.get(journalDateReal))[0] : null;
    const bookingTreater = firstText(sameDayBooking?.staff, sameDayBooking?.resourceLabel);
    const bookingTreatmentType = firstText(sameDayBooking?.serviceName, sameDayBooking?.title);
    const treater = resolveExistingTreater(entry) || bookingTreater || '';
    const treatmentType = resolveTreatmentType(entry) || bookingTreatmentType || '';
    const journalStep = resolveJournalStep(entry);
    return {
      ...entry,
      treater: treater || null,
      treatmentType: treatmentType || null,
      journalStep: journalStep || null,
      journeyStep: entry?.journeyStep || journalStep || null,
      journalDateReal: journalDateReal || null,
      journalMetadataSource: {
        treater: resolveExistingTreater(entry)
          ? 'journal'
          : bookingTreater
            ? 'booking_fallback'
            : null,
        treatmentType: resolveTreatmentType(entry)
          ? 'journal'
          : bookingTreatmentType
            ? 'booking_fallback'
            : null,
        journalStep: journalStep ? 'journal' : null,
        journalDateReal: journalDateReal ? 'entry_or_import_meta' : null,
      },
    };
  });
}

module.exports = {
  enrichJournalEntriesWithMetadata,
  resolveJournalDate,
};
