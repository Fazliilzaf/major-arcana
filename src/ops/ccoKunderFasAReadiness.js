'use strict';

const path = require('node:path');
const { getPhotoPublishConsent } = require('./ccoPhotoPublishConsent');

const TREATMENT_PLAN_OK = new Set(['created', 'sent', 'accepted']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function emptyPhotoConsent() {
  return { signed: false, grantedAt: '', grantedBy: '' };
}

function computeReadyForTreatment(readout = {}, agreement = null) {
  const cooling = agreement?.coolingOff || { active: false };
  const bundleOk = agreement?.bookable === true;
  const opsOk = readout.todayVisit !== true || readout.fitnessSigned === true;
  const photoOk = readout.hasJournalPhoto !== true || readout.photoConsent?.signed === true;
  return (
    bundleOk &&
    !cooling.active &&
    opsOk &&
    photoOk &&
    readout.missingHealthDeclaration !== true &&
    readout.missingForm !== true &&
    readout.missingJournal !== true
  );
}

function applyFasAReadoutFields(readout, fasA = {}, agreement = null) {
  const safe = readout && typeof readout === 'object' ? readout : {};
  safe.treatmentPlanStatus = normalizeText(fasA.treatmentPlanStatus) || null;
  safe.photoConsent =
    fasA.photoConsent && typeof fasA.photoConsent === 'object'
      ? fasA.photoConsent
      : emptyPhotoConsent();
  safe.fitnessSigned = fasA.fitnessSigned === true;
  safe.hasJournalPhoto = Boolean(safe.needsPhotoReview);
  safe.identityStatus = normalizeText(fasA.identityStatus) || 'unverified';
  safe.identityVerified = fasA.identityVerified === true;
  safe.identityMethod = normalizeText(fasA.identityMethod) || null;
  safe.identityVerifiedAt = normalizeText(fasA.identityVerifiedAt) || null;
  safe.readyForTreatment = computeReadyForTreatment(safe, agreement);
  safe.readyForVisit = safe.readyForTreatment;
  return safe;
}

async function loadFasAContextForPatients({
  config,
  tenantId,
  patients = [],
  patientMasterStore = null,
} = {}) {
  const map = new Map();
  const list = Array.isArray(patients) ? patients : [];
  if (!list.length) return map;

  let consultationStore = null;
  let journalStore = null;
  try {
    const { createCcoConsultationStore } = require('./ccoConsultationStore');
    const consultPath =
      config?.ccoConsultationStorePath ||
      path.join(process.cwd(), 'data', 'cco-consultation-cases.json');
    consultationStore = await createCcoConsultationStore({ filePath: consultPath });
  } catch {
    consultationStore = null;
  }
  try {
    const { createCcoJournalStore } = require('./ccoJournalStore');
    const journalPath =
      config?.ccoJournalStorePath || path.join(process.cwd(), 'data', 'cco-journal-entries.json');
    journalStore = await createCcoJournalStore({ filePath: journalPath });
  } catch {
    journalStore = null;
  }

  let identityStore = null;
  try {
    const { createPatientIdentityStore } = require('./patientIdentityVerification');
    const identityPath =
      config?.ccoPatientIdentityStorePath ||
      (config?.stateRoot
        ? path.join(config.stateRoot, 'cco-patient-identity.json')
        : path.join(process.cwd(), 'data', 'cco-patient-identity.json'));
    identityStore = createPatientIdentityStore({ filePath: identityPath });
    await identityStore.load();
  } catch {
    identityStore = null;
  }

  for (const patient of list) {
    const patientId = normalizeText(patient?.id);
    if (!patientId) continue;

    let treatmentPlanStatus = '';
    if (consultationStore?.getCase) {
      try {
        const consultationCase = await consultationStore.getCase({ tenantId, patientId });
        treatmentPlanStatus = normalizeText(consultationCase?.treatmentPlanStatus);
      } catch {
        treatmentPlanStatus = '';
      }
    }

    let photoConsent = emptyPhotoConsent();
    if (patientMasterStore) {
      try {
        const raw = await getPhotoPublishConsent({
          patientMasterStore,
          tenantId,
          patientId,
        });
        const granted = Boolean(raw?.publishBeforeAfterPhotos?.granted);
        photoConsent = {
          signed: granted,
          grantedAt: normalizeText(raw?.publishBeforeAfterPhotos?.grantedAt),
          grantedBy: normalizeText(raw?.publishBeforeAfterPhotos?.grantedBy),
        };
      } catch {
        photoConsent = emptyPhotoConsent();
      }
    }

    let fitnessSigned = false;
    if (journalStore?.listEntries) {
      try {
        const entries =
          (await journalStore.listEntries({
            tenantId,
            patientId,
            journalType: 'fitness_certificate',
          })) || [];
        fitnessSigned = entries.some((entry) => {
          const status = normalizeKey(entry?.status);
          return status === 'signed' || Boolean(normalizeText(entry?.signedAt));
        });
      } catch {
        fitnessSigned = false;
      }
    }

    let identityStatus = 'unverified';
    let identityVerified = false;
    let identityMethod = null;
    let identityVerifiedAt = null;
    if (identityStore?.getPatientVerificationStatus) {
      try {
        const idReadout = identityStore.getPatientVerificationStatus(patientId);
        identityStatus = normalizeText(idReadout?.status) || 'unverified';
        identityVerified = identityStore.isVerified(patientId);
        identityMethod = normalizeText(idReadout?.method) || null;
        identityVerifiedAt = normalizeText(idReadout?.verifiedAt) || null;
      } catch {
        identityStatus = 'unverified';
        identityVerified = false;
        identityMethod = null;
        identityVerifiedAt = null;
      }
    }

    map.set(patientId, {
      treatmentPlanStatus,
      photoConsent,
      fitnessSigned,
      identityStatus,
      identityVerified,
      identityMethod,
      identityVerifiedAt,
    });
  }

  return map;
}

module.exports = {
  TREATMENT_PLAN_OK,
  computeReadyForTreatment,
  applyFasAReadoutFields,
  loadFasAContextForPatients,
};
