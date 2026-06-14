'use strict';

/**
 * encounterMapper — koppla assets till behandlingstillfällen.
 * Osäkra matchningar → review, aldrig auto vid tvetydighet.
 */

const crypto = require('node:crypto');
const { detectTreatment, parseJournalFilename } = require('./documentClassifier');
const { parseIsoDate, treatmentSessionLabel } = require('./encounterNameResolver');

const ENCOUNTER_TYPES = Object.freeze([
  'consultation',
  'transplant_fue',
  'transplant_dhi',
  'prp_hair',
  'prp_skin',
  'follow_up',
  'microneedling',
  'other',
]);

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function inferEncounterType(text = '') {
  const hay = normalizeText(text).toLowerCase();
  if (!hay) return null;
  if (/konsult|consultation|bedömning/i.test(hay)) return 'consultation';
  if (/\bdhi\b/i.test(hay)) return 'transplant_dhi';
  if (/\bfue\b|\btp\b|transplant|hårtransplant/i.test(hay)) return 'transplant_fue';
  if (/\bprp\b/i.test(hay)) return 'prp_hair';
  if (/uppf[oö]lj|follow[\W_]?up/i.test(hay)) return 'follow_up';
  if (/microneedle|microneedling/i.test(hay)) return 'microneedling';
  return null;
}

function inferEncounterTypeFromAsset(asset = {}) {
  const fileName = normalizeText(asset.originalFileName);
  const folder = normalizeText(asset.originalDrivePath);
  const haystack = `${fileName} ${folder} ${asset.treatmentType || ''} ${asset.visitLabel || ''}`;

  const journalParsed = parseJournalFilename(fileName);
  if (journalParsed?.treatmentType) {
    const t = journalParsed.treatmentType.toLowerCase();
    if (t === 'prp') return 'prp_hair';
    if (/fue/i.test(t)) return 'transplant_fue';
    if (/dhi/i.test(t)) return 'transplant_dhi';
  }

  const detected = detectTreatment(haystack);
  if (detected) {
    if (/^prp$/i.test(detected)) return 'prp_hair';
    if (/fue/i.test(detected)) return 'transplant_fue';
    if (/dhi/i.test(detected)) return 'transplant_dhi';
  }

  return inferEncounterType(haystack);
}

function isMediaAsset(asset = {}) {
  const category = normalizeText(asset.category).toLowerCase();
  const mime = normalizeText(asset.mimeType).toLowerCase();
  const name = normalizeText(asset.originalFileName || asset.displayName).toLowerCase();
  return (
    category.startsWith('photo_') ||
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    /\.(heic|jpe?g|png|webp|mp4|mov|m4v|webm)$/i.test(name)
  );
}

function assetEncounterDate(asset = {}) {
  if (isMediaAsset(asset)) {
    return (
      parseIsoDate(asset.captureDateTime) ||
      parseIsoDate(asset.captureDate) ||
      parseIsoDate(asset.documentDate) ||
      parseIsoDate(asset.visitDate) ||
      parseIsoDate(asset.photoDate) ||
      parseIsoDate(asset.importedAt)
    );
  }
  return (
    parseIsoDate(asset.documentDate) ||
    parseIsoDate(asset.visitDate) ||
    parseIsoDate(asset.photoDate) ||
    parseIsoDate(asset.captureDateTime) ||
    parseIsoDate(asset.captureDate) ||
    parseIsoDate(asset.importedAt)
  );
}

function stableEncounterId({ patientId, date, encounterType, sessionNumber = null }) {
  const key = [patientId, date, encounterType, sessionNumber || ''].join('::');
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

function encounterVisitLabel(encounterType, sessionNumber) {
  if (encounterType === 'consultation') return 'Konsultation';
  if (encounterType === 'follow_up') return 'Uppföljning';
  if (encounterType === 'transplant_fue')
    return sessionNumber ? `FUE Operation ${sessionNumber}` : 'FUE Operation';
  if (encounterType === 'transplant_dhi')
    return sessionNumber ? `DHI Operation ${sessionNumber}` : 'DHI Operation';
  if (encounterType === 'prp_hair' || encounterType === 'prp_skin') {
    return treatmentSessionLabel('PRP', sessionNumber) || 'PRP';
  }
  return encounterType || 'Besök';
}

/**
 * Bygg encounter-kandidater per patient från journaler, bokningar och journal-assets.
 */
function buildEncounterRegistry({ journalEntries = [], bookings = [], assets = [] } = {}) {
  /** @type {Map<string, Map<string, object>>} patientId -> encounterId -> encounter */
  const byPatient = new Map();

  function addCandidate(patientId, candidate) {
    const pid = normalizeText(patientId);
    if (!pid) return;
    if (!byPatient.has(pid)) byPatient.set(pid, new Map());
    const map = byPatient.get(pid);
    const id = candidate.encounterId;
    if (map.has(id)) {
      const existing = map.get(id);
      existing.sourceRefs = [
        ...new Set([...(existing.sourceRefs || []), ...(candidate.sourceRefs || [])]),
      ];
      existing.confidence = bumpConfidence(existing.confidence, candidate.confidence);
    } else {
      map.set(id, { ...candidate });
    }
  }

  for (const entry of journalEntries) {
    const patientId = normalizeText(entry.patientId);
    const date =
      parseIsoDate(entry.treatmentDate) ||
      parseIsoDate(entry.encounterDate) ||
      parseIsoDate(entry.signedAt) ||
      parseIsoDate(entry.createdAt);
    if (!patientId || !date) continue;

    const jt = normalizeText(entry.journalType);
    let encounterType = 'other';
    if (jt.includes('consultation')) encounterType = 'consultation';
    else if (jt.includes('follow')) encounterType = 'follow_up';
    else if (/tp|fue/i.test(jt)) encounterType = 'transplant_fue';
    else if (/dhi/i.test(jt)) encounterType = 'transplant_dhi';
    else if (/prp/i.test(jt)) encounterType = 'prp_hair';

    const encounterId =
      normalizeText(entry.treatmentEncounterId) ||
      stableEncounterId({ patientId, date, encounterType, sessionNumber: null });

    addCandidate(patientId, {
      encounterId,
      patientId,
      date,
      encounterType,
      sessionNumber: null,
      visitLabel: null,
      source: 'journal',
      sourceRefs: [entry.entryId || entry.id].filter(Boolean),
      confidence: entry.treatmentEncounterId ? 'high' : 'medium',
    });
  }

  for (const booking of bookings) {
    const patientId = normalizeText(booking.patientId || booking.ccoPatientId);
    const date =
      parseIsoDate(booking.startsAt) ||
      parseIsoDate(booking.treatmentDate) ||
      parseIsoDate(booking.date);
    if (!patientId || !date) continue;

    const label = `${booking.serviceLabel || ''} ${booking.serviceId || ''}`;
    const encounterType = inferEncounterType(label) || 'other';
    const encounterId =
      normalizeText(booking.encounterId) ||
      stableEncounterId({ patientId, date, encounterType, sessionNumber: null });

    addCandidate(patientId, {
      encounterId,
      patientId,
      date,
      encounterType,
      sessionNumber: null,
      visitLabel: normalizeText(booking.serviceLabel) || null,
      source: 'booking',
      sourceRefs: [booking.bookingId || booking.id].filter(Boolean),
      confidence: booking.encounterId ? 'high' : 'medium',
    });
  }

  for (const asset of assets) {
    if (!['journal', 'cco_journal_sign'].includes(normalizeText(asset.category))) continue;
    const patientId = normalizeText(asset.patientId);
    const date = parseIsoDate(asset.documentDate) || parseIsoDate(asset.importedAt);
    if (!patientId || !date || patientId === 'unknown') continue;

    const encounterType = inferEncounterTypeFromAsset(asset) || 'other';
    addCandidate(patientId, {
      encounterId: stableEncounterId({ patientId, date, encounterType, sessionNumber: null }),
      patientId,
      date,
      encounterType,
      sessionNumber: null,
      visitLabel: null,
      source: 'journal_asset',
      sourceRefs: [asset.id],
      confidence: encounterType === 'other' ? 'low' : 'medium',
    });
  }

  // Session-nummer för PRP/FUE/DHI per patient
  for (const [, encMap] of byPatient) {
    const list = [...encMap.values()];
    for (const type of ['prp_hair', 'transplant_fue', 'transplant_dhi']) {
      const typed = list
        .filter((e) => e.encounterType === type)
        .sort((a, b) => a.date.localeCompare(b.date) || a.encounterId.localeCompare(b.encounterId));
      typed.forEach((enc, idx) => {
        enc.sessionNumber = idx + 1;
        enc.visitLabel = encounterVisitLabel(type, idx + 1);
        const stableId = stableEncounterId({
          patientId: enc.patientId,
          date: enc.date,
          encounterType: type,
          sessionNumber: enc.sessionNumber,
        });
        if (enc.encounterId !== stableId && !enc.sourceRefs?.some((r) => r.startsWith('linked-'))) {
          enc.legacyEncounterId = enc.encounterId;
          enc.encounterId = stableId;
        }
      });
    }
    for (const enc of list) {
      if (!enc.visitLabel)
        enc.visitLabel = encounterVisitLabel(enc.encounterType, enc.sessionNumber);
    }
  }

  return byPatient;
}

function bumpConfidence(a, b) {
  const rank = { high: 3, medium: 2, low: 1, review: 0 };
  return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
}

function typesCompatible(encounterType, assetType) {
  if (!encounterType || !assetType) return false;
  if (encounterType === assetType) return true;
  if (encounterType === 'prp_hair' && assetType === 'prp_skin') return true;
  if (encounterType === 'prp_skin' && assetType === 'prp_hair') return true;
  return false;
}

/**
 * Matcha ett asset mot registry. Osäkert → confidence review.
 */
function matchAssetToEncounter(asset = {}, registryForPatient = new Map()) {
  const patientId = normalizeText(asset.patientId);
  const date = assetEncounterDate(asset);
  if (!patientId || patientId === 'unknown') {
    return {
      encounterId: null,
      confidence: 'review',
      reason: 'missing_patient',
      visitLabel: null,
      encounterType: null,
    };
  }
  if (!date) {
    return {
      encounterId: null,
      confidence: 'review',
      reason: 'missing_date',
      visitLabel: null,
      encounterType: null,
    };
  }

  if (normalizeText(asset.encounterId)) {
    const existing = registryForPatient.get(asset.encounterId);
    if (existing) {
      return {
        encounterId: asset.encounterId,
        confidence: 'high',
        reason: 'already_linked',
        visitLabel: existing.visitLabel,
        encounterType: existing.encounterType,
      };
    }
  }

  const assetType = inferEncounterTypeFromAsset(asset);
  const sameDay = [...registryForPatient.values()].filter((e) => e.date === date);

  if (sameDay.length === 0) {
    if (assetType && assetType !== 'other') {
      const encounterId = stableEncounterId({
        patientId,
        date,
        encounterType: assetType,
        sessionNumber: null,
      });
      return {
        encounterId,
        confidence: 'medium',
        reason: 'inferred_from_asset_only',
        visitLabel: encounterVisitLabel(assetType, null),
        encounterType: assetType,
      };
    }
    return {
      encounterId: null,
      confidence: 'review',
      reason: 'no_encounter_on_date',
      visitLabel: null,
      encounterType: assetType,
    };
  }

  if (assetType) {
    const typed = sameDay.filter((e) => typesCompatible(e.encounterType, assetType));
    if (typed.length === 1) {
      return {
        encounterId: typed[0].encounterId,
        confidence: 'high',
        reason: 'date_and_type',
        visitLabel: typed[0].visitLabel,
        encounterType: typed[0].encounterType,
      };
    }
    if (typed.length > 1) {
      return {
        encounterId: null,
        confidence: 'review',
        reason: 'ambiguous_type_on_date',
        candidates: typed.map((e) => e.encounterId),
        visitLabel: null,
        encounterType: assetType,
      };
    }
  }

  if (sameDay.length === 1) {
    return {
      encounterId: sameDay[0].encounterId,
      confidence: 'medium',
      reason: 'date_only',
      visitLabel: sameDay[0].visitLabel,
      encounterType: sameDay[0].encounterType,
    };
  }

  return {
    encounterId: null,
    confidence: 'review',
    reason: 'ambiguous_date',
    candidates: sameDay.map((e) => e.encounterId),
    visitLabel: null,
    encounterType: assetType,
  };
}

/**
 * Kör mapping för alla assets.
 */
function mapAssetsToEncounters(assets = [], registry = new Map()) {
  const results = [];
  for (const asset of assets) {
    const pid = normalizeText(asset.patientId);
    const patientRegistry = registry.get(pid) || new Map();
    const match = matchAssetToEncounter(asset, patientRegistry);
    results.push({
      assetId: asset.id,
      patientId: pid,
      ...match,
    });
  }
  return results;
}

function summarizeMappingResults(results = []) {
  const summary = { high: 0, medium: 0, review: 0, already_linked: 0 };
  for (const r of results) {
    if (r.reason === 'already_linked') summary.already_linked += 1;
    else if (r.confidence === 'high') summary.high += 1;
    else if (r.confidence === 'medium') summary.medium += 1;
    else summary.review += 1;
  }
  return summary;
}

module.exports = {
  ENCOUNTER_TYPES,
  inferEncounterType,
  inferEncounterTypeFromAsset,
  assetEncounterDate,
  stableEncounterId,
  encounterVisitLabel,
  buildEncounterRegistry,
  matchAssetToEncounter,
  mapAssetsToEncounters,
  summarizeMappingResults,
};
