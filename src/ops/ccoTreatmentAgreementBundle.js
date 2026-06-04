'use strict';

const { resolveTemplate } = require('./meridiqConsentCatalogRuntime');
const {
  resolveAgreementTemplateBinding,
  isTemplateVersionApproved,
} = require('./ccoTemplateVersionApprovalStore');

const BUNDLE_STATUSES = Object.freeze([
  'missing_consent_template',
  'ready_to_send',
  'sent',
  'signed',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function deriveTreatmentTypeFromOffer(offerType = '') {
  const raw = normalizeKey(offerType);
  if (!raw) return 'hair_transplant';
  if (raw.includes('dhi')) return 'dhi';
  if (raw.includes('fue')) return 'fue';
  if (raw.includes('prp')) return 'prp';
  if (raw.includes('microneedling')) return 'microneedling';
  if (raw.includes('hårtransplant') || raw.includes('hartransplant')) return 'hair_transplant';
  return 'hair_transplant';
}

function emptyConsentState() {
  return {
    templateId: '',
    templateApiId: null,
    templateVersion: '',
    templateTitle: '',
    signed: false,
    signedAt: '',
    signedBy: '',
  };
}

function normalizeConsentState(input = {}, existing = {}) {
  const safe = asObject(input);
  const prev = asObject(existing);
  return {
    templateId: normalizeText(safe.templateId || prev.templateId),
    templateApiId:
      safe.templateApiId != null
        ? Number(safe.templateApiId)
        : prev.templateApiId != null
          ? Number(prev.templateApiId)
          : null,
    templateVersion: normalizeText(safe.templateVersion || prev.templateVersion),
    templateTitle: normalizeText(safe.templateTitle || prev.templateTitle),
    signed: safe.signed === true || prev.signed === true,
    signedAt: normalizeText(safe.signedAt || prev.signedAt),
    signedBy: normalizeText(safe.signedBy || prev.signedBy),
  };
}

function resolveConsentTemplateForAgreement(agreement = {}, options = {}) {
  const treatmentType =
    normalizeText(agreement.treatmentType) || deriveTreatmentTypeFromOffer(agreement.offerType);
  return resolveTemplate(treatmentType, options);
}

function computeBundleStatus(
  agreement = {},
  { consentResolution = null, templateApproval = null } = {}
) {
  const safe = asObject(agreement);
  const agreementStatus = normalizeKey(safe.agreementStatus);
  const consent = normalizeConsentState(safe.consent);
  const resolution = consentResolution || resolveConsentTemplateForAgreement(safe);

  if (agreementStatus === 'bookable' || (agreementStatus === 'signed' && consent.signed)) {
    return 'signed';
  }
  if (agreementStatus === 'sent' || agreementStatus === 'cooling_off') {
    return 'sent';
  }
  if (!resolution?.found) {
    return 'missing_consent_template';
  }
  if (!normalizeText(safe.agreementDocumentId)) {
    return 'missing_consent_template';
  }
  const binding = resolveAgreementTemplateBinding(safe);
  if (binding.requiresApproval && !isTemplateVersionApproved(templateApproval)) {
    return 'missing_consent_template';
  }
  return 'ready_to_send';
}

function applyConsentTemplateToAgreement(agreement = {}, resolution = {}) {
  const safe = asObject(agreement);
  const consent = normalizeConsentState(safe.consent);
  if (resolution?.found && resolution.template) {
    consent.templateId = resolution.template.id;
    consent.templateApiId = resolution.template.apiId;
    consent.templateVersion = resolution.template.version;
    consent.templateTitle = resolution.template.title;
  }
  return {
    ...safe,
    treatmentType:
      normalizeText(safe.treatmentType) ||
      resolution?.treatmentType ||
      deriveTreatmentTypeFromOffer(safe.offerType),
    consent,
    bundleStatus: computeBundleStatus({ ...safe, consent }, { consentResolution: resolution }),
  };
}

function assertBundleReadyToSend(agreement = {}, { templateApproval = null } = {}) {
  const resolution = resolveConsentTemplateForAgreement(agreement);
  const bundleStatus = computeBundleStatus(agreement, {
    consentResolution: resolution,
    templateApproval,
  });
  if (bundleStatus === 'missing_consent_template') {
    return {
      allowed: false,
      bundleStatus,
      resolution,
      reason: resolution?.found
        ? 'Avtal+bundle saknar dokument eller mall-godkännande — kan inte skicka.'
        : `Behandlingssamtycke saknas för ${normalizeText(agreement.treatmentType) || 'behandlingstyp'}.`,
    };
  }
  if (bundleStatus !== 'ready_to_send') {
    return {
      allowed: false,
      bundleStatus,
      resolution,
      reason: `Bundle är ${bundleStatus} — kan inte skicka för signering.`,
    };
  }
  return { allowed: true, bundleStatus, resolution, reason: '' };
}

function parsePublicConsentAck(body = {}) {
  const safe = asObject(body);
  const raw = safe.consent_ack ?? safe.consentAck ?? safe.consentAccepted;
  if (raw === true || raw === 1 || raw === '1' || raw === 'on' || raw === 'yes') return true;
  return normalizeKey(String(raw)) === 'true';
}

module.exports = {
  BUNDLE_STATUSES,
  deriveTreatmentTypeFromOffer,
  emptyConsentState,
  normalizeConsentState,
  resolveConsentTemplateForAgreement,
  computeBundleStatus,
  applyConsentTemplateToAgreement,
  assertBundleReadyToSend,
  parsePublicConsentAck,
};
