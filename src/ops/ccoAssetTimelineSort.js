'use strict';

/**
 * Canonical timeline sort for patient files/assets (newest first).
 * Priority: captureDateTime (EXIF) → captureDate → document/visit/photo dates
 * → importedAt → indexedAt/modifiedTime/createdAt.
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTimelineDateTime(value) {
  const raw = normalizeText(value);
  if (!raw) return '';

  const exif = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (exif) {
    return `${exif[1]}-${exif[2]}-${exif[3]}T${exif[4]}:${exif[5]}:${exif[6]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00`;

  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:?\d{2}|Z)?)/);
  if (iso) {
    const time = iso[2].length === 5 ? `${iso[2]}:00` : iso[2];
    return `${iso[1]}T${time}`;
  }

  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return '';
}

const TIMELINE_FIELDS = [
  'captureDateTime',
  'captureDate',
  'documentDate',
  'visitDate',
  'photoDate',
  'importedAt',
  'indexedAt',
  'modifiedTime',
  'createdAt',
];

function resolveTimelineSortKey(record = {}) {
  for (const field of TIMELINE_FIELDS) {
    const key = normalizeTimelineDateTime(record[field]);
    if (key) return key;
  }
  return '';
}

function resolveTimelineTs(record = {}) {
  const key = resolveTimelineSortKey(record);
  const ts = Date.parse(key);
  return Number.isFinite(ts) ? ts : 0;
}

function compareTimelineNewestFirst(a, b) {
  const diff = resolveTimelineTs(b) - resolveTimelineTs(a);
  if (diff !== 0) return diff;
  return String(a?.id || a?.fileName || a?.name || '').localeCompare(
    String(b?.id || b?.fileName || b?.name || '')
  );
}

function pickNewestRecord(records = [], predicate = () => true) {
  let best = null;
  let bestTs = 0;
  for (const record of records) {
    if (!record || !predicate(record)) continue;
    const ts = resolveTimelineTs(record);
    if (!best || ts >= bestTs) {
      best = record;
      bestTs = ts;
    }
  }
  return best;
}

module.exports = {
  TIMELINE_FIELDS,
  normalizeTimelineDateTime,
  resolveTimelineSortKey,
  resolveTimelineTs,
  compareTimelineNewestFirst,
  pickNewestRecord,
};
