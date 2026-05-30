'use strict';

/**
 * ccoMasterPatientCardStore.js
 *
 * Read-only-aggregator för "master patientkort" per ccoPatientId.
 * Modulen håller INGEN egen state — den läser från existerande stores och
 * konsoliderar en patient-360 vy:
 *
 *   {
 *     ccoPatientId,
 *     clientoId,
 *     meridiqRef:  { hasJournal, pnrSuffix, via, duplicateCandidate, noMeridiqJournal },
 *     driveFolder: { brand, year, folderId, driveStatus, predictedPath, searchUrl, existsConfidence },
 *     encounters:  [{ encounterId, date, source, predictedDrivePath, driveStatus, ... }],
 *     journals:    [...]    (från ccoJournalStore)
 *     photos:      [...]    (från ccoJournalPhotoStore om finns)
 *     consents:    [...]    (från ccoPhotoConsentStore + marketing-consents)
 *     agreements:  [...]    (från ccoAgreementQuickStore)
 *     forms:       [...]    (från cco-templates om finns)
 *     timeline:    [...]    (kronologisk merge)
 *   }
 *
 * Konstruktion: createMasterPatientCardLookup({ stores }) returnerar
 *   { getCard, listAllCards, summary } - alla async/ren och idempotenta.
 *
 * Compliance: ingen PII i return-typer utöver vad existerande stores redan
 * tillhandahåller; denna modul lägger bara på struktur, inte data.
 *
 * Per `.cursor/rules/cco-journal-cutover-first.mdc#Definition of Done`
 *   #1: "Varje patient har ett master-kort (clientoId + meridiqId + driveFolderId + ccoId)"
 */

const { predictDrivePath } = require('./ccoDrivePathPredictor');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function deriveBrandFromTenant(tenantId) {
  const t = normalizeText(tenantId).toLowerCase();
  if (t === 'curatiio' || t.includes('curatiio')) return 'curatiio';
  return 'hair_tp';
}

function deriveEncountersFromJournals(journals = []) {
  // Each journal entry forms an "encounter" for timeline purposes.
  // We don't have a separate encounters store yet; derive from journal-entries.
  const encounters = [];
  for (const j of journals) {
    encounters.push({
      encounterId: j.entryId || j.id || null,
      date: j.treatmentDate || j.encounterDate || j.createdAt || null,
      source: 'journal',
      journalType: j.journalType || null,
      status: j.status || null,
      locked: Boolean(j.locked),
    });
  }
  return encounters;
}

function buildTimeline({ journals, photos, consents, agreements, forms }) {
  const events = [];
  for (const j of asArray(journals)) {
    events.push({
      type: 'journal',
      subType: j.journalType || null,
      ts: j.signedAt || j.createdAt || j.updatedAt || null,
      ref: j.entryId || null,
      status: j.status || null,
    });
  }
  for (const p of asArray(photos)) {
    events.push({
      type: 'photo',
      ts: p.takenAt || p.createdAt || null,
      ref: p.photoId || p.id || null,
    });
  }
  for (const c of asArray(consents)) {
    events.push({
      type: 'consent',
      subType: c.kind || 'photo',
      ts: c.updatedAt || c.createdAt || null,
      ref: c.consentId || c.id || null,
      status: c.status || null,
    });
  }
  for (const a of asArray(agreements)) {
    events.push({
      type: 'agreement',
      ts: a.signedAt || a.createdAt || a.updatedAt || null,
      ref: a.agreementId || a.id || null,
      status: a.state || null,
    });
  }
  for (const f of asArray(forms)) {
    events.push({
      type: 'form',
      subType: f.type || null,
      ts: f.submittedAt || f.createdAt || null,
      ref: f.formId || f.id || null,
    });
  }
  return events
    .filter((e) => e.ts)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
}

/**
 * Skapa en master-patientkort-lookup med injected stores.
 *
 * @param {object} deps
 * @param {object} [deps.customerStore]   - ccoCustomerStore-instans (peekTenantCustomerState)
 * @param {object} [deps.journalStore]    - ccoJournalStore-instans (listEntries)
 * @param {object} [deps.photoStore]      - { listForPatient({tenantId,patientId}) }
 * @param {object} [deps.photoConsentStore]  - ccoPhotoConsentStore
 * @param {object} [deps.marketingConsentStore] - { listForPatient({tenantId,patientId}) }
 * @param {object} [deps.agreementStore]  - ccoAgreementQuickStore
 * @param {object} [deps.formStore]       - { listForPatient({tenantId,patientId}) }
 * @returns object med getCard / listAllCards / summary
 */
function createMasterPatientCardLookup(deps = {}) {
  const {
    customerStore = null,
    journalStore = null,
    photoStore = null,
    photoConsentStore = null,
    marketingConsentStore = null,
    agreementStore = null,
    formStore = null,
  } = deps;

  async function loadCustomerSnapshot(tenantId) {
    if (!customerStore) return null;
    if (typeof customerStore.peekTenantCustomerState === 'function') {
      return customerStore.peekTenantCustomerState({ tenantId });
    }
    if (typeof customerStore.getTenantCustomerState === 'function') {
      return customerStore.getTenantCustomerState({ tenantId });
    }
    return null;
  }

  function resolveCustomerRecord(customerState, patientId) {
    if (!customerState) return null;
    const dir = asObject(customerState.directory);
    const det = asObject(customerState.details);
    const ident = asObject(customerState.identityByKey);
    const key = normalizeText(patientId).toLowerCase();
    if (!key) return null;
    if (!dir[key]) return null;
    return {
      directory: dir[key],
      details: det[key] || null,
      identity: ident[key] || null,
    };
  }

  async function getJournals(tenantId, patientId) {
    if (!journalStore || typeof journalStore.listEntries !== 'function') return [];
    return journalStore.listEntries({ tenantId, patientId });
  }

  async function getPhotos(tenantId, patientId) {
    if (!photoStore || typeof photoStore.listForPatient !== 'function') return [];
    return photoStore.listForPatient({ tenantId, patientId });
  }

  async function getPhotoConsents(tenantId, patientId) {
    if (!photoConsentStore) return [];
    if (typeof photoConsentStore.listForPatient === 'function') {
      return photoConsentStore.listForPatient({ tenantId, patientId });
    }
    if (typeof photoConsentStore.getConsent === 'function') {
      const c = photoConsentStore.getConsent({ tenantId, patientId });
      return c ? [{ kind: 'photo', ...c }] : [];
    }
    return [];
  }

  async function getMarketingConsents(tenantId, patientId) {
    if (!marketingConsentStore || typeof marketingConsentStore.listForPatient !== 'function') {
      return [];
    }
    const list = await marketingConsentStore.listForPatient({ tenantId, patientId });
    return asArray(list).map((c) => ({ kind: 'marketing', ...c }));
  }

  async function getAgreements(tenantId, patientId) {
    if (!agreementStore || typeof agreementStore.listForCustomer !== 'function') return [];
    return agreementStore.listForCustomer({ tenantId, customerKey: patientId });
  }

  async function getForms(tenantId, patientId) {
    if (!formStore || typeof formStore.listForPatient !== 'function') return [];
    return formStore.listForPatient({ tenantId, patientId });
  }

  /**
   * Bygg master-patient-kort för en given patient.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.patientId       ccoPatientId (directory-key)
   * @returns {Promise<object|null>}
   */
  async function getCard({ tenantId, patientId } = {}) {
    if (!tenantId || !patientId) return null;
    const customerState = await loadCustomerSnapshot(tenantId);
    const customerRec = resolveCustomerRecord(customerState, patientId);
    if (!customerRec) return null;

    const brand = deriveBrandFromTenant(tenantId);
    const meridiqMeta = asObject(customerRec.directory.meridiqMeta);
    const noMeridiqJournal = Boolean(customerRec.directory.noMeridiqJournal);
    const duplicateCandidate = Boolean(customerRec.directory.duplicateCandidate);

    const journals = await getJournals(tenantId, patientId);
    const photos = await getPhotos(tenantId, patientId);
    const photoConsents = await getPhotoConsents(tenantId, patientId);
    const marketingConsents = await getMarketingConsents(tenantId, patientId);
    const agreements = await getAgreements(tenantId, patientId);
    const forms = await getForms(tenantId, patientId);

    const encounters = deriveEncountersFromJournals(journals).map((enc) => {
      const drivePred = predictDrivePath({
        treatmentDate: enc.date,
        brand,
        treatmentType: 'tp',
      });
      return {
        ...enc,
        predictedDrivePath: drivePred.predictedPath,
        driveSearchUrl: drivePred.searchUrl,
        driveExistsConfidence: drivePred.existsConfidence,
        driveStatus: drivePred.driveStatus,
      };
    });

    // Top-level brand-drive-folder stub
    const topLevelDrivePred = predictDrivePath({
      treatmentDate: null,
      brand,
      treatmentType: 'tp',
    });

    const consents = [...photoConsents, ...marketingConsents];

    return {
      ccoPatientId: normalizeText(patientId).toLowerCase(),
      clientoId: meridiqMeta?.clientoId || customerRec.directory.clientoId || null,
      meridiqRef: {
        hasJournal: meridiqMeta.hasJournal === true,
        pnrSuffix: meridiqMeta.pnrSuffix || null,
        via: meridiqMeta.via || null,
        duplicateCandidate,
        noMeridiqJournal,
        meridiqPatientId: meridiqMeta.meridiqPatientId || meridiqMeta.id || null,
      },
      driveFolder: {
        brand,
        year: null,
        folderId: null, // populated by SA-job later
        driveStatus: topLevelDrivePred.driveStatus,
        predictedPath: topLevelDrivePred.predictedPath,
        searchUrl: topLevelDrivePred.searchUrl,
        existsConfidence: topLevelDrivePred.existsConfidence,
      },
      encounters,
      journals,
      photos,
      consents,
      agreements,
      forms,
      timeline: buildTimeline({ journals, photos, consents, agreements, forms }),
    };
  }

  async function listAllCards({ tenantId, limit = null } = {}) {
    if (!tenantId) return [];
    const customerState = await loadCustomerSnapshot(tenantId);
    if (!customerState) return [];
    const keys = Object.keys(asObject(customerState.directory));
    const capped = typeof limit === 'number' && limit > 0 ? keys.slice(0, limit) : keys;
    const cards = [];
    for (const k of capped) {
      const card = await getCard({ tenantId, patientId: k });
      if (card) cards.push(card);
    }
    return cards;
  }

  async function summary({ tenantId } = {}) {
    if (!tenantId) return null;
    const customerState = await loadCustomerSnapshot(tenantId);
    if (!customerState) return null;
    const dir = asObject(customerState.directory);
    const keys = Object.keys(dir);

    let withMeridiq = 0;
    let withDriveFolderId = 0;
    let noMeridiqJournal = 0;
    let duplicateCandidates = 0;

    for (const k of keys) {
      const e = dir[k];
      if (e?.meridiqMeta) withMeridiq++;
      if (e?.driveFolderId) withDriveFolderId++;
      if (e?.noMeridiqJournal) noMeridiqJournal++;
      if (e?.duplicateCandidate) duplicateCandidates++;
    }

    return {
      tenantId,
      totalPatients: keys.length,
      withMeridiqMeta: withMeridiq,
      withDriveFolderId,
      noMeridiqJournal,
      duplicateCandidates,
      driveStatus: 'pending_service_account_auth',
    };
  }

  return {
    getCard,
    listAllCards,
    summary,
  };
}

module.exports = {
  createMasterPatientCardLookup,
  deriveBrandFromTenant,
  deriveEncountersFromJournals,
  buildTimeline,
};
