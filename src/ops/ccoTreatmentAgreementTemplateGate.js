'use strict';

const {
  resolveAgreementTemplateBinding,
  isTemplateVersionApproved,
} = require('./ccoTemplateVersionApprovalStore');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function resolveTemplateApprovalForAgreement(templateVersionApprovalStore, agreement = {}) {
  if (!templateVersionApprovalStore?.getApproval) return null;
  const binding = resolveAgreementTemplateBinding(agreement);
  if (!binding.requiresApproval) return null;
  return templateVersionApprovalStore.getApproval({
    templateId: binding.templateId,
    version: binding.templateVersion,
  });
}

async function assertTemplateVersionApprovedForAgreement({
  templateVersionApprovalStore,
  agreement,
  actionLabel = 'fortsätta',
} = {}) {
  const binding = resolveAgreementTemplateBinding(agreement);
  if (!binding.requiresApproval) {
    return { allowed: true, binding, approval: null };
  }
  const approval = await resolveTemplateApprovalForAgreement(
    templateVersionApprovalStore,
    agreement
  );
  if (isTemplateVersionApproved(approval)) {
    return { allowed: true, binding, approval };
  }
  const status = normalizeText(approval?.status) || 'saknas';
  return {
    allowed: false,
    binding,
    approval,
    reason: `Mall-version ${binding.templateId}@${binding.templateVersion} saknar godkänd legal review (${status}) — kan inte ${actionLabel}.`,
  };
}

module.exports = {
  resolveTemplateApprovalForAgreement,
  assertTemplateVersionApprovedForAgreement,
};
