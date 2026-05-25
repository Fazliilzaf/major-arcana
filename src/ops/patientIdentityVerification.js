'use strict';

/**
 * Patient Identity Verification module.
 *
 * Kostnadsfria metoder:
 * - manual_id_upload: patient laddar upp foto av pass/körkort/nationellt ID
 * - selfie_match: patient tar selfie, personal jämför visuellt mot ID-foto
 * - in_person: personal verifierar legitimation vid fysiskt besök
 * - eu_wallet: EU Digital Identity Wallet (stub — redo för eIDAS 2.0)
 *
 * Framtida betalda integrationer (aktiveras med API-nyckel):
 * - bankid_se: BankID Sverige
 * - freja_eid: Freja eID+ (Norden/EU)
 * - kyc_provider: iDenfy / Onfido / Vouched
 */

const crypto = require('node:crypto');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

const VERIFICATION_STATUSES = Object.freeze([
  'unverified',
  'pending_upload',
  'pending_review',
  'verified',
  'rejected',
  'expired',
]);

const VERIFICATION_METHODS = Object.freeze([
  'manual_id_upload',
  'selfie_match',
  'in_person',
  'eu_wallet',
  'bankid_se',
  'freja_eid',
  'kyc_provider',
]);

const FREE_METHODS = Object.freeze(['manual_id_upload', 'selfie_match', 'in_person', 'eu_wallet']);

function createIdentityVerificationRecord({
  patientId,
  tenantId,
  method = 'manual_id_upload',
  documentType,
  documentCountry,
}) {
  return {
    verificationId: crypto.randomUUID(),
    patientId: normalizeText(patientId),
    tenantId: normalizeText(tenantId),
    method: VERIFICATION_METHODS.includes(method) ? method : 'manual_id_upload',
    status: 'pending_upload',
    documentType: normalizeText(documentType) || null,
    documentCountry: normalizeText(documentCountry) || null,
    idPhotoPath: null,
    selfiePhotoPath: null,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    verifiedAt: null,
    expiresAt: null,
    metadata: {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function createPatientIdentityStore({ filePath }) {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  let state = { verifications: [] };

  async function load() {
    try {
      state = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      /* first run */
    }
  }

  async function persist() {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, filePath);
  }

  async function initiate({ patientId, tenantId, method, documentType, documentCountry }) {
    const record = createIdentityVerificationRecord({
      patientId,
      tenantId,
      method,
      documentType,
      documentCountry,
    });
    state.verifications.push(record);
    await persist();
    return record;
  }

  async function uploadIdPhoto(verificationId, photoPath) {
    const rec = state.verifications.find((v) => v.verificationId === verificationId);
    if (!rec) return null;
    rec.idPhotoPath = normalizeText(photoPath);
    rec.status = 'pending_review';
    rec.updatedAt = nowIso();
    await persist();
    return rec;
  }

  async function uploadSelfie(verificationId, selfiePhotoPath) {
    const rec = state.verifications.find((v) => v.verificationId === verificationId);
    if (!rec) return null;
    rec.selfiePhotoPath = normalizeText(selfiePhotoPath);
    if (rec.idPhotoPath) rec.status = 'pending_review';
    rec.updatedAt = nowIso();
    await persist();
    return rec;
  }

  async function approve(verificationId, { reviewedBy, expiresInMonths = 24 }) {
    const rec = state.verifications.find((v) => v.verificationId === verificationId);
    if (!rec) return null;
    rec.status = 'verified';
    rec.reviewedBy = normalizeText(reviewedBy);
    rec.reviewedAt = nowIso();
    rec.verifiedAt = nowIso();
    rec.expiresAt = new Date(Date.now() + expiresInMonths * 30 * 86400000).toISOString();
    rec.updatedAt = nowIso();
    await persist();
    return rec;
  }

  async function reject(verificationId, { reviewedBy, reason }) {
    const rec = state.verifications.find((v) => v.verificationId === verificationId);
    if (!rec) return null;
    rec.status = 'rejected';
    rec.reviewedBy = normalizeText(reviewedBy);
    rec.reviewedAt = nowIso();
    rec.rejectionReason = normalizeText(reason) || 'ID kunde inte verifieras.';
    rec.updatedAt = nowIso();
    await persist();
    return rec;
  }

  async function markInPerson(patientId, { verifiedBy, tenantId }) {
    const record = createIdentityVerificationRecord({ patientId, tenantId, method: 'in_person' });
    record.status = 'verified';
    record.reviewedBy = normalizeText(verifiedBy);
    record.reviewedAt = nowIso();
    record.verifiedAt = nowIso();
    record.expiresAt = new Date(Date.now() + 24 * 30 * 86400000).toISOString();
    state.verifications.push(record);
    await persist();
    return record;
  }

  function getLatest(patientId) {
    const pid = normalizeText(patientId);
    const records = state.verifications
      .filter((v) => v.patientId === pid)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return records[0] || null;
  }

  function isVerified(patientId) {
    const latest = getLatest(patientId);
    if (!latest || latest.status !== 'verified') return false;
    if (latest.expiresAt && new Date(latest.expiresAt) < new Date()) return false;
    return true;
  }

  function getPatientVerificationStatus(patientId) {
    const latest = getLatest(patientId);
    if (!latest) return { status: 'unverified', method: null, verifiedAt: null };
    return {
      status: latest.status,
      method: latest.method,
      verifiedAt: latest.verifiedAt,
      expiresAt: latest.expiresAt,
      reviewedBy: latest.reviewedBy,
    };
  }

  function listPendingReviews(tenantId) {
    const tid = normalizeText(tenantId);
    return state.verifications.filter(
      (v) => v.status === 'pending_review' && (!tid || v.tenantId === tid)
    );
  }

  function listAvailableMethods() {
    const methods = [...FREE_METHODS];
    if (normalizeText(process.env.BANKID_API_KEY)) methods.push('bankid_se');
    if (normalizeText(process.env.FREJA_API_KEY)) methods.push('freja_eid');
    if (normalizeText(process.env.KYC_PROVIDER_API_KEY)) methods.push('kyc_provider');
    return methods;
  }

  return {
    load,
    persist,
    initiate,
    uploadIdPhoto,
    uploadSelfie,
    approve,
    reject,
    markInPerson,
    getLatest,
    isVerified,
    getPatientVerificationStatus,
    listPendingReviews,
    listAvailableMethods,
    VERIFICATION_STATUSES,
    VERIFICATION_METHODS,
    FREE_METHODS,
  };
}

module.exports = {
  createPatientIdentityStore,
  createIdentityVerificationRecord,
  VERIFICATION_STATUSES,
  VERIFICATION_METHODS,
  FREE_METHODS,
};
