'use strict';

/**
 * P0.3–P0.4 — Kunder enrichment: segments, assets, booking/calendar signals.
 */

const path = require('node:path');
const { buildPatientCardReadout, derivePatientOrigin } = require('./ccoPatientMasterStore');
const {
  TREATMENT_SEGMENT_DEFS,
  applyBookingToReadout,
  computeVisitTrendFromBundle,
  getBookingSignals,
  isBookingWithinDays,
  loadKunderBookingIndex,
  patientMatchesTreatmentSegment,
} = require('./ccoKunderBookingEnrichment');
const { applyFasAReadoutFields } = require('./ccoKunderFasAReadiness');

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

const CALENDAR_SEGMENT_IDS = new Set(['today_visits', 'this_week', 'waitlist']);

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

const MINE_DISABLED_REASON = 'Kräver ägare per kund · P1';

/** Inventera vilka ägarfält som finns på patient (readiness, ingen mock). */
function auditOwnerFieldsOnPatient(patient) {
  const present = [];
  const pipedrive = asObject(patient.pipedrive);
  const cliento = asObject(patient.cliento);
  if (normalizeText(pipedrive.owner)) present.push('pipedrive.owner');
  if (normalizeText(pipedrive.ownerId)) present.push('pipedrive.ownerId');
  if (normalizeText(cliento.owner)) present.push('cliento.owner');
  if (normalizeText(cliento.assignedStaff)) present.push('cliento.assignedStaff');
  if (normalizeText(cliento.Ägare)) present.push('cliento.Ägare');
  if (normalizeText(cliento.responsibleStaff)) present.push('cliento.responsibleStaff');
  if (normalizeText(cliento.behandlare)) present.push('cliento.behandlare');
  if (normalizeText(cliento.operator)) present.push('cliento.operator');
  if (normalizeText(patient.ownerId)) present.push('patient.ownerId');
  if (normalizeText(patient.assignedStaffId)) present.push('patient.assignedStaffId');
  if (normalizeText(patient.responsibleStaff)) present.push('patient.responsibleStaff');
  if (normalizeText(patient.createdBy)) present.push('patient.createdBy');
  if (normalizeText(patient.lastHandledBy)) present.push('patient.lastHandledBy');
  return present;
}

function buildOwnerFieldInventory(patients = []) {
  const fieldCounts = {};
  let withAnyOwner = 0;
  for (const patient of patients) {
    const fields = auditOwnerFieldsOnPatient(patient);
    if (fields.length) withAnyOwner += 1;
    for (const f of fields) fieldCounts[f] = (fieldCounts[f] || 0) + 1;
  }
  return {
    fieldsPresent: Object.keys(fieldCounts).sort(),
    fieldCounts,
    patientsWithAnyOwner: withAnyOwner,
    primaryField: fieldCounts['pipedrive.owner']
      ? 'pipedrive.owner'
      : fieldCounts['cliento.owner']
        ? 'cliento.owner'
        : null,
  };
}

/** Pipedrive Ägare / assigned staff label on patient (no PII beyond name already in CRM). */
function getPatientOwnerName(patient) {
  const pipedrive = asObject(patient.pipedrive);
  const owner = normalizeText(pipedrive.owner);
  if (owner) return owner;
  const cliento = asObject(patient.cliento);
  return normalizeText(
    cliento.owner ||
      cliento.assignedStaff ||
      cliento.Ägare ||
      cliento.responsibleStaff ||
      cliento.behandlare
  );
}

function ownerMatchesAssigned(ownerName, assignedOwner) {
  const owner = normalizeKey(ownerName);
  const assigned = normalizeKey(assignedOwner);
  if (!owner || !assigned) return false;
  if (owner === assigned) return true;
  if (owner.includes(assigned) || assigned.includes(owner)) return true;
  const emailLocal = assigned.includes('@') ? assigned.split('@')[0] : assigned;
  if (emailLocal.length >= 3 && owner.includes(emailLocal)) return true;
  const ownerTokens = owner.split(/\s+/).filter((t) => t.length >= 2);
  const assignedTokens = assigned.split(/\s+/).filter((t) => t.length >= 2);
  return (
    ownerTokens.some((t) => assigned.includes(t)) || assignedTokens.some((t) => owner.includes(t))
  );
}

function computeOwnerCoverage(patients = []) {
  let withOwner = 0;
  for (const patient of patients) {
    if (getPatientOwnerName(patient)) withOwner += 1;
  }
  if (withOwner === 0) return { coverage: 'none', withOwner: 0 };
  return { coverage: 'partial', withOwner };
}

function matchSegment(
  patient,
  segmentId,
  assetSignals,
  bookingIndex = null,
  bookingCoverage = 'missing',
  opts = {}
) {
  const id = normalizeKey(segmentId);
  if (!id || id === 'all') return true;

  const booking = getBookingSignals(bookingIndex, patient.id);
  const flags = new Set(asArray(patient.flags).map(normalizeKey));
  const fs = asObject(patient.fileSummary);
  const matchStatus = normalizeKey(patient.matchStatus);
  const origin = derivePatientOrigin(patient);
  const sig = assetSignals || emptyAssetSignals();
  const hasJournal = hasJournalFromPatient(patient);
  const updatedDays = daysSince(patient.updatedAt);

  if (CALENDAR_SEGMENT_IDS.has(id)) {
    if (bookingCoverage === 'missing') return false;
    if (id === 'today_visits') return booking.todayVisit;
    if (id === 'this_week') return booking.thisWeekVisit;
    if (id === 'waitlist') return booking.onWaitlist;
    return false;
  }

  if (id.startsWith('treatment_')) {
    if (bookingCoverage === 'missing') return false;
    return patientMatchesTreatmentSegment(booking, id);
  }

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
    case 'missing_health_declaration':
      return !sig.hasForm;
    case 'missing_encounter':
      return booking.missingEncounterForBooking || sig.needsEncounterReview;
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
    case 'mine': {
      const assignedOwner = normalizeText(opts.assignedOwner);
      if (!assignedOwner) return false;
      return ownerMatchesAssigned(getPatientOwnerName(patient), assignedOwner);
    }
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
  if (readout.missingHealthDeclaration) return 'Saknar hälsodeklaration (inför konsultation)';
  if (readout.missingAgreement && readout.hasJournal) return 'Saknar avtal/samtycke';
  if (readout.flags?.includes('missing_email')) return 'Saknar e-post';
  if (readout.flags?.includes('missing_phone')) return 'Saknar telefon';
  if (readout.missingEncounterForBooking) return 'Bokning utan encounter';
  if (readout.hasUpcomingBooking && readout.nextBookingAt) {
    return `Kommande: ${readout.nextBookingType || 'besök'}`;
  }
  if (readout.onWaitlist) return 'Väntelista — bokningsärende';
  if (readout.readyForTreatment === true || readout.readyForVisit === true) {
    return 'Redo för behandling';
  }
  return null;
}

function buildKunderReadout(patient, assetIndex = null, bookingIndex = null, opts = {}) {
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
    missingForm: !sig.hasForm, // deprecated — use missingHealthDeclaration
    missingHealthDeclaration: !sig.hasForm,
    hasAgreement: sig.hasAgreement,
    missingAgreement: hasJournal && !sig.hasAgreement,
    hasHalso: sig.hasHalso,
    hasGetAccept: sig.hasGetAccept,
    hasDriveJournal: Number(fs.journalPdfs) > 0 || sig.hasDriveJournalAsset,
    hasDriveDocument: Number(fs.totalFiles) > Number(fs.journalPdfs) || sig.hasDriveDocumentAsset,
    needsPhotoReview: sig.needsPhotoReview,
    needsClassification: sig.needsClassification,
    needsEncounterReview: sig.needsEncounterReview,
    hasUpcomingBooking: false,
    nextBookingAt: null,
    nextBookingType: null,
    nextBookingStatus: null,
    nextBookingResourceLabel: null,
    lastBookingAt: null,
    lastVisitAt: null,
    lastEncounterAt: null,
    treatmentTypes: [],
    bookingCaseId: null,
    bookingCaseStatus: null,
    encounterId: null,
    waitingListStatus: null,
    todayVisit: false,
    thisWeekVisit: false,
    missingEncounterForBooking: false,
    readyForVisit: null,
    readyForTreatment: null,
    treatmentPlanStatus: null,
    photoConsent: { signed: false, grantedAt: '', grantedBy: '' },
    fitnessSigned: false,
    hasJournalPhoto: false,
    onWaitlist: false,
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
  applyBookingToReadout(readout, getBookingSignals(bookingIndex, base.patientId));
  const ownerName = getPatientOwnerName(patient);
  readout.ownerName = ownerName || null;
  readout.assignedStaffId = null;
  readout.isMinePatient =
    Boolean(opts.assignedOwner) && ownerMatchesAssigned(ownerName, opts.assignedOwner);
  readout.nextStep = computeNextStep(readout);
  readout.nextRequirement = readout.nextStep;
  if (opts.fasA) {
    applyFasAReadoutFields(readout, opts.fasA, opts.agreement || null);
    readout.nextStep = computeNextStep(readout);
    readout.nextRequirement = readout.nextStep;
  }
  return readout;
}

function buildSegmentCatalog(bookingCoverage = 'missing', ownerCoverage = 'none') {
  const calendarStatus = bookingCoverage === 'missing' ? 'disabled' : 'real';
  const calendarReason = bookingCoverage === 'missing' ? 'Bokningsdata saknas i store' : null;
  const treatmentStatus = bookingCoverage === 'missing' ? 'disabled' : 'real';
  const mineDisabled = ownerCoverage === 'none';
  const mineStatus = mineDisabled ? 'disabled' : 'partial';
  const mineReason = mineDisabled ? MINE_DISABLED_REASON : null;

  const treatmentSegments = TREATMENT_SEGMENT_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    status: treatmentStatus,
    reason:
      treatmentStatus === 'disabled'
        ? 'Bokningsmotor/encounter store tom'
        : def.id === 'treatment_curatiio'
          ? 'Curatiio via service/encounter-typ'
          : null,
    filterQuery: treatmentStatus === 'real' ? { segment: def.id } : null,
  }));

  return [
    { id: 'all', label: 'Alla kunder', status: 'real', filterQuery: {} },
    {
      id: 'mine',
      label: 'Mina kunder',
      status: mineStatus,
      reason: mineReason,
      filterQuery: mineDisabled ? null : { segment: 'mine' },
    },
    {
      id: 'today_visits',
      label: 'Idag · besöker',
      status: calendarStatus,
      reason: calendarReason,
      filterQuery: calendarStatus === 'real' ? { segment: 'today_visits' } : null,
    },
    {
      id: 'this_week',
      label: 'Denna vecka',
      status: calendarStatus,
      reason: calendarReason,
      filterQuery: calendarStatus === 'real' ? { segment: 'this_week' } : null,
    },
    {
      id: 'waitlist',
      label: 'Väntelista',
      status: calendarStatus,
      reason: calendarReason,
      filterQuery: calendarStatus === 'real' ? { segment: 'waitlist' } : null,
    },
    ...treatmentSegments,
    { id: 'active', label: 'Aktiva', status: 'real', filterQuery: { segment: 'active' } },
    { id: 'vip', label: 'VIP', status: 'real', filterQuery: { segment: 'vip' } },
    { id: 'risk', label: 'Risk', status: 'real', filterQuery: { segment: 'risk' } },
    { id: 'new', label: 'Nya', status: 'real', filterQuery: { segment: 'new' } },
    { id: 'dormant', label: 'Dormant', status: 'real', filterQuery: { segment: 'dormant' } },
    {
      id: 'missing_health_declaration',
      label: 'Saknar hälsodeklaration',
      status: 'real',
      filterQuery: { segment: 'missing_health_declaration' },
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
      status: bookingCoverage === 'missing' ? 'partial' : 'real',
      reason:
        bookingCoverage === 'missing'
          ? 'Kräver bokning + encounter store'
          : 'Kommande bokning utan encounter',
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
    {
      id: 'has_images',
      label: 'Har bilder',
      status: 'real',
      filterQuery: { segment: 'has_images' },
    },
    {
      id: 'import_review',
      label: 'Import review',
      status: 'real',
      filterQuery: { segment: 'import_review' },
    },
  ];
}

function safeAggPatientName(patient) {
  const name = normalizeText(patient?.displayName);
  if (!name) return null;
  if (/\.(pdf|zip|jpe?g|png|heic|docx?)$/i.test(name) || /^[a-f0-9-]{20,}$/i.test(name)) {
    return null;
  }
  return name;
}

function computeAggInsights(
  patients,
  assetIndex,
  bookingIndex = null,
  bookingCoverage = 'missing',
  bookingBundle = null
) {
  const idagNames = [];
  let idagCount = 0;
  let vipInactiveCount = 0;
  let riskCount = 0;
  const riskNames = [];

  for (const patient of patients) {
    const assetSig = getAssetSignals(assetIndex, patient.id);
    const booking = getBookingSignals(bookingIndex, patient.id);
    const name = safeAggPatientName(patient);

    if (booking.todayVisit && !assetSig.hasForm) {
      idagCount += 1;
      if (name && idagNames.length < 3) idagNames.push(name);
    }

    if (isVipPatient(patient)) {
      const inactiveDays = daysSince(booking.lastVisitAt || patient.updatedAt || patient.createdAt);
      const inactiveEnough = inactiveDays == null || inactiveDays > 60;
      if (inactiveEnough && !booking.hasUpcomingBooking) {
        vipInactiveCount += 1;
      }
    }

    if (
      bookingCoverage !== 'missing' &&
      isBookingWithinDays(booking.nextBookingAt, 3) &&
      !assetSig.hasHalso
    ) {
      riskCount += 1;
      if (name && riskNames.length < 3) riskNames.push(name);
    }
  }

  const trend =
    bookingCoverage === 'missing'
      ? { pctChange: null, direction: 'flat', buckets: [0, 0, 0, 0], disabled: true }
      : {
          ...computeVisitTrendFromBundle(bookingBundle || {}),
          disabled: false,
        };

  return {
    idag: {
      count: idagCount,
      names: idagNames,
      ctaSegment: 'today_visits',
      disabled: bookingCoverage === 'missing' && idagCount === 0,
      reason:
        bookingCoverage === 'missing'
          ? 'Bokningsdata saknas — visar kontaktärenden från register.'
          : idagCount === 0
            ? 'Inga dagens besök saknar hälsodeklaration.'
            : null,
    },
    opp: {
      count: vipInactiveCount,
      ctaView: 'automation',
      disabled: false,
      reason: vipInactiveCount === 0 ? 'Inga VIP-kunder inaktiva 60+ dagar.' : null,
    },
    trend: {
      ...trend,
      ctaView: 'analytics',
      reason: trend.disabled || trend.pctChange == null ? 'Trend kräver bokningshistorik.' : null,
    },
    risk: {
      count: riskCount,
      names: riskNames,
      ctaSegment: 'this_week',
      disabled: bookingCoverage === 'missing',
      reason:
        bookingCoverage === 'missing'
          ? 'Bokningsdata saknas.'
          : riskCount === 0
            ? 'Inga kommande besök inom 3 dagar saknar friskförsäkran.'
            : null,
    },
  };
}

function computeSegmentStats(
  patients,
  assetIndex,
  bookingIndex = null,
  bookingCoverage = 'missing',
  opts = {},
  bookingBundle = null
) {
  const assignedOwner = normalizeText(opts.assignedOwner);
  const ownerMeta = computeOwnerCoverage(patients);
  const ownerInventory = buildOwnerFieldInventory(patients);
  const ownerCoverage =
    ownerMeta.coverage === 'none' ? 'none' : assignedOwner ? 'real' : ownerMeta.coverage;
  const SEGMENT_CATALOG = buildSegmentCatalog(bookingCoverage, ownerMeta.coverage);
  const counts = Object.fromEntries(SEGMENT_CATALOG.map((s) => [s.id, 0]));
  let withJournal = 0;
  let missingJournal = 0;
  let withForm = 0;
  let missingForm = 0;
  let needsReviewPatients = 0;
  let photoReviewPending = 0;
  let assetReviewPending = 0;
  let todayVisits = 0;
  let thisWeekVisits = 0;
  let waitlist = 0;
  let upcomingBookings = 0;

  for (const patient of patients) {
    const sig = getAssetSignals(assetIndex, patient.id);
    const booking = getBookingSignals(bookingIndex, patient.id);
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
    if (booking.todayVisit) todayVisits += 1;
    if (booking.thisWeekVisit) thisWeekVisits += 1;
    if (booking.onWaitlist) waitlist += 1;
    if (booking.hasUpcomingBooking) upcomingBookings += 1;

    for (const seg of SEGMENT_CATALOG) {
      if (seg.status === 'disabled') continue;
      if (seg.id === 'mine' && !assignedOwner) continue;
      if (matchSegment(patient, seg.id, sig, bookingIndex, bookingCoverage, opts)) {
        counts[seg.id] += 1;
      }
    }
  }

  const segments = SEGMENT_CATALOG.map((meta) => {
    let status = meta.status;
    let reason = meta.reason || null;
    let count = meta.status === 'disabled' ? null : (counts[meta.id] ?? 0);
    if (meta.id === 'mine') {
      if (ownerMeta.coverage === 'none') {
        status = 'disabled';
        reason = MINE_DISABLED_REASON;
        count = null;
      } else if (!assignedOwner) {
        status = 'partial';
        reason = 'Sätt assignedOwner (Pipedrive Ägare) för filter';
        count = ownerMeta.withOwner;
      } else {
        status = 'real';
        reason = null;
        count = counts.mine ?? 0;
      }
    }
    return {
      id: meta.id,
      label: meta.label,
      count,
      status,
      reason,
      filterQuery: meta.filterQuery,
    };
  });

  const mineSegment = segments.find((s) => s.id === 'mine');

  const mineMatch =
    assignedOwner && patients.length
      ? (() => {
          let matches = 0;
          for (const patient of patients) {
            if (ownerMatchesAssigned(getPatientOwnerName(patient), assignedOwner)) matches += 1;
          }
          return {
            mineCount: matches,
            matchRate: Math.round((matches / patients.length) * 1000) / 1000,
          };
        })()
      : { mineCount: null, matchRate: 0 };

  return {
    segments,
    ownerCoverage,
    patientsWithOwner: ownerMeta.withOwner,
    assignedOwnerActive: Boolean(assignedOwner),
    mineKunder: {
      status: mineSegment?.status || 'disabled',
      reason: mineSegment?.reason || MINE_DISABLED_REASON,
      count: mineSegment?.count ?? null,
      ownerFieldInventory: ownerInventory,
      ownerFieldsFound: ownerInventory.fieldsPresent,
      matchRate: mineMatch.matchRate,
      mineCount: mineMatch.mineCount,
      filterQuery: mineSegment?.filterQuery || null,
    },
    panel: {
      withJournal,
      missingJournal,
      withForm,
      missingForm,
      needsReviewPatients,
      photoReviewPending,
      assetReviewPending,
      todayVisits,
      thisWeekVisits,
      waitlist,
      upcomingBookings,
      bookingCoverage,
      totalPatients: patients.length,
    },
    aggInsights: computeAggInsights(
      patients,
      assetIndex,
      bookingIndex,
      bookingCoverage,
      bookingBundle
    ),
    counts,
    bookingCoverage,
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

function filterPatientsBySegment(
  patients,
  segmentId,
  assetIndex,
  bookingIndex = null,
  bookingCoverage = 'missing',
  opts = {}
) {
  const id = normalizeKey(segmentId);
  if (!id || id === 'all') return patients;
  const ownerMeta = computeOwnerCoverage(patients);
  const meta = buildSegmentCatalog(bookingCoverage, ownerMeta.coverage).find((s) => s.id === id);
  if (!meta || meta.status === 'disabled') return [];
  if (id === 'mine' && !normalizeText(opts.assignedOwner)) return [];
  return patients.filter((p) =>
    matchSegment(p, id, getAssetSignals(assetIndex, p.id), bookingIndex, bookingCoverage, opts)
  );
}

module.exports = {
  buildSegmentCatalog,
  buildAssetSignalsIndex,
  buildKunderReadout,
  computeAggInsights,
  computeSegmentStats,
  filterPatientsBySegment,
  loadAssetSignalsIndex,
  loadKunderBookingIndex,
  matchSegment,
  getPatientOwnerName,
  auditOwnerFieldsOnPatient,
  buildOwnerFieldInventory,
  ownerMatchesAssigned,
  computeOwnerCoverage,
  maskEmail,
  maskPhone,
  MINE_DISABLED_REASON,
};
