'use strict';

/**
 * P0.3 — Kunder list/dossier enrichment: real segment rules + patient readout.
 * No mock counts; null/partial when data is missing.
 */

const path = require('node:path');
const { buildPatientCardReadout, derivePatientOrigin } = require('./ccoPatientMasterStore');

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function asArray(value) {
  return Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
}
function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

const MS_DAY = 24 * 60 * 60 * 1000;
const ACTIVE_DAYS = 180;
const DORMANT_DAYS = 365;
const VIP_DEAL_VALUE_MIN = 25_000;

const CALENDAR_SEGMENTS = new Set(['today_visits', 'this_week', 'waitlist', 'behandling']);

function daysSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / MS_DAY);
}

function parseDealValue(value) {
  const raw = normalizeText(value);
  if (!raw) return 0;
  const digits = raw.replace(/\s/g, '').replace(/[^\d]/g, '');
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function isVipPatient(patient) {
  const deals = asArray(asObject(patient.pipedrive).deals);
  return deals.some((deal) => {
    const v = parseDealValue(deal.value);
    const status = normalizeKey(deal.status);
    const stage = normalizeKey(deal.stage);
    if (stage.includes('vip')) return true;
    return status === 'won' && v >= VIP_DEAL_VALUE_MIN;
  });
}

function maskEmail(email) {
  const e = normalizeText(email);
  if (!e || !e.includes('@')) return null;
  const [user, domain] = e.split('@');
  if (!user || !domain) return null;
  const head = user.length <= 1 ? `${user[0] || '*'}***` : `${user.slice(0, 2)}***`;
  return `${head}@${domain}`;
}

function maskPhone(phone) {
  const p = normalizeText(phone);
  if (!p) return null;
  const digits = p.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

function emptyAssetSignals() {
  return {
    hasForm: false,
    hasAgreement: false,
    hasGetAccept: false,
    hasHalso: false,
    hasDriveJournalAsset: false,
    hasDriveDocumentAsset: false,
    hasPhoto: false,
    needsPhotoReview: false,
    needsClassification: false,
    needsEncounterReview: false,
    assetNeedsReview: false,
    assetCount: 0,
  };
}

/**
 * One pass over asset store items → per-patient signals (no PII in index).
 */
function buildAssetSignalsIndex(items = [], tenantId = null) {
  const index = new Map();
  for (const asset of asArray(items)) {
    if (tenantId && asset.tenantId && asset.tenantId !== tenantId) continue;
    const patientId = normalizeText(asset.patientId);
    if (!patientId || patientId === 'unknown') continue;

    let sig = index.get(patientId);
    if (!sig) {
      sig = emptyAssetSignals();
      index.set(patientId, sig);
    }
    sig.assetCount += 1;

    const cat = normalizeKey(asset.category);
    const status = normalizeKey(asset.status);
    const source = normalizeKey(asset.sourceSystem);

    if (cat === 'form') sig.hasForm = true;
    if (cat === 'agreement' || cat === 'consent') sig.hasAgreement = true;
    if (source === 'getaccept_import') sig.hasGetAccept = true;
    if (source === 'm365_halso') sig.hasHalso = true;
    if (cat === 'journal') sig.hasDriveJournalAsset = true;
    if (cat && cat !== 'journal' && cat !== 'other') sig.hasDriveDocumentAsset = true;

    if (status === 'needs_review') sig.assetNeedsReview = true;
    if (asset.photoReviewRequired) sig.needsPhotoReview = true;
    if (asset.importReviewRequired) sig.needsClassification = true;
    if (asset.encounterReviewRequired) sig.needsEncounterReview = true;
    if (/^photo_/.test(cat)) {
      sig.hasPhoto = true;
      if (status === 'needs_review') sig.needsPhotoReview = true;
    }
  }
  return index;
}

function getAssetSignals(index, patientId) {
  if (!index) return emptyAssetSignals();
  return index.get(patientId) || emptyAssetSignals();
}

function hasJournalFromPatient(patient) {
  const fs = asObject(patient.fileSummary);
  return Number(fs.journalPdfs) > 0;
}

function matchSegment(patient, segmentId, assetSignals) {
  const id = normalizeKey(segmentId);
  if (!id || id === 'all') return true;
  if (CALENDAR_SEGMENTS.has(id) || id === 'behandling') return false;

  const flags = new Set(asArray(patient.flags).map(normalizeKey));
  const fs = asObject(patient.fileSummary);
  const matchStatus = normalizeKey(patient.matchStatus);
  const origin = derivePatientOrigin(patient);
  const sig = assetSignals || emptyAssetSignals();
  const hasJournal = hasJournalFromPatient(patient);
  const updatedDays = daysSince(patient.updatedAt);

  switch (id) {
    case 'needs_review':
    case 'risk':
    case 'import_review':
      return matchStatus === 'needs_review' || flags.has('needs_review');
    case 'has_drive':
      return Number(fs.totalFiles) > 0;
    case 'has_drive_journal':
      return Number(fs.journalPdfs) > 0 || sig.hasDriveJournalAsset;
    case 'has_drive_document':
      return Number(fs.totalFiles) > Number(fs.journalPdfs) || sig.hasDriveDocumentAsset;
    case 'drive_only':
      return matchStatus === 'drive_only';
    case 'cliento_only':
      return matchStatus === 'cliento_only';
    case 'duplicate_email':
      return flags.has('duplicate_email');
    case 'missing_journal':
      return !hasJournal && !sig.hasDriveJournalAsset;
    case 'missing_form':
      return !sig.hasForm;
    case 'missing_encounter':
      return sig.needsEncounterReview;
    case 'has_form':
      return sig.hasForm;
    case 'getaccept':
      return sig.hasGetAccept;
    case 'halso':
      return sig.hasHalso;
    case 'photos_review':
      return sig.needsPhotoReview;
    case 'has_images':
      return Number(fs.images) > 0 || sig.hasPhoto;
    case 'active':
      return (
        hasJournal ||
        (updatedDays != null && updatedDays <= ACTIVE_DAYS) ||
        matchStatus === 'matched'
      );
    case 'new':
      return origin === 'new' || matchStatus === 'unmatched' || matchStatus === 'web_booking';
    case 'dormant':
      return updatedDays != null && updatedDays > DORMANT_DAYS && !hasJournal;
    case 'vip':
      return isVipPatient(patient);
    case 'mine':
      return false;
    default:
      return false;
  }
}

function computeNextStep(readout) {
  if (readout.reviewFlags?.includes('needs_review')) return 'Granska identitet/import';
  if (readout.needsPhotoReview) return 'Bilder behöver granskning';
  if (readout.needsClassification) return 'Klassificering saknas';
  if (readout.needsEncounterReview) return 'Encounter behöver granskning';
  if (readout.missingJournal) return 'Saknar journal i CCO';
  if (readout.missingForm) return 'Saknar formulär i assets';
  if (readout.missingAgreement && readout.hasJournal) return 'Saknar avtal/samtycke';
  if (readout.flags?.includes('missing_email')) return 'Saknar e-post';
  if (readout.flags?.includes('missing_phone')) return 'Saknar telefon';
  if (readout.hasUpcomingBooking) return 'Kommande bokning';
  return null;
}

function buildKunderReadout(patient, assetIndex = null) {
  const base = buildPatientCardReadout(patient);
  const sig = getAssetSignals(assetIndex, base.patientId);
  const fs = asObject(patient.fileSummary);
  const hasJournal = base.hasJournalHistory || sig.hasDriveJournalAsset;
  const reviewFlags = [];
  if (base.flags?.includes('needs_review')) reviewFlags.push('needs_review');
  if (sig.assetNeedsReview) reviewFlags.push('asset_needs_review');
  if (sig.needsPhotoReview) reviewFlags.push('photo_review');
  if (sig.needsClassification) reviewFlags.push('classification');
  if (sig.needsEncounterReview) reviewFlags.push('encounter_review');

  const readout = {
    ...base,
    phoneMasked: maskPhone(base.primaryPhone),
    emailMasked: maskEmail(base.primaryEmail),
    status: base.matchStatus,
    sourceSystem: patient.cliento
      ? 'cliento'
      : patient.drive
        ? 'drive'
        : patient.pipedrive
          ? 'pipedrive'
          : null,
    importFlags: asArray(patient.flags).filter((f) =>
      ['needs_review', 'drive_only', 'cliento_only', 'duplicate_email'].includes(f)
    ),
    hasJournal,
    missingJournal: !hasJournal,
    hasForm: sig.hasForm,
    missingForm: !sig.hasForm,
    hasAgreement: sig.hasAgreement,
    missingAgreement: hasJournal && !sig.hasAgreement,
    hasHalso: sig.hasHalso,
    hasGetAccept: sig.hasGetAccept,
    hasDriveJournal: Number(fs.journalPdfs) > 0 || sig.hasDriveJournalAsset,
    hasDriveDocument: Number(fs.totalFiles) > Number(fs.journalPdfs) || sig.hasDriveDocumentAsset,
    needsPhotoReview: sig.needsPhotoReview,
    needsClassification: sig.needsClassification,
    needsEncounterReview: sig.needsEncounterReview,
    hasUpcomingBooking: null,
    lastVisitAt: null,
    lastEncounterAt: null,
    treatmentTypes: [],
    reviewFlags,
    paymentStatus: null,
    nextRequirement: null,
    nextStep: null,
    assetCount: sig.assetCount,
    isVip: isVipPatient(patient),
    segmentHints: {
      active: matchSegment(patient, 'active', sig),
      dormant: matchSegment(patient, 'dormant', sig),
      new: matchSegment(patient, 'new', sig),
    },
  };
  readout.nextStep = computeNextStep(readout);
  readout.nextRequirement = readout.nextStep;
  return readout;
}

const SEGMENT_CATALOG = [
  { id: 'all', label: 'Alla kunder', status: 'real', filterQuery: {} },
  {
    id: 'mine',
    label: 'Mina kunder',
    status: 'disabled',
    reason: 'Ägare per rad saknas (P1)',
    filterQuery: null,
  },
  {
    id: 'today_visits',
    label: 'Idag · besöker',
    status: 'disabled',
    reason: 'Kopplas i Kalender P0.4',
    filterQuery: null,
  },
  {
    id: 'this_week',
    label: 'Denna vecka',
    status: 'disabled',
    reason: 'Kopplas i Kalender P0.4',
    filterQuery: null,
  },
  {
    id: 'waitlist',
    label: 'Väntelista',
    status: 'disabled',
    reason: 'Kopplas i Kalender P0.4',
    filterQuery: null,
  },
  {
    id: 'behandling',
    label: 'Behandling',
    status: 'disabled',
    reason: 'Kopplas i Kalender P0.4',
    filterQuery: null,
  },
  { id: 'active', label: 'Aktiva', status: 'real', filterQuery: { segment: 'active' } },
  { id: 'vip', label: 'VIP', status: 'real', filterQuery: { segment: 'vip' } },
  { id: 'risk', label: 'Risk', status: 'real', filterQuery: { segment: 'risk' } },
  { id: 'new', label: 'Nya', status: 'real', filterQuery: { segment: 'new' } },
  { id: 'dormant', label: 'Dormant', status: 'real', filterQuery: { segment: 'dormant' } },
  {
    id: 'missing_form',
    label: 'Saknar formulär',
    status: 'real',
    filterQuery: { segment: 'missing_form' },
  },
  {
    id: 'missing_journal',
    label: 'Saknar journal',
    status: 'real',
    filterQuery: { segment: 'missing_journal' },
  },
  {
    id: 'missing_encounter',
    label: 'Saknar encounter',
    status: 'partial',
    reason: 'Endast assets med encounterReviewRequired',
    filterQuery: { segment: 'missing_encounter' },
  },
  {
    id: 'needs_review',
    label: 'Granska / import',
    status: 'real',
    filterQuery: { segment: 'needs_review' },
  },
  {
    id: 'has_drive',
    label: 'Drive-filer',
    status: 'real',
    filterQuery: { flags: 'has_drive_files' },
  },
  {
    id: 'has_drive_journal',
    label: 'Har Drive journal',
    status: 'real',
    filterQuery: { segment: 'has_drive_journal' },
  },
  {
    id: 'has_drive_document',
    label: 'Har Drive dokument',
    status: 'real',
    filterQuery: { segment: 'has_drive_document' },
  },
  { id: 'drive_only', label: 'Drive only', status: 'real', filterQuery: { flags: 'drive_only' } },
  {
    id: 'cliento_only',
    label: 'Cliento only',
    status: 'real',
    filterQuery: { flags: 'cliento_only' },
  },
  {
    id: 'duplicate_email',
    label: 'Dubblett e-post',
    status: 'real',
    filterQuery: { flags: 'duplicate_email' },
  },
  { id: 'getaccept', label: 'GetAccept', status: 'real', filterQuery: { segment: 'getaccept' } },
  { id: 'halso', label: 'halso@', status: 'real', filterQuery: { segment: 'halso' } },
  {
    id: 'photos_review',
    label: 'Bild-review',
    status: 'real',
    filterQuery: { segment: 'photos_review' },
  },
  { id: 'has_images', label: 'Har bilder', status: 'real', filterQuery: { segment: 'has_images' } },
  {
    id: 'import_review',
    label: 'Import review',
    status: 'real',
    filterQuery: { segment: 'import_review' },
  },
];

function computeSegmentStats(patients, assetIndex) {
  const counts = Object.fromEntries(SEGMENT_CATALOG.map((s) => [s.id, 0]));
  let withJournal = 0;
  let missingJournal = 0;
  let withForm = 0;
  let missingForm = 0;
  let needsReviewPatients = 0;
  let photoReviewPending = 0;
  let assetReviewPending = 0;

  for (const patient of patients) {
    const sig = getAssetSignals(assetIndex, patient.id);
    if (hasJournalFromPatient(patient) || sig.hasDriveJournalAsset) withJournal += 1;
    else missingJournal += 1;
    if (sig.hasForm) withForm += 1;
    else missingForm += 1;
    if (
      normalizeKey(patient.matchStatus) === 'needs_review' ||
      asArray(patient.flags).includes('needs_review')
    ) {
      needsReviewPatients += 1;
    }
    if (sig.needsPhotoReview) photoReviewPending += 1;
    if (sig.assetNeedsReview) assetReviewPending += 1;

    for (const seg of SEGMENT_CATALOG) {
      if (seg.status === 'disabled') continue;
      if (matchSegment(patient, seg.id, sig)) counts[seg.id] += 1;
    }
  }

  const segments = SEGMENT_CATALOG.map((meta) => ({
    id: meta.id,
    label: meta.label,
    count: meta.status === 'disabled' ? null : (counts[meta.id] ?? 0),
    status: meta.status,
    reason: meta.reason || null,
    filterQuery: meta.filterQuery,
  }));

  return {
    segments,
    panel: {
      withJournal,
      missingJournal,
      withForm,
      missingForm,
      needsReviewPatients,
      photoReviewPending,
      assetReviewPending,
      totalPatients: patients.length,
    },
    counts,
  };
}

let assetStorePromise = null;

async function loadAssetSignalsIndex(config, tenantId) {
  try {
    const { createCcoPatientAssetStore } = require('./ccoPatientAssetStore');
    const filePath =
      config?.ccoPatientAssetsPath || path.join(process.cwd(), 'data', 'cco-patient-assets.json');
    if (!assetStorePromise) {
      assetStorePromise = createCcoPatientAssetStore({ filePath });
    }
    const store = await assetStorePromise;
    const items =
      typeof store.listItemsForEnrichment === 'function'
        ? store.listItemsForEnrichment(tenantId)
        : [];
    return buildAssetSignalsIndex(items, tenantId);
  } catch {
    return new Map();
  }
}

function filterPatientsBySegment(patients, segmentId, assetIndex) {
  const id = normalizeKey(segmentId);
  if (!id || id === 'all') return patients;
  const meta = SEGMENT_CATALOG.find((s) => s.id === id);
  if (!meta || meta.status === 'disabled') return [];
  return patients.filter((p) => matchSegment(p, id, getAssetSignals(assetIndex, p.id)));
}

module.exports = {
  SEGMENT_CATALOG,
  buildAssetSignalsIndex,
  buildKunderReadout,
  computeSegmentStats,
  filterPatientsBySegment,
  loadAssetSignalsIndex,
  matchSegment,
  maskEmail,
  maskPhone,
};
