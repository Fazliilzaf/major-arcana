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
  isTodayVisit,
  loadKunderBookingIndex,
  patientMatchesTreatmentSegment,
} = require('./ccoKunderBookingEnrichment');
const { applyFasAReadoutFields } = require('./ccoKunderFasAReadiness');
const { sanitizePatientDisplayName } = require('../lib/patientDisplayName');
const { isPipedriveDealWon, parseDealValue, maxIsoDate } = require('./pipedriveDealHelpers');

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
const ACTIVE_BOOKING_DAYS = 30;
const DORMANT_BOOKING_DAYS = 180;
const DORMANT_ACTIVITY_DAYS = 365;
const NEW_PATIENT_DAYS = 30;
const RISK_BOOKING_WINDOW_DAYS = 3;
const RISK_NOSHOW_THRESHOLD = 2;
const DORMANT_UPDATED_DAYS = 365;
const VIP_DEAL_VALUE_MIN = 25_000;

const CALENDAR_SEGMENT_IDS = new Set(['today_visits', 'this_week', 'waitlist']);

function parseBookingMs(iso) {
  const ms = Date.parse(normalizeText(iso));
  return Number.isFinite(ms) ? ms : null;
}

function daysSince(iso) {
  if (!iso) return null;
  const t = parseBookingMs(iso);
  if (t == null) return null;
  return Math.floor((Date.now() - t) / MS_DAY);
}

function daysSinceIso(iso) {
  if (!iso) return null;
  const ms = parseBookingMs(iso);
  if (ms == null) return null;
  return Math.floor((Date.now() - ms) / MS_DAY);
}

/** Cliento/Pipedrive skapelsedatum — inte CCO record.createdAt (import-timestamp). */
function resolveSourceCreatedAt(patient) {
  const safe = asObject(patient);
  const cliento = asObject(safe.cliento);
  const pipedrive = asObject(safe.pipedrive);
  return (
    normalizeText(cliento.clientoCreatedAt) ||
    normalizeText(cliento.createdAt) ||
    normalizeText(pipedrive.createdAt) ||
    normalizeText(safe.clientoCreatedAt) ||
    null
  );
}

function resolvePipedriveActivityAt(patient) {
  const deals = asArray(asObject(patient.pipedrive).deals);
  const dates = [];
  for (const deal of deals) {
    const safe = asObject(deal);
    dates.push(safe.treatmentDate, safe.wonAt, safe.updatedAt);
  }
  return maxIsoDate(...dates);
}

function hasPatientEverEngaged(patient, booking, sig, hasJournal) {
  const fs = asObject(patient.fileSummary);
  if (
    booking.lastVisitAt ||
    booking.lastEncounterAt ||
    booking.lastBookingAt ||
    Number(booking.completedVisitCount) > 0
  ) {
    return true;
  }
  if (hasJournal || sig.hasDriveJournalAsset) return true;
  if (Number(fs.totalFiles) > 0 || sig.hasPhoto || sig.hasDriveDocumentAsset) return true;
  if (resolvePipedriveActivityAt(patient)) return true;
  return false;
}

function resolveLastActivityAt(patient, booking, sig, hasJournal) {
  const fs = asObject(patient.fileSummary);
  const candidates = [
    booking.lastActivityAt,
    booking.lastVisitAt,
    booking.lastEncounterAt,
    booking.lastBookingAt,
    resolvePipedriveActivityAt(patient),
    hasJournal || Number(fs.totalFiles) > 0 ? patient.updatedAt : null,
  ];
  return maxIsoDate(...candidates);
}

function resolveNoShowCount(patient, booking) {
  const fromBooking = Number(booking?.noShowCount);
  if (Number.isFinite(fromBooking) && fromBooking > 0) return fromBooking;
  const fromPatient = Number(patient?.noShowCount);
  return Number.isFinite(fromPatient) && fromPatient > 0 ? fromPatient : 0;
}

function isVipPatient(patient) {
  const deals = asArray(asObject(patient.pipedrive).deals);
  return deals.some((deal) => {
    const safe = asObject(deal);
    const v = parseDealValue(safe.value);
    const stage = normalizeKey(safe.stage);
    if (stage.includes('vip')) return true;
    return isPipedriveDealWon(safe) && v >= VIP_DEAL_VALUE_MIN;
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
    hasHealthDeclarationDocument: false,
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

function isHealthDeclarationAsset(asset = {}) {
  const cat = normalizeKey(asset.category);
  if (cat === 'form') return true;

  const source = normalizeKey(asset.sourceSystem);
  if (source !== 'm365_halso') return false;

  if (['journal', 'agreement', 'consent'].includes(cat)) return false;
  if (/^photo_/.test(cat)) return false;

  const haystack = normalizeKey(
    [
      asset.originalFileName,
      asset.originalDrivePath,
      asset.storageKey,
      asObject(asset.metadata).documentType,
      asObject(asset.metadata).documentTypeId,
      asObject(asset.metadata).subject,
    ]
      .filter(Boolean)
      .join(' ')
  );
  if (/injektions.?journal|friskforsak|friskförsäkr|behandlingsavtal|offert/.test(haystack)) {
    return false;
  }

  // halso@-import: form/other = hälsodeklaration; aldrig journal/agreement ovan.
  return cat === 'other' || !cat;
}

function patientHasHealthDeclarationAsset(sig = null) {
  const safe = sig || emptyAssetSignals();
  return Boolean(safe.hasForm || safe.hasHealthDeclarationDocument);
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
    if (isHealthDeclarationAsset(asset)) sig.hasHealthDeclarationDocument = true;
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
    case 'import_review':
      return matchStatus === 'needs_review' || flags.has('needs_review');
    case 'risk': {
      const noShowCount = resolveNoShowCount(patient, booking);
      if (
        booking.hasUpcomingBooking &&
        isBookingWithinDays(booking.nextBookingAt, RISK_BOOKING_WINDOW_DAYS) &&
        !patientHasHealthDeclarationAsset(sig)
      ) {
        return true;
      }
      if (noShowCount >= RISK_NOSHOW_THRESHOLD) return true;
      if (sig.assetNeedsReview && booking.hasUpcomingBooking) return true;
      return false;
    }
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
      return !patientHasHealthDeclarationAsset(sig);
    case 'missing_encounter':
      return booking.missingEncounterForBooking || sig.needsEncounterReview;
    case 'has_form':
      return patientHasHealthDeclarationAsset(sig);
    case 'getaccept':
      return sig.hasGetAccept;
    case 'halso':
      return sig.hasHalso;
    case 'photos_review':
      return sig.needsPhotoReview;
    case 'has_images':
      return Number(fs.images) > 0 || sig.hasPhoto;
    case 'active': {
      if (bookingCoverage !== 'missing') {
        if (booking.hasUpcomingBooking) return true;
        for (const iso of [booking.lastVisitAt, booking.lastBookingAt, booking.lastActivityAt]) {
          if (!iso) continue;
          const days = daysSinceIso(iso);
          if (days != null && days <= ACTIVE_BOOKING_DAYS) return true;
        }
        return false;
      }
      if (updatedDays != null && updatedDays <= ACTIVE_BOOKING_DAYS) return true;
      return false;
    }
    case 'new': {
      if (origin === 'new' || matchStatus === 'web_booking') return true;
      const created = resolveSourceCreatedAt(patient);
      if (!created) return false;
      const days = daysSinceIso(created);
      return days != null && days <= NEW_PATIENT_DAYS;
    }
    case 'dormant': {
      if (booking.hasUpcomingBooking) return false;
      if (!hasPatientEverEngaged(patient, booking, sig, hasJournal)) return false;

      const activityAt = resolveLastActivityAt(patient, booking, sig, hasJournal);
      if (activityAt) {
        const activityDays = daysSinceIso(activityAt);
        if (activityDays != null && activityDays > DORMANT_ACTIVITY_DAYS) return true;
      }

      if (bookingCoverage !== 'missing' && booking.lastBookingAt) {
        const bookingDays = daysSinceIso(booking.lastBookingAt);
        if (bookingDays != null && bookingDays > DORMANT_BOOKING_DAYS) return true;
      }

      if (updatedDays != null && updatedDays > DORMANT_UPDATED_DAYS) return true;
      return false;
    }
    case 'vip':
      return isVipPatient(patient);
    case 'mine': {
      const assignedOwner = normalizeText(opts.assignedOwner);
      if (!assignedOwner) return false;
      return ownerMatchesAssigned(getPatientOwnerName(patient), assignedOwner);
    }
    // ===== LANES (FACIT 2026-06-08) — kundresans operativa lägen =====
    case 'lane_agera': {
      // Agera nu: AKUT handling krävs — inte hela basen som saknar formulär.
      // (1) behöver granskning, (2) kommande bokning men saknar krav, (3) risk
      if (matchStatus === 'needs_review' || flags.has('needs_review')) return true;
      if (sig.needsPhotoReview || sig.assetNeedsReview) return true;
      if (booking.hasUpcomingBooking) {
        const missingHd = !patientHasHealthDeclarationAsset(sig) && !hasStructuredHdSigned(patient);
        const missingJournal = !hasJournal && !sig.hasDriveJournalAsset;
        if (missingHd || missingJournal) return true;
      }
      const noShowCount = resolveNoShowCount(patient, booking);
      if (noShowCount >= RISK_NOSHOW_THRESHOLD) return true;
      return false;
    }
    case 'lane_bokningsbar': {
      // Bokningsbar: har engagerat sig tidigare (besök/bokning) men har INGEN kommande bokning.
      // (Inte hela importbasen — kräver verkligt tidigare besök/bokning, ej bara updatedAt.)
      if (booking.hasUpcomingBooking) return false;
      const engaged =
        Boolean(booking.lastVisitAt) ||
        Boolean(booking.lastBookingAt) ||
        hasJournal ||
        Number(fs.totalFiles) > 0;
      if (!engaged) return false;
      for (const iso of [booking.lastVisitAt, booking.lastBookingAt]) {
        if (!iso) continue;
        const d = daysSinceIso(iso);
        if (d != null && d <= DORMANT_BOOKING_DAYS) return true;
      }
      return false;
    }
    case 'lane_operation': {
      // Operation (kundresa-steg operationsdag/efterkontroll): kommande kirurgi-bokning
      if (!booking.hasUpcomingBooking) return false;
      return laneIsSurgery(
        normalizeText(booking.nextBookingType) + ' ' + asArray(booking.treatmentTypes).join(' ')
      );
    }
    case 'lane_eftervard': {
      // Eftervård (aftercare): opererad, ingen kommande kirurgi, senaste besök inom aftercare-fönster
      const tt = asArray(booking.treatmentTypes).join(' ');
      if (!laneIsSurgery(tt)) return false;
      if (booking.hasUpcomingBooking && laneIsSurgery(normalizeText(booking.nextBookingType))) {
        return false;
      }
      const lv = booking.lastVisitAt || booking.lastBookingAt;
      if (!lv) return false;
      const d = daysSinceIso(lv);
      return d != null && d >= 0 && d <= LANE_AFTERCARE_DAYS;
    }
    case 'lane_medicinsk': {
      // Medicinsk: medicinska riskflaggor i hälsodeklarationen
      if (asArray(patient.allergies).length > 0) return true;
      const hd = asObject(patient.healthDeclaration);
      if (asArray(hd.riskFlags).length > 0) return true;
      if (asArray(hd.flags).length > 0) return true;
      if (
        asArray(patient.flags)
          .map(normalizeKey)
          .some(
            (f) =>
              f.indexOf('allerg') >= 0 || f.indexOf('medical') >= 0 || f.indexOf('risk_med') >= 0
          )
      ) {
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}

// Lane-hjälpare
const LANE_AFTERCARE_DAYS = 120;
function laneIsSurgery(text) {
  return /dhi|fue|transplant|operation|kirurg/i.test(String(text || ''));
}
function hasStructuredHdSigned(patient) {
  return Boolean(asObject(patient && patient.healthDeclaration).signedAt);
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
  const structuredHd = asObject(patient.healthDeclaration);
  const hasStructuredHd = Boolean(structuredHd.signedAt);
  const hasHealthDeclaration =
    patientHasHealthDeclarationAsset(sig) || hasStructuredHd || Boolean(base.hasHealthDeclaration);
  const hasForm = hasHealthDeclaration;
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
    hasForm,
    missingForm: !hasForm, // deprecated — use missingHealthDeclaration
    missingHealthDeclaration: !hasHealthDeclaration,
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
      active: matchSegment(
        patient,
        'active',
        sig,
        bookingIndex,
        bookingIndex ? 'real' : 'missing',
        opts
      ),
      dormant: matchSegment(
        patient,
        'dormant',
        sig,
        bookingIndex,
        bookingIndex ? 'real' : 'missing',
        opts
      ),
      new: matchSegment(patient, 'new', sig, bookingIndex, bookingIndex ? 'real' : 'missing', opts),
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
    // ===== LANES (FACIT) — kundresans operativa lägen =====
    { id: 'lane_agera', label: 'Agera nu', status: 'real', filterQuery: { segment: 'lane_agera' } },
    {
      id: 'lane_bokningsbar',
      label: 'Bokningsbar',
      status: 'real',
      filterQuery: { segment: 'lane_bokningsbar' },
    },
    {
      id: 'lane_operation',
      label: 'Operation',
      status: 'real',
      filterQuery: { segment: 'lane_operation' },
    },
    {
      id: 'lane_eftervard',
      label: 'Eftervård',
      status: 'real',
      filterQuery: { segment: 'lane_eftervard' },
    },
    {
      id: 'lane_medicinsk',
      label: 'Medicinsk',
      status: 'real',
      filterQuery: { segment: 'lane_medicinsk' },
    },
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
  const name = sanitizePatientDisplayName(patient?.displayName, { fallback: '' });
  return name || null;
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

    if (booking.todayVisit && !patientHasHealthDeclarationAsset(assetSig)) {
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

function computeUpcomingTreatment(patients, assetIndex, bookingIndex, bookingCoverage) {
  if (bookingCoverage === 'missing' || !bookingIndex) {
    return { empty: true, reason: 'Inga kommande' };
  }
  const now = Date.now();
  let best = null;

  for (const patient of patients) {
    const booking = getBookingSignals(bookingIndex, patient.id);
    if (!booking.hasUpcomingBooking || !booking.nextBookingAt) continue;
    const startsAtMs = parseBookingMs(booking.nextBookingAt);
    if (startsAtMs == null || startsAtMs < now) continue;

    if (!best || startsAtMs < best.startsAtMs) {
      const assetSig = getAssetSignals(assetIndex, patient.id);
      best = {
        patientId: patient.id,
        patientName: safeAggPatientName(patient) || 'Kund',
        startsAt: booking.nextBookingAt,
        startsAtMs,
        treatmentLabel: normalizeText(booking.nextBookingType) || 'Behandling',
        practitionerLabel: normalizeText(booking.nextBookingResourceLabel) || '',
        missingForm: !patientHasHealthDeclarationAsset(assetSig),
        engineBookingId: booking.engineBookingId || null,
        bookingCaseId: booking.bookingCaseId || null,
      };
    }
  }

  if (!best) {
    return { empty: true, reason: 'Inga kommande' };
  }

  const remindNow =
    best.missingForm && (isTodayVisit(best.startsAt) || isBookingWithinDays(best.startsAt, 3));

  return {
    empty: false,
    patientId: best.patientId,
    patientName: best.patientName,
    startsAt: best.startsAt,
    treatmentLabel: best.treatmentLabel,
    practitionerLabel: best.practitionerLabel,
    alert: isTodayVisit(best.startsAt) ? 'high' : 'normal',
    kicker: remindNow ? 'Påminnelse' : 'Nästa besök',
    remindNow,
    missingForm: best.missingForm,
    engineBookingId: best.engineBookingId,
    bookingCaseId: best.bookingCaseId,
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
    if (patientHasHealthDeclarationAsset(sig)) withForm += 1;
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
    upcomingTreatment: computeUpcomingTreatment(
      patients,
      assetIndex,
      bookingIndex,
      bookingCoverage
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
  computeUpcomingTreatment,
  computeSegmentStats,
  filterPatientsBySegment,
  isHealthDeclarationAsset,
  loadAssetSignalsIndex,
  loadKunderBookingIndex,
  matchSegment,
  patientHasHealthDeclarationAsset,
  getPatientOwnerName,
  auditOwnerFieldsOnPatient,
  buildOwnerFieldInventory,
  ownerMatchesAssigned,
  computeOwnerCoverage,
  maskEmail,
  maskPhone,
  MINE_DISABLED_REASON,
};
