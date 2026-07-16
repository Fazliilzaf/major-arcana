'use strict';

const {
  buildPatientLookupMaps,
  resolvePatientIdFromClientoBooking,
} = require('./ccoKunderBookingEnrichment');
const { isFitnessCertificateAsset, isHealthDeclarationAsset } = require('./ccoKunderEnrichment');
const { inferDocumentKind } = require('./ccoPipedriveHistoricalDocuments');

const ATTENDED_STATUSES = new Set(['completed', 'show', 'klar']);
const NON_ATTENDED_STATUSES = new Set(['cancelled', 'canceled', 'no_show']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function classifyService(value) {
  const text = normalizeKey(value);
  if (/konsult|consult|online konsult/.test(text)) return 'consultation';
  if (/prp|microneed|mesoterapi/.test(text)) return 'prp';
  if (/dhi|fue|h[aå]rtransplant|transplant|operation|sk[aä]ggtransplant/.test(text)) {
    return 'hair_transplant';
  }
  if (/uppf[oö]lj|återbesök|aterbesok|kontroll/.test(text)) return 'follow_up';
  return 'other';
}

function isAttended(booking) {
  const status = normalizeKey(booking?.status);
  if (normalizeKey(booking?.source) === 'cliento_web_mail') return false;
  if (ATTENDED_STATUSES.has(status)) return true;
  if (NON_ATTENDED_STATUSES.has(status) || status === 'upcoming') return false;
  return false;
}

function dedupeClientoHistory(bookings) {
  const sourceRank = { cliento_csv: 30, cliento_api: 30, cliento_web_mail: 10 };
  const byKey = new Map();
  for (const booking of asArray(bookings)) {
    const startsAt = normalizeText(booking?.startsAt);
    const service = normalizeKey(booking?.serviceLabel);
    const key = `${startsAt.slice(0, 16)}::${service}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      Number(sourceRank[normalizeKey(booking?.source)] || 20) >
        Number(sourceRank[normalizeKey(existing?.source)] || 20)
    ) {
      byKey.set(key, booking);
    }
  }
  return [...byKey.values()];
}

function hasVisibleStatus(asset) {
  return ['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(asset?.status);
}

function summarizeEvidence(patient, assets) {
  const visible = asArray(assets).filter(hasVisibleStatus);
  const structuredHd = Boolean(asObject(patient?.healthDeclaration).signedAt);
  const structuredFf = Boolean(asObject(patient?.fitnessCertificate).signedAt);
  const healthDeclaration = structuredHd || visible.some(isHealthDeclarationAsset);
  const fitnessCertificate = structuredFf || visible.some(isFitnessCertificateAsset);
  const offer = visible.some(
    (asset) => asset?.sourceSystem === 'pipedrive_import' && inferDocumentKind(asset) === 'offer'
  );
  const agreement = visible.some(
    (asset) =>
      asset?.sourceSystem === 'pipedrive_import' && inferDocumentKind(asset) === 'agreement'
  );
  const deals = asArray(asObject(patient?.pipedrive).deals);
  return {
    healthDeclaration,
    fitnessCertificate,
    offer,
    agreement,
    pipedriveDeal: deals.length > 0,
    pipedriveDealCount: deals.length,
  };
}

function requirement(expected, present, reason) {
  return {
    expected: Boolean(expected),
    present: Boolean(present),
    status: !expected ? 'not_expected' : present ? 'verified' : 'missing',
    reason,
  };
}

function auditPatientJourney({ patient, bookings = [], assets = [] } = {}) {
  const history = dedupeClientoHistory(bookings)
    .slice()
    .sort((a, b) => Date.parse(a?.startsAt || '') - Date.parse(b?.startsAt || ''));
  const attended = history.filter(isAttended);
  const noShows = history.filter((row) => normalizeKey(row?.status) === 'no_show');
  const cancelled = history.filter((row) =>
    ['cancelled', 'canceled'].includes(normalizeKey(row?.status))
  );
  const attendedKinds = new Set(attended.map((row) => classifyService(row.serviceLabel)));
  const allKinds = new Set(history.map((row) => classifyService(row.serviceLabel)));
  const hasConsultationBooking = allKinds.has('consultation');
  const hasAttendedConsultation = attendedKinds.has('consultation');
  const hasAttendedTreatment =
    attendedKinds.has('prp') || attendedKinds.has('hair_transplant');
  const hasHairTransplant = attendedKinds.has('hair_transplant');
  const hasTreatmentBooking = allKinds.has('prp') || allKinds.has('hair_transplant');
  const hasHairTransplantBooking = allKinds.has('hair_transplant');
  const nonAttendedOnly =
    history.length > 0 &&
    attended.length === 0 &&
    history.every((row) => NON_ATTENDED_STATUSES.has(normalizeKey(row?.status)));
  const noShowOnly =
    nonAttendedOnly && history.some((row) => normalizeKey(row?.status) === 'no_show');
  const cancelledOnly =
    nonAttendedOnly &&
    history.every((row) => ['cancelled', 'canceled'].includes(normalizeKey(row?.status)));
  const attendanceUnverifiedCount = history.filter(
    (row) => normalizeKey(row?.source) === 'cliento_web_mail'
  ).length;
  const hasAuthoritativeBooking = history.some(
    (row) => normalizeKey(row?.source) !== 'cliento_web_mail'
  );
  const evidence = summarizeEvidence(patient, assets);

  // HD is sent after an authoritative booking. FF is a one-time patient
  // requirement at the initial attended treatment, rather than a new
  // requirement for every PRP session.
  const hdExpected =
    hasAuthoritativeBooking &&
    (hasConsultationBooking || hasTreatmentBooking) &&
    !nonAttendedOnly;
  const ffExpected = hasAttendedTreatment && !nonAttendedOnly;
  const offerExpected = hasTreatmentBooking && !nonAttendedOnly;
  const agreementExpected = hasHairTransplantBooking && !nonAttendedOnly;
  const requirements = {
    healthDeclaration: requirement(
      hdExpected,
      evidence.healthDeclaration,
      hdExpected
        ? 'booked_or_progressed_cliento_journey'
        : nonAttendedOnly
          ? 'no_show_or_cancelled_only'
          : 'no_attended_visit'
    ),
    fitnessCertificate: requirement(
      ffExpected,
      evidence.fitnessCertificate,
      ffExpected ? 'attended_treatment_day' : 'no_attended_treatment_day'
    ),
    offer: requirement(
      offerExpected,
      evidence.offer,
      offerExpected ? 'cliento_treatment_booking' : 'no_treatment_progression'
    ),
    agreement: requirement(
      agreementExpected,
      evidence.agreement,
      agreementExpected ? 'attended_hair_transplant' : 'no_attended_hair_transplant'
    ),
  };
  const gaps = Object.entries(requirements)
    .filter(([, item]) => item.status === 'missing')
    .map(([id]) => id);

  let stage = 'no_cliento_history';
  if (noShowOnly) stage = 'no_show_only';
  else if (cancelledOnly) stage = 'cancelled_only';
  else if (hasHairTransplant) stage = 'hair_transplant';
  else if (attendedKinds.has('prp')) stage = 'prp';
  else if (hasAttendedConsultation) stage = 'consultation_only';
  else if (history.length) stage = 'booking_history_only';

  return {
    patientId: normalizeText(patient?.id),
    stage,
    bookingCount: history.length,
    attendedCount: attended.length,
    noShowCount: noShows.length,
    cancelledCount: cancelled.length,
    attendanceUnverifiedCount,
    serviceKinds: [...allKinds].sort(),
    notes: history
      .filter((row) => normalizeText(row?.notes))
      .map((row) => ({
        bookingId: normalizeText(row.bookingId),
        startsAt: normalizeText(row.startsAt),
        status: normalizeText(row.status),
        note: normalizeText(row.notes),
      })),
    evidence,
    requirements,
    gaps,
    reviewRequired: gaps.length > 0,
  };
}

function buildClientoLedJourneyAudit({ patients = [], clientoBookings = [], assets = [] } = {}) {
  const safePatients = asArray(patients);
  const lookup = buildPatientLookupMaps(safePatients);
  const bookingsByPatient = new Map();
  for (const booking of asArray(clientoBookings)) {
    const patientId = resolvePatientIdFromClientoBooking(booking, lookup);
    if (!patientId) continue;
    if (!bookingsByPatient.has(patientId)) bookingsByPatient.set(patientId, []);
    bookingsByPatient.get(patientId).push(booking);
  }
  const assetsByPatient = new Map();
  for (const asset of asArray(assets)) {
    const patientId = normalizeText(asset?.patientId);
    if (!patientId) continue;
    if (!assetsByPatient.has(patientId)) assetsByPatient.set(patientId, []);
    assetsByPatient.get(patientId).push(asset);
  }
  const rows = safePatients.map((patient) =>
    auditPatientJourney({
      patient,
      bookings: bookingsByPatient.get(normalizeText(patient?.id)) || [],
      assets: assetsByPatient.get(normalizeText(patient?.id)) || [],
    })
  );
  const withHistory = rows.filter((row) => row.bookingCount > 0);
  const reviewQueue = rows.filter((row) => row.reviewRequired);
  const gapCounts = {};
  for (const row of reviewQueue) {
    for (const gap of row.gaps) gapCounts[gap] = Number(gapCounts[gap] || 0) + 1;
  }
  return {
    summary: {
      patientsScanned: rows.length,
      patientsWithClientoHistory: withHistory.length,
      patientsWithoutClientoHistory: rows.length - withHistory.length,
      bookingsMatched: [...bookingsByPatient.values()].reduce((sum, list) => sum + list.length, 0),
      unmatchedBookings:
        asArray(clientoBookings).length -
        [...bookingsByPatient.values()].reduce((sum, list) => sum + list.length, 0),
      reviewRequired: reviewQueue.length,
      gapCounts,
      zeroWrites: true,
    },
    rows,
    reviewQueue,
  };
}

module.exports = {
  auditPatientJourney,
  buildClientoLedJourneyAudit,
  classifyService,
  dedupeClientoHistory,
  isAttended,
  summarizeEvidence,
};
