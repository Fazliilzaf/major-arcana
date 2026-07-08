'use strict';

/**
 * ccoConversationPatientResolver — kopplar en konversation till rätt kund i
 * patient-mastern via motpartens e-post. READ-ONLY: läser patient-mastern,
 * skriver inget, rör ingen send/Graph, ingen live-fetch.
 *
 * Identitet (viktigt):
 *   - Canonical kund-id = `patient.id` (heter `patientId` i UI/API/URL).
 *   - `cliento_*` / `pipedrive_*` är ALDRIG huvud-id — bara alias vi matchar EMOT.
 *
 * Matchar e-posten mot fyra källor per patient:
 *   primaryEmail · emails[] · cliento.emails[] · pipedrive.emails[]
 * Exakt en kund → `matched`. Flera → `ambiguous` (länka INTE automatiskt).
 * Ingen → `unmatched` (okopplad konversation).
 *
 * Ren funktion med injicerad store (`listPatients`) — enkel att enhetstesta.
 */

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function normalizeEmail(v) {
  return text(v).toLowerCase();
}
function isEmail(v) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}
function asArray(v) {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

/**
 * Vilken källa matchade + konfidens. Direkt (primaryEmail/emails) = 1.0,
 * alias (cliento/pipedrive) = 0.9. Returnerar null om ingen källa matchar.
 */
function matchEmailSources(patient, target) {
  if (normalizeEmail(patient.primaryEmail) === target) {
    return { by: 'primaryEmail', confidence: 1 };
  }
  if (asArray(patient.emails).some((e) => normalizeEmail(e) === target)) {
    return { by: 'emails', confidence: 1 };
  }
  if (
    asArray(patient.cliento && patient.cliento.emails).some((e) => normalizeEmail(e) === target)
  ) {
    return { by: 'cliento.emails', confidence: 0.9 };
  }
  if (
    asArray(patient.pipedrive && patient.pipedrive.emails).some((e) => normalizeEmail(e) === target)
  ) {
    return { by: 'pipedrive.emails', confidence: 0.9 };
  }
  return null;
}

/**
 * @param {{tenantId?:string, email:string}} ref
 * @param {{patientMasterStore:object}} stores
 * @returns {Promise<{patientId:string|null, displayName:string|null,
 *   matchedBy:string|null, confidence:number,
 *   status:'matched'|'ambiguous'|'unmatched'|'no_email'|'store_unavailable',
 *   candidates?:Array}>}
 */
async function resolveConversationPatient(ref = {}, stores = {}) {
  const tenantId = text(ref.tenantId) || 'hairtpclinic';
  const target = normalizeEmail(ref.email);
  const { patientMasterStore } = stores;

  const base = { patientId: null, displayName: null, matchedBy: null, confidence: 0 };
  if (!target || !isEmail(target)) return { ...base, status: 'no_email' };
  if (typeof patientMasterStore?.listPatients !== 'function') {
    return { ...base, status: 'store_unavailable' };
  }

  const result = await patientMasterStore.listPatients({ tenantId, limit: 20000 });
  const patients = Array.isArray(result && result.patients) ? result.patients : [];

  // Matcha; dedupe på canonical patient.id (behåll starkaste källan per patient).
  const byId = new Map();
  for (const p of patients) {
    const hit = matchEmailSources(p, target);
    if (!hit) continue;
    const id = text(p.id) || text(p.patientId); // ALLTID canonical id, aldrig cliento_*
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || hit.confidence > existing.confidence) {
      byId.set(id, {
        patientId: id,
        displayName: text(p.displayName) || null,
        matchedBy: hit.by,
        confidence: hit.confidence,
      });
    }
  }

  const matches = [...byId.values()];
  if (matches.length === 0) return { ...base, status: 'unmatched' };
  if (matches.length > 1) {
    return { ...base, status: 'ambiguous', matchedBy: 'email', candidates: matches };
  }

  const m = matches[0];
  return {
    patientId: m.patientId,
    displayName: m.displayName,
    matchedBy: m.matchedBy,
    confidence: m.confidence,
    status: 'matched',
  };
}

module.exports = { resolveConversationPatient, matchEmailSources, normalizeEmail };
