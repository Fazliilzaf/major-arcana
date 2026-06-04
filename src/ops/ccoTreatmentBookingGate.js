'use strict';

const { buildTreatmentAgreementReadout } = require('./ccoTreatmentAgreementStore');
const { resolveTemplateApprovalForAgreement } = require('./ccoTreatmentAgreementTemplateGate');

const CONSULTATION_SERVICE_IDS = new Set([
  'consultation-online',
  'consultation-physical',
  'followup-transplant',
  'consultation',
  'konsultation',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function requiresTreatmentAgreement(serviceId) {
  const id = normalizeKey(serviceId);
  if (!id) return false;
  return !CONSULTATION_SERVICE_IDS.has(id);
}

function collectServiceIds(body = {}) {
  const ids = new Set();
  const add = (value) => {
    if (!value || typeof value !== 'object') return;
    const id = normalizeText(value.serviceId || value.service);
    if (id) ids.add(id);
  };
  add(body.slot);
  add(body.selectedSlot);
  asArray(body.selectedSlots || body.slots).forEach(add);
  const direct = normalizeText(body.serviceId);
  if (direct) ids.add(direct);
  return [...ids];
}

function treatmentServiceIds(body = {}) {
  return collectServiceIds(body).filter(requiresTreatmentAgreement);
}

async function resolvePatientId({ patientMasterStore, tenantId, patientId, customerEmail } = {}) {
  const direct = normalizeText(patientId);
  if (direct) return direct;
  const email = normalizeText(customerEmail);
  if (!email || !patientMasterStore?.findPatientByEmail) return '';
  const patient = await patientMasterStore.findPatientByEmail({ tenantId, email });
  return patient?.id || '';
}

async function checkTreatmentBookingGate({
  treatmentAgreementStore,
  templateVersionApprovalStore = null,
  patientMasterStore,
  tenantId,
  patientId,
  customerEmail,
  body = {},
} = {}) {
  const gatedServiceIds = treatmentServiceIds(body);
  if (!gatedServiceIds.length) {
    return {
      allowed: true,
      gated: false,
      serviceIds: [],
      patientId: '',
      agreementReadout: null,
    };
  }

  const resolvedPatientId = await resolvePatientId({
    patientMasterStore,
    tenantId,
    patientId: patientId || body.patientId,
    customerEmail,
  });

  if (!resolvedPatientId) {
    return {
      allowed: false,
      gated: true,
      serviceIds: gatedServiceIds,
      patientId: '',
      reason: 'patient_master_link_required',
      message: 'Koppla kunden i patientregistret innan behandlingsbokning.',
      agreementReadout: null,
    };
  }

  if (!treatmentAgreementStore?.getPatientAgreement) {
    return {
      allowed: false,
      gated: true,
      serviceIds: gatedServiceIds,
      patientId: resolvedPatientId,
      reason: 'treatment_agreement_store_missing',
      message: 'Behandlingsavtalslagring saknas.',
      agreementReadout: null,
    };
  }

  const agreement = await treatmentAgreementStore.getPatientAgreement({
    tenantId,
    patientId: resolvedPatientId,
  });
  const templateApproval = await resolveTemplateApprovalForAgreement(
    templateVersionApprovalStore,
    agreement || {}
  );
  const agreementReadout = buildTreatmentAgreementReadout(agreement || {}, { templateApproval });

  if (agreementReadout.bookable) {
    return {
      allowed: true,
      gated: true,
      serviceIds: gatedServiceIds,
      patientId: resolvedPatientId,
      agreement,
      agreementReadout,
    };
  }

  return {
    allowed: false,
    gated: true,
    serviceIds: gatedServiceIds,
    patientId: resolvedPatientId,
    reason: 'treatment_agreement_not_bookable',
    message: agreementReadout.nextStep || 'Behandlingsavtal måste signeras innan bokning.',
    agreement,
    agreementReadout,
  };
}

async function assertTreatmentBookingAllowed(options = {}) {
  const gate = await checkTreatmentBookingGate(options);
  if (gate.allowed) return gate;
  const error = new Error(gate.message || 'Behandlingsbokning spärrad.');
  error.statusCode = 409;
  error.metadata = {
    code: gate.reason || 'treatment_agreement_not_bookable',
    serviceIds: gate.serviceIds,
    patientId: gate.patientId,
    agreementReadout: gate.agreementReadout,
  };
  throw error;
}

function buildTreatmentAgreementBookingBlocker(gate = {}) {
  if (!gate.gated || gate.allowed) return null;
  return {
    key: normalizeText(gate.reason) || 'treatment_agreement_not_bookable',
    label: normalizeText(gate.message) || 'Behandlingsavtal saknas.',
    score: 30,
    action: '',
    nextActionLabel: 'avtal krävs',
    tone: 'blocked',
    treatmentAgreementGate: {
      allowed: false,
      patientId: gate.patientId || '',
      serviceIds: gate.serviceIds || [],
      agreementReadout: gate.agreementReadout || null,
    },
  };
}

module.exports = {
  assertTreatmentBookingAllowed,
  buildTreatmentAgreementBookingBlocker,
  checkTreatmentBookingGate,
  collectServiceIds,
  requiresTreatmentAgreement,
  treatmentServiceIds,
};
