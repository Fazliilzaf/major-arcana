'use strict';

/**
 * ccoDriveFolderCoupler.js — Predicted Drive-folder-coupling per patient.
 *
 * Tar en patient + en lista av encounters (eller Cliento-bookings som proxy)
 * och returnerar ett `drive`-objekt med fält som master-patient-kortet kan
 * exponera direkt. Avsikten är att flytta Cutover Readiness Krit #1 från
 * 🟡 PARTIAL till mostly-🟢 GREEN utan att kräva service-account.
 *
 * Output-form (per patient):
 *   {
 *     predictedFolderId: '1Gof_xzKOvdote1DCjb-riNozlvpLgjbh',
 *     predictedFolderPath: 'Kunder HTP/TP/Bokade/Hair TP Clinic 2026/Maj 2026',
 *     predictedFolderUrl: 'https://drive.google.com/drive/folders/...',
 *     predictionBasis: 'latest_booking_2026-05-13',
 *     predictionConfidence: 'high' | 'medium' | 'low' | 'none',
 *     status: 'predicted' | 'verified' | 'unverified_predicted' | 'none',
 *     verifiedAt: null,
 *     verifiedBy: null,
 *     sourceEncounters: <number>,
 *   }
 *
 * status-livscykel:
 *   - `predicted`            — vi har gissat från Cliento-booking-historik
 *   - `verified`             — service-account har bekräftat folder finns (framtid)
 *   - `unverified_predicted` — vi gissar men ingen kan verifiera än
 *   - `none`                 — patient har ingen Cliento-booking-historik att gissa från
 *
 * Compliance:
 *   - INGEN PII i logg eller URL utöver folder-IDs (publika utan auth).
 *   - Patientnamn används aldrig som input här.
 */

const { buildTreatmentDriveLink, KNOWN_FOLDERS } = require('./ccoDriveLinkBuilder');

const CONFIDENCE_BY_LEVEL = {
  day_search: 'high',
  month_search: 'medium',
  year_search: 'low',
  brand_root: 'low',
  unknown_brand: 'none',
};

function extractFolderIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // Match `folders/<id>` (may be followed by `#search?...` etc).
  const match = url.match(/\/folders\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function asDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickLatestEncounter(encounters) {
  const sorted = (Array.isArray(encounters) ? encounters : [])
    .filter((e) => e && (e.treatmentDate || e.date || e.startsAt))
    .map((e) => ({
      ...e,
      _date: asDate(e.treatmentDate || e.date || e.startsAt),
    }))
    .filter((e) => e._date)
    .sort((a, b) => b._date.getTime() - a._date.getTime());
  return sorted.length > 0 ? sorted[0] : null;
}

function emptyDriveCoupling(reason = 'no_bookings') {
  return {
    predictedFolderId: null,
    predictedFolderPath: null,
    predictedFolderUrl: null,
    predictionBasis: reason,
    predictionConfidence: 'none',
    status: 'none',
    verifiedAt: null,
    verifiedBy: null,
    sourceEncounters: 0,
  };
}

/**
 * Bygg predicted drive-coupling för en patient baserat på deras encounters
 * (eller Cliento-bookings som proxy om encounters saknas).
 *
 * @param {object} params
 * @param {object} [params.patient]            — patient-objektet (används bara för brand-detektion)
 * @param {Array}  [params.encounters=[]]      — encounter-objekt med .treatmentDate (eller .date/.startsAt)
 * @param {string} [params.brand='hair_tp']    — brand-key för KNOWN_FOLDERS-lookup
 * @returns {object} drive-coupling
 */
function predictDriveFolderForPatient({ patient = null, encounters = [], brand = 'hair_tp' } = {}) {
  void patient; // signatur-kompatibilitet, inte använd direkt (brand drivs av brand-param)
  const list = Array.isArray(encounters) ? encounters : [];
  if (list.length === 0) {
    return emptyDriveCoupling('no_bookings');
  }

  const latest = pickLatestEncounter(list);
  if (!latest) {
    return emptyDriveCoupling('no_dated_encounters');
  }

  const latestBrand = latest.brand || brand || 'hair_tp';
  const latestDate = latest._date;
  const isoDay = latestDate.toISOString().slice(0, 10);

  const link = buildTreatmentDriveLink({
    treatmentDate: latestDate,
    brand: latestBrand,
    treatmentType: latest.treatmentType || 'tp',
  });

  // For unknown-brand (curatiio i nuläget) → status `none`.
  if (!link || link.level === 'unknown_brand' || !link.url) {
    return {
      predictedFolderId: null,
      predictedFolderPath: link?.note || null,
      predictedFolderUrl: null,
      predictionBasis: `latest_booking_${isoDay}`,
      predictionConfidence: CONFIDENCE_BY_LEVEL[link?.level] || 'none',
      status: 'none',
      verifiedAt: null,
      verifiedBy: null,
      sourceEncounters: list.length,
    };
  }

  const confidence = CONFIDENCE_BY_LEVEL[link.level] || 'low';

  return {
    predictedFolderId: extractFolderIdFromUrl(link.url),
    predictedFolderPath: link.hint || link.note || link.query || null,
    predictedFolderUrl: link.url,
    predictionBasis: `latest_booking_${isoDay}`,
    predictionConfidence: confidence,
    status: 'predicted',
    verifiedAt: null,
    verifiedBy: null,
    sourceEncounters: list.length,
  };
}

/**
 * Markera en coupling som verifierad av framtida service-account-call.
 * Idempotent — den befintliga predictedFolderId behålls.
 *
 * @param {object} coupling   — existerande drive-coupling
 * @param {object} params
 * @param {string} [params.verifiedBy='service_account']
 * @param {string} [params.verifiedAt=ISO]
 * @returns {object} ny coupling med status='verified'
 */
function markCouplingVerified(coupling, { verifiedBy = 'service_account', verifiedAt = null } = {}) {
  const base = coupling && typeof coupling === 'object' ? coupling : emptyDriveCoupling('verified_no_prior');
  return {
    ...base,
    status: 'verified',
    verifiedAt: verifiedAt || new Date().toISOString(),
    verifiedBy,
  };
}

/**
 * Batch-predict för många patienter på en gång. Returnerar både per-patient
 * resultat och aggregerade stats.
 *
 * @param {object} params
 * @param {Array}  params.patients                — patient-objekt med `.key` eller `.customerId`
 * @param {object} [params.encountersByPatient]   — { patientKey: [encounter, ...] }
 * @returns {{ results: object, stats: object }}
 */
function predictDriveFoldersForPatients({ patients = [], encountersByPatient = {} } = {}) {
  const results = {};
  const counts = { predicted: 0, verified: 0, unverified_predicted: 0, none: 0 };
  const confidenceCounts = { high: 0, medium: 0, low: 0, none: 0 };

  for (const p of Array.isArray(patients) ? patients : []) {
    if (!p) continue;
    const patientKey = p.key || p.customerId || p.ccoPatientId || null;
    if (!patientKey) continue;
    const encs = encountersByPatient[patientKey] || [];
    const result = predictDriveFolderForPatient({
      patient: p,
      encounters: encs,
      brand: p.brand || 'hair_tp',
    });
    results[patientKey] = result;
    counts[result.status] = (counts[result.status] || 0) + 1;
    confidenceCounts[result.predictionConfidence] = (confidenceCounts[result.predictionConfidence] || 0) + 1;
  }

  return {
    results,
    stats: {
      totalPatients: Array.isArray(patients) ? patients.length : 0,
      ...counts,
      byConfidence: confidenceCounts,
    },
  };
}

module.exports = {
  CONFIDENCE_BY_LEVEL,
  KNOWN_FOLDERS,
  emptyDriveCoupling,
  extractFolderIdFromUrl,
  markCouplingVerified,
  pickLatestEncounter,
  predictDriveFolderForPatient,
  predictDriveFoldersForPatients,
};
