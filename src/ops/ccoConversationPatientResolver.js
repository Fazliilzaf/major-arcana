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

const {
  normalizeText: text,
  normalizeEmail,
  buildPatientContactLookup,
  resolvePatientByEmail,
} = require('./ccoIdentityResolution/sharedPatientResolver');

function isEmail(v) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}
function asArray(v) {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

/**
 * Skapar den säkra, tillfälliga identitet som CCO-rollupen använder under en
 * worklist-läsning. Den skrivs aldrig tillbaka till patient- eller mejlstore.
 *
 * Varje exakt, entydig patientmatch använder patient.id som canonical id. Vi
 * lämnar verifierad e-post/telefon tomma medvetet: en patient kan ha flera
 * legitima e-postadresser och de ska kunna samlas utan att aliasen ser ut som
 * en hård konflikt i rollupens skydd.
 */
function buildPatientRollupIdentity(match = {}, email = '') {
  if (text(match.status) !== 'matched') return null;
  const patientId = text(match.patientId);
  const customerEmail = normalizeEmail(email);
  if (!patientId || !customerEmail) return null;
  return {
    customerIdentity: {
      customerKey: patientId,
      customerName: text(match.displayName) || null,
      customerEmail,
      customerPhone: null,
      canonicalCustomerId: patientId,
      canonicalContactId: null,
      explicitMergeGroupId: null,
      verifiedPersonalEmailNormalized: null,
      verifiedPhoneE164: null,
      identitySource: 'backend',
      identityConfidence: 'strong',
    },
    identityProvenance: {
      source: 'patient_master',
      patientId,
      matchedBy: text(match.matchedBy) || 'email',
      confidence: Number(match.confidence) || 0,
    },
  };
}

/**
 * Applicerar enbart entydiga patientmatchningar på flyktiga worklist-rader.
 * Ambiguous/unmatched lämnas helt orörda, så de kan aldrig auto-länkas eller
 * rollas ihop genom patientmastern.
 */
function applyPatientRollupIdentity(rows = [], matches = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeMatches = Array.isArray(matches) ? matches : [];
  return safeRows.map((row, index) => {
    const overlay = buildPatientRollupIdentity(safeMatches[index], row?.customerEmail);
    if (!overlay) return row;
    return {
      ...row,
      customerIdentity: overlay.customerIdentity,
      identityProvenance: overlay.identityProvenance,
    };
  });
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

  const lookup = buildPatientContactLookup(patients);
  const emailResult = resolvePatientByEmail(lookup, target);

  if (emailResult.status === 'unmatched') {
    return { ...base, status: 'unmatched' };
  }
  if (emailResult.status === 'ambiguous') {
    return {
      ...base,
      status: 'ambiguous',
      matchedBy: 'email',
      candidates: emailResult.candidates,
    };
  }

  return {
    patientId: emailResult.patientId,
    displayName: emailResult.displayName,
    matchedBy: emailResult.matchedBy,
    confidence: emailResult.confidence,
    status: 'matched',
  };
}

async function resolveConversationPatients(refs = [], stores = {}) {
  const { patientMasterStore } = stores;
  const safeRefs = Array.isArray(refs) ? refs : [];
  if (
    typeof patientMasterStore?.findPatientsByEmails !== 'function' &&
    typeof patientMasterStore?.listPatients !== 'function'
  ) {
    return safeRefs.map(() => ({
      patientId: null,
      displayName: null,
      matchedBy: null,
      confidence: 0,
      status: 'store_unavailable',
    }));
  }

  const tenantId = text(safeRefs.find((ref) => text(ref?.tenantId))?.tenantId) || 'hairtpclinic';
  if (typeof patientMasterStore.findPatientsByEmails === 'function') {
    const emails = [...new Set(safeRefs.map((ref) => normalizeEmail(ref?.email)).filter(isEmail))];
    const result = await patientMasterStore.findPatientsByEmails({ tenantId, emails });
    const matches = result?.matches && typeof result.matches === 'object' ? result.matches : {};
    return Promise.all(
      safeRefs.map((ref) => {
        const email = normalizeEmail(ref?.email);
        const patients = Array.isArray(matches[email]) ? matches[email] : [];
        return resolveConversationPatient(
          { ...ref, tenantId },
          { patientMasterStore: { listPatients: async () => ({ patients }) } }
        );
      })
    );
  }

  const result = await patientMasterStore.listPatients({ tenantId, limit: 20000 });
  const patients = Array.isArray(result?.patients) ? result.patients : [];
  const snapshotStore = {
    listPatients: async () => ({ patients, total: patients.length }),
  };
  return Promise.all(
    safeRefs.map((ref) =>
      resolveConversationPatient({ ...ref, tenantId }, { patientMasterStore: snapshotStore })
    )
  );
}

module.exports = {
  applyPatientRollupIdentity,
  buildPatientRollupIdentity,
  resolveConversationPatient,
  resolveConversationPatients,
};
