'use strict';

const { extractFileOccasionContext } = require('../../scripts/migration/lib/migrationUtils');
const { normalizeTimelineDateTime, resolveTimelineSort } = require('./ccoAssetTimelineSort');
const { inferEncounterTypeFromAsset } = require('./ccoAssetNaming/encounterMapper');

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
    return { confidence: reasons.length ? 'medium' : 'high', reasons };
  }
  if (file?.occasionContext?.timelineKey === visitDate) {
    return { confidence: reasons.length ? 'medium' : 'medium', reasons };
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

function buildImageEntry(file) {
  const takenAt = resolveTakenAt(file);
  const assetId = normalizeText(file?.assetId || file?.id) || null;
  return {
    assetId,
    takenAt: takenAt || null,
    timeLabel: formatTimeLabel(takenAt),
    fileName: normalizeText(file?.fileName || file?.originalFileName || file?.name) || 'Fil',
    thumbnailUrl: normalizeText(file?.thumbnailUrl || file?.thumbnailLink) || null,
    openRef: normalizeText(file?.viewUrl) || null,
  };
}

function buildDocumentEntry(file) {
  const assetId = normalizeText(file?.assetId || file?.id) || null;
  const documentDate = resolveDocumentDate(file);
  return {
    assetId,
    documentDate: documentDate || null,
    fileName: normalizeText(file?.fileName || file?.originalFileName || file?.name) || 'Dokument',
    type: normalizeText(file?.fileType || file?.category) || 'document',
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
  const images = files.filter(isImageLikeFile).sort(compareImagesByTimeAsc);
  const documents = files.filter((file) => !isImageLikeFile(file)).sort(compareDocumentsByDateAsc);

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
  const timeRange = buildTimeRange(images);

  return {
    date: date || null,
    label,
    timeRange,
    visitType,
    confidence,
    reasons,
    clusterIndex,
    images: images.map(buildImageEntry),
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

/**
 * Read-only visit segment builder for kundkort "Besök/tillfällen".
 * Uses the same date/file signals as existing patient card file payloads.
 */
function buildVisitSegments({ driveFiles = [], customerId = '' } = {}) {
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
};
