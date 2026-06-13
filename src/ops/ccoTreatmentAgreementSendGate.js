'use strict';

const {
  assertTemplateVersionApprovedForAgreement,
  resolveTemplateApprovalForAgreement,
} = require('./ccoTreatmentAgreementTemplateGate');
const { assertBundleReadyToSend } = require('./ccoTreatmentAgreementBundle');
const { resolveAgreementTemplateBinding } = require('./ccoTemplateVersionApprovalStore');

async function evaluateSendForSignGate({
  treatmentAgreementStore,
  templateVersionApprovalStore,
  tenantId,
  patientId,
} = {}) {
  if (!patientId) {
    return { allowed: false, httpStatus: 400, error: 'patientId krävs.' };
  }

  const agreement = await treatmentAgreementStore.getPatientAgreement({ tenantId, patientId });
  if (!agreement?.agreementDocumentId) {
    return {
      allowed: false,
      httpStatus: 404,
      error: 'Inget avtal att skicka — skapa från offert först.',
      needsFromOffer: true,
    };
  }

  const templateGate = await assertTemplateVersionApprovedForAgreement({
    templateVersionApprovalStore,
    agreement,
    actionLabel: 'skicka för signering',
  });
  if (!templateGate.allowed) {
    return {
      allowed: false,
      httpStatus: 409,
      error: templateGate.reason,
      needsLegalReview: true,
      templateId: templateGate.binding?.templateId || null,
      templateVersion: templateGate.binding?.templateVersion || null,
      approvalStatus: templateGate.approval?.status || 'saknas',
    };
  }

  const templateApproval = await resolveTemplateApprovalForAgreement(
    templateVersionApprovalStore,
    agreement
  );
  const bundleGate = assertBundleReadyToSend(agreement, { templateApproval });
  if (!bundleGate.allowed) {
    return {
      allowed: false,
      httpStatus: 409,
      error: bundleGate.reason,
      bundleStatus: bundleGate.bundleStatus,
    };
  }

  const binding = resolveAgreementTemplateBinding(agreement);
  return {
    allowed: true,
    httpStatus: 200,
    templateId: binding.templateId || null,
    templateVersion: binding.templateVersion || null,
    templateVersionApproved: true,
    bundleStatus: bundleGate.bundleStatus,
    deliveryMode: agreement.deliveryMode || 'plats',
  };
}

module.exports = {
  evaluateSendForSignGate,
};
