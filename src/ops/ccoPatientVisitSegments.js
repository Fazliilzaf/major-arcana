'use strict';

const { extractFileOccasionContext } = require('../../scripts/migration/lib/migrationUtils');
const { normalizeTimelineDateTime, resolveTimelineSort } = require('./ccoAssetTimelineSort');
const { inferEncounterTypeFromAsset } = require('./ccoAssetNaming/encounterMapper');
const { repairMojibakeFilename } = require('./filenameEncoding');

const SWEDISH_MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];

const VISIT_TYPE_RE =
  /\b(PRP|DHI|FUE|OP|Microneedling|Konsultation|Uppf[oö]ljning|Kontroll)\b\s*(\d+)?/i;

const TIME_CLUSTER_GAP_MINUTES = 90;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value).slice(0, 10));
}

function isImageLikeFile(file) {
  const mime = normalizeText(file?.mimeType || file?.contentType).toLowerCase();
  const type = normalizeText(file?.fileType).toLowerCase();
  const category = normalizeText(file?.category).toLowerCase();
  const name = normalizeText(file?.fileName || file?.originalFileName || file?.name).toLowerCase();
  return (
    type === 'image' ||
    type === 'video' ||
    category.startsWith('photo_') ||
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    /\.(heic|heif|jpe?g|png|webp|gif|mp4|mov|m4v|webm)$/i.test(name)
  );
}

function isVideoLikeFile(file) {
  const mime = normalizeText(file?.mimeType || file?.contentType).toLowerCase();
  const type = normalizeText(file?.fileType).toLowerCase();
  const name = normalizeText(file?.fileName || file?.originalFileName || file?.name).toLowerCase();
  return type === 'video' || mime.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(name);
}

function resolveSortKey(file) {
  const direct = normalizeTimelineDateTime(file?.timelineSortKey || file?.timelineDate);
  if (direct) return direct;
  const timeline = resolveTimelineSort(file || {});
  if (timeline.sortKey) return timeline.sortKey;
  const occasion =
    file?.occasionContext && typeof file.occasionContext === 'object'
      ? file.occasionContext
      : extractFileOccasionContext(file || {});
  if (occasion.capturedAt) return `${occasion.capturedAt}T00:00:00`;
  if (isIsoDate(occasion.timelineKey)) return `${occasion.timelineKey}T00:00:00`;
  const source = normalizeText(
    file?.relativePath || file?.fileName || file?.originalFileName || file?.name
  );
  const isoInPath = source.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoInPath) return `${isoInPath[1]}-${isoInPath[2]}-${isoInPath[3]}T00:00:00`;
  const epoch = source.match(/\b(1[0-9]{9})\b/);
  if (epoch) {
    const parsed = new Date(Number(epoch[1]) * 1000);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return '';
}

function resolveVisitDate(file) {
  const sortKey = resolveSortKey(file);
  if (sortKey) return sortKey.slice(0, 10);
  const occasion =
    file?.occasionContext && typeof file.occasionContext === 'object'
      ? file.occasionContext
      : extractFileOccasionContext(file || {});
  if (isIsoDate(occasion.timelineKey)) return occasion.timelineKey.slice(0, 10);
  if (isIsoDate(occasion.capturedAt)) return occasion.capturedAt.slice(0, 10);
  const documentDate = normalizeText(file?.documentDate).slice(0, 10);
  if (isIsoDate(documentDate)) return documentDate;
  return '';
}

function resolveDocumentDate(file) {
  const direct = normalizeText(file?.documentDate || file?.visitDate || file?.photoDate).slice(
    0,
    10
  );
  if (isIsoDate(direct)) return direct;
  const visitDate = resolveVisitDate(file);
  return visitDate || null;
}

function resolveTakenAt(file) {
  const captureDateTime = normalizeTimelineDateTime(file?.captureDateTime);
  if (captureDateTime) return captureDateTime;
  const sortKey = resolveSortKey(file);
  if (sortKey && !sortKey.endsWith('T00:00:00')) return sortKey;
  return null;
}

function formatTimeLabel(isoDateTime) {
  const normalized = normalizeTimelineDateTime(isoDateTime);
  if (!normalized) return '';
  const match = normalized.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

function formatSegmentLabel(date) {
  if (!isIsoDate(date)) return 'Datum/tid saknas';
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (!year || month < 1 || month > 12 || !day) return date;
  const currentYear = new Date().getFullYear();
  const monthLabel = SWEDISH_MONTHS[month - 1] || '';
  return currentYear === year ? `${day} ${monthLabel}` : `${day} ${monthLabel} ${year}`;
}

function mapEncounterTypeToVisitType(encounterType) {
  const key = normalizeText(encounterType).toLowerCase();
  if (!key || key === 'other') return 'unknown';
  if (key === 'consultation') return 'consultation';
  if (key === 'follow_up') return 'followup';
  if (key === 'prp_hair' || key === 'prp_skin') return 'prp';
  if (key === 'transplant_fue' || key === 'transplant_dhi' || key === 'microneedling') {
    return 'operation';
  }
  return 'unknown';
}

function inferVisitTypeFromFiles(files = []) {
  for (const file of files) {
    const fromAsset = mapEncounterTypeToVisitType(inferEncounterTypeFromAsset(file));
    if (fromAsset !== 'unknown') return fromAsset;
  }
  for (const file of files) {
    const haystack = normalizeText(
      `${file?.relativePath || ''} ${file?.fileName || file?.originalFileName || ''}`
    );
    const match = haystack.match(VISIT_TYPE_RE);
    if (!match) continue;
    const token = match[1].toLowerCase();
    if (/konsult/i.test(token)) return 'consultation';
    if (/uppf|kontroll/i.test(token)) return 'followup';
    if (/prp/i.test(token)) return 'prp';
    if (/fue|dhi|op|microneedling/i.test(token)) return 'operation';
  }
  return 'unknown';
}

function resolveDateConfidence(file, visitDate) {
  const reasons = [];
  if (!visitDate) {
    reasons.push('missing_visit_date');
    return { confidence: 'low', reasons };
  }
  if (
    file?.renderAsClear === false ||
    file?.assetStatus === 'MIGRATION_INDEX_UNVERIFIED' ||
    file?.migrationIndexBinding === 'unlinked' ||
    file?.migrationIndexBinding === 'native_unverified'
  ) {
    if (!reasons.includes('migration_index_unverified')) {
      reasons.push('migration_index_unverified');
    }
    return { confidence: 'medium', reasons };
  }
  if (file?.captureDateMismatch) {
    reasons.push('capture_document_date_mismatch');
  }
  const source = normalizeText(file?.timelineDateSource || file?.captureDateSource);
  if (source.includes('captureDateTime') || normalizeTimelineDateTime(file?.captureDateTime)) {
    return { confidence: reasons.length ? 'medium' : 'high', reasons };
  }
  if (source.includes('captureDate') || isIsoDate(file?.captureDate)) {
    return { confidence: reasons.length ? 'medium' : 'high', reasons };
  }
  if (source.includes('documentDate') || isIsoDate(file?.documentDate)) {
    const docOnlyWithoutTime =
      !isImageLikeFile(file) &&
      !resolveTakenAt(file) &&
      !normalizeTimelineDateTime(file?.captureDateTime);
    if (docOnlyWithoutTime) {
      if (!reasons.includes('date_without_time_metadata')) {
        reasons.push('date_without_time_metadata');
      }
      return { confidence: 'medium', reasons };
    }
    return { confidence: reasons.length ? 'medium' : 'high', reasons };
  }
  if (file?.occasionContext?.timelineKey === visitDate) {
    if (!reasons.includes('occasion_context_only')) {
      reasons.push('occasion_context_only');
    }
    return { confidence: 'medium', reasons };
  }
  if (resolveSortKey(file).endsWith('T00:00:00')) {
    reasons.push('date_without_time_metadata');
    return { confidence: 'medium', reasons };
  }
  reasons.push('inferred_from_path_or_filename');
  return { confidence: 'low', reasons };
}

function needsReviewBucket(file, visitDate) {
  const { confidence, reasons } = resolveDateConfidence(file, visitDate);
  return confidence === 'low' && reasons.includes('inferred_from_path_or_filename');
}

function minutesFromMidnight(isoDateTime) {
  const normalized = normalizeTimelineDateTime(isoDateTime);
  const match = normalized.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function clusterImagesByTime(images) {
  const timed = images
    .map((file) => ({
      file,
      takenAt: resolveTakenAt(file),
      minutes: minutesFromMidnight(resolveTakenAt(file)),
    }))
    .filter((row) => row.minutes !== null && row.takenAt && !row.takenAt.endsWith('T00:00:00'));

  if (timed.length < 2) {
    return [{ clusterIndex: 0, files: images, timed: timed.length >= 1 }];
  }

  timed.sort((a, b) => a.minutes - b.minutes);
  const clusters = [[timed[0].file]];
  let lastMinutes = timed[0].minutes;
  for (let i = 1; i < timed.length; i += 1) {
    if (timed[i].minutes - lastMinutes >= TIME_CLUSTER_GAP_MINUTES) {
      clusters.push([]);
    }
    clusters[clusters.length - 1].push(timed[i].file);
    lastMinutes = timed[i].minutes;
  }

  if (clusters.length === 1) {
    return [{ clusterIndex: 0, files: images, timed: true }];
  }

  const assigned = new Set();
  const output = clusters.map((files, clusterIndex) => {
    files.forEach((file) => assigned.add(file));
    return { clusterIndex, files, timed: true };
  });

  const untimed = images.filter((file) => !assigned.has(file));
  if (untimed.length) {
    output[0].files = [...output[0].files, ...untimed];
  }
  return output;
}

function buildTimeRange(files = []) {
  const labels = files
    .map((file) => formatTimeLabel(resolveTakenAt(file)))
    .filter(Boolean)
    .sort();
  if (!labels.length) return '';
  if (labels.length === 1) return labels[0];
  return `${labels[0]}–${labels[labels.length - 1]}`;
}

function weakenConfidence(current, next) {
  const rank = { high: 3, medium: 2, low: 1 };
  return (rank[next] || 0) < (rank[current] || 0) ? next : current;
}

function mergeReasons(target, source) {
  for (const reason of asArray(source)) {
    if (reason && !target.includes(reason)) target.push(reason);
  }
}

/** medium/low segments must never ship with an empty reasons array. */
function ensureSegmentReasons(
  confidence,
  reasons,
  { images = [], documents = [], timeRange = '' } = {}
) {
  if (confidence === 'high' || reasons.length > 0) return;
  if (images.length === 0 && documents.length > 0 && !normalizeText(timeRange)) {
    reasons.push('date_without_time_metadata');
    return;
  }
  reasons.push('occasion_context_only');
}

function buildImageEntry(file) {
  const takenAt = resolveTakenAt(file);
  const assetId = normalizeText(file?.assetId || file?.id) || null;
  const selectedFor = asArray(file?.selectedFor).map(normalizeText).filter(Boolean).slice(0, 12);
  return {
    assetId,
    encounterId: normalizeText(file?.encounterId) || null,
    takenAt: takenAt || null,
    timeLabel: formatTimeLabel(takenAt),
    fileName:
      normalizeText(file?.displayName || file?.fileName || file?.originalFileName || file?.name) ||
      'Fil',
    thumbnailUrl: normalizeText(file?.thumbnailUrl || file?.thumbnailLink) || null,
    openRef: normalizeText(file?.viewUrl) || null,
    imageStage: normalizeText(file?.imageStage) || null,
    imageType: normalizeText(file?.imageType) || null,
    sourceAnnotationId: normalizeText(file?.sourceAnnotationId) || null,
    selectedFor,
    offerReady: Boolean(file?.offerReady),
  };
}

function buildVideoEntry(file) {
  return {
    ...buildImageEntry(file),
    mimeType: normalizeText(file?.mimeType || file?.contentType) || 'video/mp4',
    fileSize: Number.isFinite(Number(file?.fileSize)) ? Number(file.fileSize) : null,
    durationSeconds: Number.isFinite(Number(file?.durationSeconds))
      ? Number(file.durationSeconds)
      : null,
    uploadedAt: normalizeText(file?.uploadedAt) || null,
  };
}

function resolveJournalDate(entry) {
  for (const value of [entry?.signedAt, entry?.updatedAt, entry?.createdAt]) {
    const date = normalizeText(value).slice(0, 10);
    if (isIsoDate(date)) return date;
  }
  return '';
}

function collectJournalNoteLines(fields, prefix = '', lines = []) {
  if (!fields || typeof fields !== 'object' || lines.length >= 100) return lines;
  for (const [key, value] of Object.entries(fields)) {
    const label = prefix ? `${prefix} · ${key}` : key;
    if (value && typeof value === 'object') {
      collectJournalNoteLines(value, label, lines);
      continue;
    }
    if (!/(note|anteck|notering|comment|bed[oö]m|assessment|summary|sammanfatt|plan)/i.test(key)) {
      continue;
    }
    const text = Array.isArray(value)
      ? value.map(normalizeText).filter(Boolean).join(', ')
      : normalizeText(value);
    if (text) lines.push({ label, text });
  }
  return lines;
}

function buildJournalEntry(entry) {
  return {
    entryId: normalizeText(entry?.entryId) || null,
    encounterId: normalizeText(entry?.treatmentEncounterId || entry?.encounterId) || null,
    date: resolveJournalDate(entry) || null,
    title:
      normalizeText(
        repairMojibakeFilename(entry?.displayName || entry?.title || entry?.journalType)
      ) || 'Journalanteckning',
    journalType: normalizeText(entry?.journalType) || null,
    status: normalizeText(entry?.status) || 'draft',
    locked: Boolean(entry?.locked),
    canEdit: entry?.canEdit !== false && !entry?.locked,
    visibility: normalizeText(entry?.visibility) || 'shared',
    notes: collectJournalNoteLines(entry?.fields),
  };
}

function buildJournalPhotoEntry(attachment, journal) {
  const photoId = normalizeText(attachment?.photoId);
  if (!photoId) return null;
  const takenAt = normalizeTimelineDateTime(
    attachment?.capturedAt || attachment?.storedAt || journal?.date
  );
  return {
    assetId: null,
    journalPhotoId: photoId,
    encounterId: journal?.encounterId || null,
    documentDate: journal?.date || (takenAt ? takenAt.slice(0, 10) : null),
    takenAt: takenAt || null,
    timeLabel: formatTimeLabel(takenAt),
    fileName:
      normalizeText(attachment?.displayName || attachment?.fileName || attachment?.label) ||
      'Journalbild',
    imageType: normalizeText(attachment?.photoPhase) || 'journal_photo',
    imageStage: normalizeText(attachment?.photoPhase) || null,
    openRef: null,
    source: 'journal_photo',
  };
}

function resolveStartsAt(value = {}) {
  return normalizeTimelineDateTime(
    value?.startsAt || value?.startAt || value?.scheduledAt || value?.date
  );
}

function buildBookingEntry(booking) {
  const startsAt = resolveStartsAt(booking);
  return {
    bookingId: normalizeText(booking?.bookingId || booking?.id) || null,
    patientId: normalizeText(booking?.patientId) || null,
    encounterId: normalizeText(booking?.encounterId || booking?.treatmentEncounterId) || null,
    startsAt: startsAt || null,
    endsAt: normalizeTimelineDateTime(booking?.endsAt || booking?.endAt) || null,
    title:
      normalizeText(booking?.serviceLabel || booking?.serviceName || booking?.title) || 'Bokning',
    status: normalizeText(booking?.status) || 'confirmed',
    resourceLabel: normalizeText(booking?.resourceLabel || booking?.staff) || null,
    locationLabel:
      normalizeText(booking?.locationLabel || booking?.locationName || booking?.roomLabel) || null,
    notes: normalizeText(booking?.notes || booking?.note) || null,
    bookingNotes: normalizeText(booking?.bookingNotes) || null,
    customerMessage: normalizeText(booking?.customerMessage) || null,
    internalNotes: normalizeText(booking?.internalNotes) || null,
    treatmentNotes: normalizeText(booking?.treatmentNotes) || null,
  };
}

function buildDocumentEntry(file) {
  const assetId = normalizeText(file?.assetId || file?.id) || null;
  const documentDate = resolveDocumentDate(file);
  return {
    assetId,
    documentDate: documentDate || null,
    fileName:
      normalizeText(file?.displayName || file?.fileName || file?.originalFileName || file?.name) ||
      'Dokument',
    type: normalizeText(file?.fileType || file?.category) || 'document',
    fileSize: Number.isFinite(Number(file?.fileSize)) ? Number(file.fileSize) : null,
    openRef: normalizeText(file?.viewUrl) || null,
    dateBindingUncertain: Boolean(file?.captureDateMismatch) || !isIsoDate(documentDate),
  };
}

function compareImagesByTimeAsc(a, b) {
  const aKey = resolveTakenAt(a) || resolveSortKey(a) || '';
  const bKey = resolveTakenAt(b) || resolveSortKey(b) || '';
  if (aKey !== bKey) return aKey.localeCompare(bKey);
  return normalizeText(a?.fileName).localeCompare(normalizeText(b?.fileName));
}

function compareDocumentsByDateAsc(a, b) {
  const aDate = resolveDocumentDate(a) || '';
  const bDate = resolveDocumentDate(b) || '';
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  return normalizeText(a?.fileName).localeCompare(normalizeText(b?.fileName));
}

function finalizeSegment({ date, label, files, clusterIndex = 0, clusterCount = 1 }) {
  const media = files.filter(isImageLikeFile).sort(compareImagesByTimeAsc);
  const videos = media.filter(isVideoLikeFile);
  const images = media.filter((file) => !isVideoLikeFile(file));
  const documents = files.filter((file) => !isImageLikeFile(file)).sort(compareDocumentsByDateAsc);
  const encounterIds = [
    ...new Set(files.map((file) => normalizeText(file?.encounterId)).filter(Boolean)),
  ];

  let confidence = 'high';
  const reasons = [];
  for (const file of files) {
    const fileDate = resolveVisitDate(file) || date;
    const resolved = resolveDateConfidence(file, fileDate);
    confidence = weakenConfidence(confidence, resolved.confidence);
    mergeReasons(reasons, resolved.reasons);
  }
  if (clusterCount > 1) reasons.push('same_day_time_cluster');
  if (documents.some((doc) => buildDocumentEntry(doc).dateBindingUncertain)) {
    reasons.push('uncertain_document_date_binding');
    confidence = weakenConfidence(confidence, 'medium');
  }

  const visitType = inferVisitTypeFromFiles(files);
  const timeRange = buildTimeRange(media);
  ensureSegmentReasons(confidence, reasons, { images, documents, timeRange });

  return {
    date: date || null,
    label,
    timeRange,
    visitType,
    confidence,
    reasons,
    encounterId: encounterIds.length === 1 ? encounterIds[0] : null,
    clusterIndex,
    images: images.map(buildImageEntry),
    videos: videos.map(buildVideoEntry),
    journals: [],
    booking: null,
    encounter: null,
    documents: documents.map((doc) => {
      const entry = buildDocumentEntry(doc);
      const { dateBindingUncertain, ...rest } = entry;
      if (dateBindingUncertain) {
        if (!reasons.includes('uncertain_document_date_binding')) {
          reasons.push('uncertain_document_date_binding');
        }
      }
      return rest;
    }),
    sortKey: date ? `${date}T${timeRange.split('–')[0] || '00:00'}:00` : '0000-00-00T00:00:00',
  };
}

function createEmptyVisitRoom({ date, startsAt = '', encounterId = null, visitType = 'unknown' }) {
  const segment = finalizeSegment({
    date: date || null,
    label: formatSegmentLabel(date),
    files: [],
  });
  const timeLabel = formatTimeLabel(startsAt);
  segment.encounterId = encounterId || null;
  segment.visitType = visitType || 'unknown';
  segment.timeRange = timeLabel;
  segment.sortKey = date ? startsAt || `${date}T00:00:00` : '0000-00-00T00:00:00';
  return segment;
}

function seedEncounterRooms(segments, encounters) {
  for (const encounter of asArray(encounters)) {
    const encounterId = normalizeText(encounter?.encounterId);
    const startsAt = resolveStartsAt(encounter);
    const date = startsAt.slice(0, 10);
    if (!encounterId && !isIsoDate(date)) continue;
    let target = encounterId
      ? segments.find((segment) => segment.encounterId === encounterId) || null
      : null;
    if (!target && isIsoDate(date)) {
      const candidates = segments.filter(
        (segment) => segment.date === date && !segment.encounterId && !segment.encounter
      );
      if (candidates.length === 1) target = candidates[0];
    }
    if (!target) {
      target = createEmptyVisitRoom({
        date: isIsoDate(date) ? date : null,
        startsAt,
        encounterId,
        visitType: mapEncounterTypeToVisitType(encounter?.encounterType),
      });
      segments.push(target);
    }
    if (!target.encounterId) target.encounterId = encounterId || null;
    if (target.visitType === 'unknown') {
      target.visitType = mapEncounterTypeToVisitType(encounter?.encounterType);
    }
    target.encounter = {
      encounterId: encounterId || null,
      bookingId: normalizeText(encounter?.bookingId) || null,
      startsAt: startsAt || null,
      endsAt: normalizeTimelineDateTime(encounter?.endsAt) || null,
      serviceLabel: normalizeText(encounter?.serviceLabel) || null,
      status: normalizeText(encounter?.status) || 'reserved',
    };
  }
}

function seedBookingRooms(segments, bookings) {
  for (const rawBooking of asArray(bookings)) {
    const booking = buildBookingEntry(rawBooking);
    const date = normalizeText(booking.startsAt).slice(0, 10);
    if (!isIsoDate(date)) continue;
    let target = booking.bookingId
      ? segments.find(
          (segment) =>
            segment.booking?.bookingId === booking.bookingId ||
            segment.encounter?.bookingId === booking.bookingId
        ) || null
      : null;
    if (!target && booking.encounterId) {
      target = segments.find((segment) => segment.encounterId === booking.encounterId) || null;
    }
    if (!target) {
      const timeLabel = formatTimeLabel(booking.startsAt);
      const candidates = segments.filter(
        (segment) =>
          segment.date === date &&
          !segment.booking &&
          (!timeLabel || !segment.timeRange || segment.timeRange.startsWith(timeLabel))
      );
      if (candidates.length === 1) target = candidates[0];
    }
    if (!target) {
      target = createEmptyVisitRoom({
        date,
        startsAt: booking.startsAt,
        encounterId: booking.encounterId,
      });
      segments.push(target);
    }
    if (!target.encounterId && booking.encounterId) target.encounterId = booking.encounterId;
    target.booking = booking;
  }
}

function attachJournalsToSegments(segments, journalEntries) {
  const byDate = new Map();
  for (const segment of segments) {
    if (!segment.date) continue;
    if (!byDate.has(segment.date)) byDate.set(segment.date, []);
    byDate.get(segment.date).push(segment);
  }

  for (const rawEntry of asArray(journalEntries)) {
    const journal = buildJournalEntry(rawEntry);
    let target = null;
    if (journal.encounterId) {
      target = segments.find((segment) => segment.encounterId === journal.encounterId) || null;
    }
    if (!target && journal.date) {
      const sameDate = byDate.get(journal.date) || [];
      if (sameDate.length === 1) target = sameDate[0];
    }
    if (!target && (journal.encounterId || journal.date)) {
      target = createEmptyVisitRoom({
        date: journal.date,
        encounterId: journal.encounterId,
      });
      segments.push(target);
      if (journal.date) {
        if (!byDate.has(journal.date)) byDate.set(journal.date, []);
        byDate.get(journal.date).push(target);
      }
    }
    if (target) target.journals.push(journal);
    if (target) {
      for (const attachment of asArray(rawEntry?.attachments)) {
        if (normalizeText(attachment?.type) !== 'consultation_photo') continue;
        const image = buildJournalPhotoEntry(attachment, journal);
        if (!image) continue;
        if (!target.images.some((item) => item.journalPhotoId === image.journalPhotoId)) {
          target.images.push(image);
        }
      }
      target.images.sort((a, b) =>
        normalizeText(a?.takenAt).localeCompare(normalizeText(b?.takenAt))
      );
    }
  }
}

/**
 * Read-only visit segment builder for kundkort "Besök/tillfällen".
 * Uses the same date/file signals as existing patient card file payloads.
 */
function buildVisitSegments({
  driveFiles = [],
  journalEntries = [],
  bookings = [],
  encounters = [],
  customerId = '',
} = {}) {
  const datedGroups = new Map();
  const missingDateFiles = [];
  const reviewFiles = [];

  for (const file of asArray(driveFiles)) {
    const visitDate = resolveVisitDate(file);
    if (!visitDate) {
      missingDateFiles.push(file);
      continue;
    }
    if (needsReviewBucket(file, visitDate)) {
      reviewFiles.push(file);
      continue;
    }
    if (!datedGroups.has(visitDate)) datedGroups.set(visitDate, []);
    datedGroups.get(visitDate).push(file);
  }

  const segments = [];

  for (const [date, files] of datedGroups.entries()) {
    const images = files.filter(isImageLikeFile);
    const documents = files.filter((file) => !isImageLikeFile(file));
    const clusters = clusterImagesByTime(images);
    if (clusters.length <= 1) {
      segments.push(
        finalizeSegment({
          date,
          label: formatSegmentLabel(date),
          files,
        })
      );
      continue;
    }

    clusters.forEach((cluster, clusterIndex) => {
      const clusterFiles = [...cluster.files];
      if (clusterIndex === 0) {
        for (const doc of documents) {
          clusterFiles.push(doc);
        }
      } else if (documents.length) {
        clusterFiles.push(...documents);
        if (!clusterFiles.some((file) => !isImageLikeFile(file))) {
          // documents duplicated only when ambiguous — flagged in reasons below
        }
      }
      const segment = finalizeSegment({
        date,
        label: formatSegmentLabel(date),
        files: clusterFiles,
        clusterIndex,
        clusterCount: clusters.length,
      });
      if (documents.length) {
        segment.reasons.push('document_shared_across_same_day_clusters');
        segment.confidence = weakenConfidence(segment.confidence, 'medium');
      }
      segments.push(segment);
    });
  }

  if (missingDateFiles.length) {
    segments.push(
      finalizeSegment({
        date: null,
        label: 'Datum/tid saknas',
        files: missingDateFiles,
      })
    );
  }

  if (reviewFiles.length) {
    segments.push(
      finalizeSegment({
        date: null,
        label: 'Behöver granskning',
        files: reviewFiles,
      })
    );
  }

  seedEncounterRooms(segments, encounters);
  seedBookingRooms(segments, bookings);
  attachJournalsToSegments(segments, journalEntries);

  segments.sort((a, b) => {
    if (!a.date && b.date) return 1;
    if (a.date && !b.date) return -1;
    if (!a.date && !b.date) {
      return String(a.label).localeCompare(String(b.label), 'sv');
    }
    return String(b.sortKey || b.date).localeCompare(String(a.sortKey || a.date));
  });

  return {
    customerId: normalizeText(customerId),
    visitSegments: segments.map(({ sortKey, clusterIndex, ...segment }) => segment),
  };
}

module.exports = {
  buildVisitSegments,
  formatSegmentLabel,
  inferVisitTypeFromFiles,
  resolveVisitDate,
  resolveTakenAt,
  isImageLikeFile,
  isVideoLikeFile,
};
