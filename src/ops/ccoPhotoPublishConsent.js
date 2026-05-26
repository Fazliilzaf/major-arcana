'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizePhotoPublishConsent(input = {}, existing = {}) {
  const safe = asObject(input);
  const prev = asObject(existing);
  const merged = asObject(safe.publishBeforeAfterPhotos || prev.publishBeforeAfterPhotos);
  return {
    publishBeforeAfterPhotos: {
      granted: Boolean(merged.granted),
      grantedAt: normalizeText(merged.grantedAt),
      grantedBy: normalizeText(merged.grantedBy),
      note: normalizeText(merged.note),
    },
  };
}

async function getPhotoPublishConsent({ patientMasterStore, tenantId, patientId } = {}) {
  if (!patientMasterStore?.getPatient) {
    return normalizePhotoPublishConsent();
  }
  const patient = await patientMasterStore.getPatient({ tenantId, patientId });
  return normalizePhotoPublishConsent(asObject(patient?.consents));
}

async function setPhotoPublishConsent({
  patientMasterStore,
  tenantId,
  patientId,
  granted = false,
  note = '',
  actor = {},
} = {}) {
  if (!patientMasterStore?.upsertPatient) {
    const error = new Error('Patientmaster saknas.');
    error.statusCode = 503;
    throw error;
  }
  const patient = await patientMasterStore.getPatient({ tenantId, patientId });
  if (!patient) {
    const error = new Error('Patient hittades inte.');
    error.statusCode = 404;
    throw error;
  }
  const existing = normalizePhotoPublishConsent(asObject(patient.consents));
  const next = normalizePhotoPublishConsent({
    publishBeforeAfterPhotos: {
      granted: Boolean(granted),
      grantedAt: granted ? new Date().toISOString() : '',
      grantedBy: granted ? normalizeText(actor.displayName || actor.userId) : '',
      note: normalizeText(note),
    },
  }, existing);
  const updated = await patientMasterStore.upsertPatient({
    tenantId,
    id: patientId,
    consents: next,
  });
  return {
    consent: normalizePhotoPublishConsent(asObject(updated?.consents)),
    patientId,
  };
}

module.exports = {
  getPhotoPublishConsent,
  normalizePhotoPublishConsent,
  setPhotoPublishConsent,
};
