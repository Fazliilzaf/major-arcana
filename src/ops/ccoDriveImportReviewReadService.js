'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PHOTO_CATEGORIES = new Set(['photo_before', 'photo_during', 'photo_after']);

const MATCH_GROUND_LABELS = {
  needs_photo_review: 'Migreringspolicy — foto kräver manuell granskning',
  needs_classification: 'Dokument kräver klassificering',
  needs_encounter_review: 'Encounter-koppling saknas',
  drive_folder_owner: 'Drive-mappägare (folder owner)',
  patient_folder_match: 'Patientmapp-match',
  ambiguous_folder_match: 'Osäker mappmatch',
  personnummer_in_path: 'Personnummer i sökväg',
  no_patient_match: 'Ingen patientmatch',
  unknown: 'Okänd matchningsgrund',
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractClinicYear(relativePath = '') {
  const text = normalizeText(relativePath).replace(/\\/g, '/');
  const clinicMatch = text.match(/hair tp clinic\s+(20\d{2})/i);
  if (clinicMatch) return clinicMatch[1];
  const yearMatch = text.match(/\b(20\d{2})\b/);
  return yearMatch ? yearMatch[1] : 'unknown';
}

function classifyFileFromPath(relativePath = '') {
  const lower = normalizeText(relativePath).toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic|dng|cr2|raw|tif|tiff)$/.test(lower)) return 'image';
  if (/\.pdf$/.test(lower)) return /journal/i.test(lower) ? 'journal_pdf' : 'document_pdf';
  if (/\.(doc|docx)$/.test(lower)) return 'document';
  return 'document';
}

function resolveAssetsPath(dataRoot) {
  const candidates = [
    process.env.ARCANA_CCO_PATIENT_ASSETS_PATH,
    path.join(dataRoot, 'cco-patient-assets.json'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(dataRoot, 'cco-patient-assets.json');
}

function resolveCustomersPath(dataRoot) {
  const candidates = [
    process.env.ARCANA_CCO_CUSTOMERS_PATH,
    path.join(dataRoot, 'cco-customers.json'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(dataRoot, 'cco-customers.json');
}

function resolvePatientMasterPath(dataRoot) {
  const candidates = [
    process.env.ARCANA_CCO_PATIENT_MASTER_STORE_PATH,
    path.join(dataRoot, 'cco-patient-master.json'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(dataRoot, 'cco-patient-master.json');
}

function loadCustomerDirectory(dataRoot) {
  const customersPath = resolveCustomersPath(dataRoot);
  if (!fs.existsSync(customersPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(customersPath, 'utf8'));
    return raw?.tenants?.hair_tp?.customerState?.directory || {};
  } catch {
    return {};
  }
}

function loadPatientMasterBucket(dataRoot, tenantId = 'hair_tp') {
  const masterPath = resolvePatientMasterPath(dataRoot);
  if (!fs.existsSync(masterPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
    const tenants = raw?.tenants || {};
    if (tenants[tenantId]) return tenants[tenantId];
    for (const key of ['hair_tp', 'hair-tp-clinic', 'hairtpclinic']) {
      if (tenants[key]) return tenants[key];
    }
    const first = Object.values(tenants)[0];
    return first || null;
  } catch {
    return null;
  }
}

function loadAllPatientMasterBuckets(dataRoot) {
  const masterPath = resolvePatientMasterPath(dataRoot);
  if (!fs.existsSync(masterPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
    return Object.values(raw?.tenants || {});
  } catch {
    return [];
  }
}

function patientExistsInMasterBucket(patientId, masterBucket) {
  if (!masterBucket) return false;
  const pid = normalizeText(patientId);
  if (!pid) return false;
  if (masterBucket._indexes?.patientById?.[pid] !== undefined) return true;
  const patients = Array.isArray(masterBucket.patients) ? masterBucket.patients : [];
  return patients.some((row) => {
    const candidates = [row?.id, row?.clientoId, row?.meridiqId, row?.ccoId, row?.masterPatientId];
    return candidates.some((value) => normalizeText(value) === pid);
  });
}

function patientExistsInRegistry(
  patientId,
  { directory = {}, masterBucket = null, masterBuckets = null } = {}
) {
  const pid = normalizeText(patientId);
  if (!pid || pid === 'unknown') return false;
  if (directory[pid]) return true;
  const buckets = masterBuckets || (masterBucket ? [masterBucket] : []);
  return buckets.some((bucket) => patientExistsInMasterBucket(pid, bucket));
}

function resolvePatientLabel(patientId, directory, masterBucket = null) {
  const pid = normalizeText(patientId);
  if (!pid) return null;
  const row = directory[pid] || null;
  const nameFromDirectory =
    normalizeText(row?.displayName) ||
    normalizeText(row?.name) ||
    [normalizeText(row?.firstName), normalizeText(row?.lastName)].filter(Boolean).join(' ');
  if (nameFromDirectory) {
    return { patientId: pid, patientLabel: nameFromDirectory };
  }
  if (masterBucket) {
    const idx = masterBucket._indexes?.patientById?.[pid];
    const fromIndex =
      Number.isInteger(idx) && masterBucket.patients?.[idx] ? masterBucket.patients[idx] : null;
    const masterRow =
      fromIndex ||
      masterBucket.patients?.find((p) =>
        [p?.id, p?.clientoId, p?.meridiqId, p?.ccoId].some((v) => normalizeText(v) === pid)
      ) ||
      null;
    const masterName =
      normalizeText(masterRow?.displayName) ||
      normalizeText(masterRow?.name) ||
      [normalizeText(masterRow?.firstName), normalizeText(masterRow?.lastName)]
        .filter(Boolean)
        .join(' ');
    if (masterName) return { patientId: pid, patientLabel: masterName };
  }
  return {
    patientId: pid,
    patientLabel: pid,
  };
}

function deriveMatchGround(asset) {
  const historyReason = normalizeText(asset?.statusHistory?.at(-1)?.reason);
  if (historyReason) return historyReason;
  if (asset?.technicalInfo?.needsPhotoReview) return 'needs_photo_review';
  if (asset?.technicalInfo?.needsClassification) return 'needs_classification';
  if (asset?.technicalInfo?.needsEncounterReview) return 'needs_encounter_review';
  if (!normalizeText(asset?.patientId)) return 'no_patient_match';
  if (asset?.confidence === 'medium') return 'drive_folder_owner';
  if (asset?.confidence === 'high') return 'patient_folder_match';
  return 'unknown';
}

function mediaKind(asset) {
  const mime = normalizeText(asset?.mimeType).toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (PHOTO_CATEGORIES.has(asset?.category)) return 'image';
  return 'document';
}

function resolveFileType(asset) {
  const mime = normalizeText(asset?.mimeType).toLowerCase();
  const fromPath = classifyFileFromPath(asset?.originalDrivePath || asset?.originalFileName || '');
  if (PHOTO_CATEGORIES.has(asset?.category)) return asset.category;
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') {
    return /journal/i.test(asset?.originalFileName || '') ? 'journal_pdf' : 'document_pdf';
  }
  if (fromPath && fromPath !== 'document') return fromPath;
  return asset?.category || fromPath || 'document';
}

function resolveDisplayDate(asset) {
  return (
    normalizeText(asset?.documentDate) ||
    normalizeText(asset?.captureDate) ||
    normalizeText(asset?.importedAt)?.slice(0, 10) ||
    null
  );
}

function resolveArchiveYear(asset) {
  const fromPath = extractClinicYear(asset?.originalDrivePath || '');
  if (fromPath && fromPath !== 'unknown') return fromPath;
  const date = resolveDisplayDate(asset);
  if (date && /^\d{4}/.test(date)) return date.slice(0, 4);
  return 'unknown';
}

function isDriveNeedsReviewAsset(asset) {
  return (
    asset && asset.status === 'NEEDS_REVIEW' && normalizeText(asset.sourceSystem) === 'drive_import'
  );
}

function isLegacyDriveDuplicateAsset(asset) {
  if (!asset || normalizeText(asset.sourceSystem) !== 'drive_import') return false;
  if (asset.status === 'DUPLICATE') return false;
  if (asset.status !== 'REJECTED') return false;
  const info = asset.technicalInfo || {};
  return info.markedDuplicate === true || normalizeText(asset.reviewReason) === 'marked_duplicate';
}

function countLegacyDriveDuplicates(dataRoot) {
  const assetsPath = resolveAssetsPath(dataRoot);
  if (!fs.existsSync(assetsPath)) return 0;
  const raw = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
  return Object.values(raw.items || {}).filter(isLegacyDriveDuplicateAsset).length;
}

function buildCustomerCardHref(patientId) {
  const pid = normalizeText(patientId);
  if (!pid) return null;
  return `/major-arcana-preview/?view=customers&patientId=${encodeURIComponent(pid)}`;
}

function mapItemForUi(asset, directory, masterBucket = null) {
  const matchGround = deriveMatchGround(asset);
  const patient = resolvePatientLabel(asset.patientId, directory, masterBucket);
  return {
    assetId: asset.id,
    driveFileId: asset.originalDriveFileId || null,
    status: asset.status,
    fileName: asset.originalFileName || null,
    fileType: resolveFileType(asset),
    mediaKind: mediaKind(asset),
    date: resolveDisplayDate(asset),
    archiveYear: resolveArchiveYear(asset),
    drivePath: asset.originalDrivePath || null,
    suggestedPatientId: patient?.patientId || null,
    suggestedPatientLabel: patient?.patientLabel || null,
    confidence: asset.confidence || 'unknown',
    matchGround,
    matchGroundLabel: MATCH_GROUND_LABELS[matchGround] || matchGround,
    category: asset.category || null,
    mimeType: asset.mimeType || null,
    importedAt: asset.importedAt || null,
    importRunId: asset.importRunId || null,
    customerCardHref: buildCustomerCardHref(asset.patientId),
    readOnly: true,
  };
}

function matchesFilters(item, filters) {
  if (filters.year && filters.year !== 'all' && item.archiveYear !== filters.year) return false;
  if (filters.mediaKind && filters.mediaKind !== 'all' && item.mediaKind !== filters.mediaKind) {
    return false;
  }
  if (filters.fileType && filters.fileType !== 'all' && item.fileType !== filters.fileType) {
    return false;
  }
  if (
    filters.confidence &&
    filters.confidence !== 'all' &&
    item.confidence !== filters.confidence
  ) {
    return false;
  }
  if (
    filters.matchGround &&
    filters.matchGround !== 'all' &&
    item.matchGround !== filters.matchGround
  ) {
    return false;
  }
  if (filters.patientId) {
    const needle = filters.patientId.toLowerCase();
    const hay =
      `${item.suggestedPatientId || ''} ${item.suggestedPatientLabel || ''}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const hay = [
      item.fileName,
      item.drivePath,
      item.assetId,
      item.driveFileId,
      item.suggestedPatientLabel,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

let indexCache = null;

function buildIndex(dataRoot) {
  const assetsPath = resolveAssetsPath(dataRoot);
  if (
    indexCache?.assetsPath === assetsPath &&
    indexCache?.mtime === fs.statSync(assetsPath).mtimeMs
  ) {
    return indexCache;
  }

  const raw = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
  const directory = loadCustomerDirectory(dataRoot);
  const masterBucket = loadPatientMasterBucket(dataRoot);
  const items = Object.values(raw.items || {})
    .filter(isDriveNeedsReviewAsset)
    .map((asset) => mapItemForUi(asset, directory, masterBucket));

  const facets = {
    years: {},
    fileTypes: {},
    confidences: {},
    matchGrounds: {},
    mediaKinds: { document: 0, image: 0 },
  };
  for (const item of items) {
    facets.years[item.archiveYear] = (facets.years[item.archiveYear] || 0) + 1;
    facets.fileTypes[item.fileType] = (facets.fileTypes[item.fileType] || 0) + 1;
    facets.confidences[item.confidence] = (facets.confidences[item.confidence] || 0) + 1;
    facets.matchGrounds[item.matchGround] = (facets.matchGrounds[item.matchGround] || 0) + 1;
    facets.mediaKinds[item.mediaKind] = (facets.mediaKinds[item.mediaKind] || 0) + 1;
  }

  indexCache = {
    assetsPath,
    mtime: fs.statSync(assetsPath).mtimeMs,
    loadedAt: new Date().toISOString(),
    total: items.length,
    items,
    facets,
  };
  return indexCache;
}

function loadSummary(dataRoot, { writeEnabled = false } = {}) {
  const idx = buildIndex(dataRoot);
  return {
    generatedAt: new Date().toISOString(),
    phase: writeEnabled ? 'R2_canary' : 'R1_readonly',
    writeEnabled,
    readOnly: !writeEnabled,
    totalNeedsReview: idx.total,
    legacyRejectedDuplicates: countLegacyDriveDuplicates(dataRoot),
    assetsPath: idx.assetsPath,
    loadedAt: idx.loadedAt,
    facets: idx.facets,
    rules: writeEnabled
      ? [
          'Canary — en fil i taget',
          'Approve / reassign / reject / markera dubblett',
          'Audit-logg per beslut',
          'Ingen fil flyttas, skrivs om eller raderas',
          'Drive-metadata bevaras',
          'Ingen batch-action',
        ]
      : [
          'Read-only — ingen statusändring',
          'Ingen flytt, radering eller auto-koppling',
          'Ingen batch-action',
          'Öppna kundkort är en länk — skriver ingen data',
        ],
  };
}

function listQueue(dataRoot, filters = {}, { writeEnabled = false } = {}) {
  const idx = buildIndex(dataRoot);
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
  const offset = Math.max(0, Number(filters.offset) || 0);
  const filtered = idx.items.filter((item) => matchesFilters(item, filters));
  const slice = filtered.slice(offset, offset + limit).map((item) => ({
    ...item,
    readOnly: !writeEnabled,
  }));
  return {
    total: filtered.length,
    offset,
    limit,
    filters: {
      year: filters.year || 'all',
      mediaKind: filters.mediaKind || 'all',
      fileType: filters.fileType || 'all',
      confidence: filters.confidence || 'all',
      matchGround: filters.matchGround || 'all',
      patientId: filters.patientId || '',
      q: filters.q || '',
    },
    items: slice,
    writeEnabled,
    readOnly: !writeEnabled,
  };
}

function invalidateDriveImportReviewCache() {
  indexCache = null;
}

module.exports = {
  MATCH_GROUND_LABELS,
  buildCustomerCardHref,
  deriveMatchGround,
  mediaKind,
  mapItemForUi,
  loadCustomerDirectory,
  loadPatientMasterBucket,
  loadAllPatientMasterBuckets,
  patientExistsInRegistry,
  loadSummary,
  listQueue,
  invalidateDriveImportReviewCache,
  isDriveNeedsReviewAsset,
  isLegacyDriveDuplicateAsset,
  countLegacyDriveDuplicates,
};
