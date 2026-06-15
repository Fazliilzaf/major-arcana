'use strict';

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

const LEGACY_TREATMENT_CONSENT_PATTERNS = [
  /behandlingsavtal/i,
  /treatment[_-]?agreement/i,
  /agreement[_-]?consent/i,
  /consent[_-]?bundle/i,
  /meridiq[_-]?consent/i,
  /\b170917\b/,
  /\b170955\b/,
  /\b170944\b/,
  /\b170945\b/,
  /\b170946\b/,
  /\b170947\b/,
  /\b170948\b/,
];

function isLegacyTreatmentConsentSend(body = {}) {
  const values = [
    body.consentKind,
    body.templateRef,
    body.templateId,
    body.templateApiId,
    body.consentApiId,
    body.registryId,
    body.documentType,
  ].map((value) => normalizeText(value));
  const joined = values.filter(Boolean).join(' ');
  if (!joined) return false;
  return LEGACY_TREATMENT_CONSENT_PATTERNS.some((pattern) => pattern.test(joined));
}

function assertLegacyConsentSendAllowed(body = {}) {
  if (!isLegacyTreatmentConsentSend(body)) {
    return { allowed: true };
  }
  const error = new Error(
    'Behandlingsavtal och behandlingssamtycke måste skickas som en signerbar bundle.'
  );
  error.statusCode = 409;
  error.metadata = {
    code: 'treatment_agreement_bundle_required',
    consentKind: normalizeKey(body.consentKind),
    templateRef: normalizeText(body.templateRef),
  };
  throw error;
}

module.exports = {
  assertLegacyConsentSendAllowed,
  isLegacyTreatmentConsentSend,
};
