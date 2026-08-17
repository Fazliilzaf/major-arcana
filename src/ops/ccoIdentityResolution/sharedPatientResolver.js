'use strict';

/**
 * Gemensam patientidentitets-resolver för CCO.
 *
 * Delas mellan:
 *  - ccoAssetNaming (displayName-backfill, review-kö)
 *  - ccoMailIngestion/pipeline (inbound mail matching)
 *  - ccoMailIngestion/resolveUnmatched (review-kö sweep)
 *  - ccoConversationPatientResolver (worklist rollup)
 *
 * Syfte: samma alias-till-kanonisk-logik ska inte implementeras på flera ställen.
 */

const path = require('node:path');
const { resolveCanonicalPatientsForAssets } = require('../ccoPatientAssetIdentity');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

// ── Asset-alias resolution (CCO-namngivning) ─────────────────────────────────

/**
 * @param {object[]} assets
 * @param {(asset: object) => string} [keyFn] — patientId-nyckel att gruppera på.
 *   Default: rå asset.patientId.
 */
function groupByPatientId(assets, keyFn = (asset) => asset.patientId) {
  const map = new Map();
  for (const asset of assets) {
    const pid = normalizeText(keyFn(asset));
    if (!pid) continue;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(asset);
  }
  return map;
}

/**
 * Bygger en groupByPatientId-keyFn som grupperar på kanonisk patient när den
 * kan härledas, annars faller tillbaka på rå asset.patientId (aldrig sämre än
 * tidigare beteende).
 */
function resolveAliasKeyFn(assets, patients) {
  const resolutions = resolveCanonicalPatientsForAssets({ patients, assets });
  const canonicalByAssetId = new Map();
  for (const resolution of resolutions) {
    if (resolution.canonicalPatientId) {
      canonicalByAssetId.set(resolution.assetId, resolution.canonicalPatientId);
    }
  }
  return (asset) => canonicalByAssetId.get(asset.id) || asset.patientId;
}

/**
 * Fail-closed: en TOM array är "truthy" i JS, så utan den här kontrollen skulle
 * resolveAliasKeyFn köra, lösa upp ingenting, och grupperingen falla TYST
 * tillbaka på rå patientId.
 */
function assertPatientsResolved(patients, { patientsStorePath, tenant } = {}) {
  if (patients.length === 0) {
    throw new Error(
      `--patients-store/--tenant gav 0 patienter (tenant "${tenant}", ` +
        `${path.resolve(patientsStorePath || '')}) — fel sökväg eller felstavad tenant? ` +
        'Vägrar falla tillbaka tyst till oupplöst gruppering (kors-patient-' +
        'kollisionsrisk). Verifiera --patients-store/--tenant, eller sätt ' +
        '--i-understand-the-collision-risk-skip-alias-resolution om det är avsiktligt.'
    );
  }
}

// ── Contact lookup (email/phone) shared between conversations and imports ────

function collectPatientEmailSources(patient = {}) {
  return [
    { value: patient.primaryEmail, source: 'primaryEmail', confidence: 1 },
    ...asArray(patient.emails).map((value) => ({ value, source: 'emails', confidence: 1 })),
    ...asArray(patient.cliento && patient.cliento.emails).map((value) => ({
      value,
      source: 'cliento.emails',
      confidence: 0.9,
    })),
    ...asArray(patient.pipedrive && patient.pipedrive.emails).map((value) => ({
      value,
      source: 'pipedrive.emails',
      confidence: 0.9,
    })),
  ].filter((entry) => normalizeEmail(entry.value));
}

function collectPatientPhoneSources(patient = {}) {
  return [
    { value: patient.primaryPhone, source: 'primaryPhone', confidence: 0.85 },
    ...asArray(patient.phones).map((value) => ({ value, source: 'phones', confidence: 0.85 })),
  ].filter((entry) => normalizeText(entry.value));
}

/**
 * Samlar alla kända e-postadresser och telefonnummer per patient, med källa.
 */
function buildPatientContactLookup(patients = []) {
  const byEmail = new Map();
  const byPhone = new Map();

  for (const patient of patients) {
    for (const entry of collectPatientEmailSources(patient)) {
      const key = normalizeEmail(entry.value);
      if (!byEmail.has(key)) byEmail.set(key, []);
      byEmail.get(key).push({ patient, source: entry.source, confidence: entry.confidence });
    }
    for (const entry of collectPatientPhoneSources(patient)) {
      const key = normalizeText(entry.value);
      if (!byPhone.has(key)) byPhone.set(key, []);
      byPhone.get(key).push({ patient, source: entry.source, confidence: entry.confidence });
    }
  }

  return { byEmail, byPhone };
}

function dedupePatientMatches(entries = []) {
  const byId = new Map();
  for (const { patient, source, confidence } of entries) {
    const id = normalizeText(patient.id) || normalizeText(patient.patientId);
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || confidence > existing.confidence) {
      byId.set(id, { patient, source, confidence });
    }
  }
  return [...byId.values()];
}

/**
 * @returns {{patientId:string|null, displayName:string|null, matchedBy:string|null,
 *   confidence:number, candidates:Array, status:'matched'|'ambiguous'|'unmatched'}}
 */
function resolvePatientByEmail(lookup = {}, email = '') {
  const target = normalizeEmail(email);
  if (!target) {
    return emptyResolution();
  }
  const entries = asArray(lookup.byEmail && lookup.byEmail.get(target));
  if (entries.length === 0) {
    return emptyResolution();
  }

  const distinct = dedupePatientMatches(entries);
  if (distinct.length === 0) {
    return emptyResolution();
  }
  if (distinct.length > 1) {
    return {
      patientId: null,
      displayName: null,
      matchedBy: 'email',
      confidence: 0.45,
      candidates: distinct.map((d) => candidateFromEntry(d, { email: target })),
      status: 'ambiguous',
    };
  }

  const winner = distinct[0];
  return {
    patientId: winner.patient.id || winner.patient.patientId,
    displayName: normalizeText(winner.patient.displayName) || null,
    matchedBy: winner.source,
    confidence: winner.confidence,
    candidates: [],
    status: 'matched',
  };
}

/**
 * @returns {{patientId:string|null, displayName:string|null, matchedBy:string|null,
 *   confidence:number, candidates:Array, status:'matched'|'ambiguous'|'unmatched'}}
 */
function resolvePatientByPhone(lookup = {}, phone = '') {
  const target = normalizeText(phone);
  if (!target) {
    return emptyResolution();
  }
  const entries = asArray(lookup.byPhone && lookup.byPhone.get(target));
  if (entries.length === 0) {
    return emptyResolution();
  }

  const distinct = dedupePatientMatches(entries);
  if (distinct.length === 0) {
    return emptyResolution();
  }
  if (distinct.length > 1) {
    return {
      patientId: null,
      displayName: null,
      matchedBy: 'phone',
      confidence: 0.45,
      candidates: distinct.map((d) => candidateFromEntry(d, { phone: target })),
      status: 'ambiguous',
    };
  }

  const winner = distinct[0];
  return {
    patientId: winner.patient.id || winner.patient.patientId,
    displayName: normalizeText(winner.patient.displayName) || null,
    matchedBy: winner.source,
    confidence: winner.confidence,
    candidates: [],
    status: 'matched',
  };
}

function emptyResolution() {
  return {
    patientId: null,
    displayName: null,
    matchedBy: null,
    confidence: 0,
    candidates: [],
    status: 'unmatched',
  };
}

function candidateFromEntry(entry, { email, phone }) {
  return {
    patientId: entry.patient.id || entry.patient.patientId,
    method: entry.source,
    confidence: entry.confidence,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  };
}

module.exports = {
  normalizeText,
  normalizeEmail,
  asArray,
  groupByPatientId,
  resolveAliasKeyFn,
  assertPatientsResolved,
  buildPatientContactLookup,
  resolvePatientByEmail,
  resolvePatientByPhone,
};
