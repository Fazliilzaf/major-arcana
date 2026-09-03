'use strict';

const path = require('node:path');
const { buildTreatmentAgreementReadout } = require('./ccoTreatmentAgreementStore');
const { resolveTemplateApprovalForAgreement } = require('./ccoTreatmentAgreementTemplateGate');
const {
  computeReadyForTreatment,
  isIdVerificationHardGateEnabled,
} = require('./ccoKunderFasAReadiness');
const {
  assertOperationDayJournalAllowedForPatient,
  patientFitnessSigned,
  resolveFitnessSignedFromJournal,
  resolveTodayVisitForPatient,
} = require('./ccoOperationDayGate');

/**
 * ORD-188 — vilka tjänster som kräver behandlingsavtal härleds ur facit.
 *
 * HÄR STOD EN HÅRDKODAD LISTA: fue, dhi, beard, eyebrow. Den var riktig när den
 * skrevs — och blev fel samma dag jag lade till tre ingrepp till.
 *
 * ORD-177 gav fue-scar och dhi-scar, ORD-178 gav dhi-beard. Alla tre är
 * transplantationer under lokalbedövning. Ingen av dem hamnade i den här
 * listan, eftersom ingenting kopplade ihop de två ställena. Resultatet: tre
 * ingrepp som gick att boka utan behandlingsavtal.
 *
 * Det är samma feltyp som ORD-177 rättade i personalportalen — ett krav
 * definierat på två ställen blir olika på de två ställena. Nu finns kravet på
 * ett ställe: config/ordinationskravande-tjanster.json. En tjänst som kräver
 * läkarordination är ett ingrepp, och ett ingrepp kräver behandlingsavtal.
 *
 * `null` (kliniken har inte tagit ställning) räknas INTE som krav här. Att
 * kräva avtal för något oklassificerat hade stoppat bokningar av PRP och
 * estetiska behandlingar som säljs i dag. Grinden på operationsdagen är
 * däremot fail-closed — se ccoOperationDayGate.
 */
const { KRAVER: ORDINATIONSKRAVANDE } = require('./ordinationRequirement');

const TREATMENT_AGREEMENT_REQUIRED_SERVICE_IDS = new Set(
  [...ORDINATIONSKRAVANDE].map((id) => String(id).toLowerCase())
);

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
  return TREATMENT_AGREEMENT_REQUIRED_SERVICE_IDS.has(id);
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

async function resolvePatientIdentityVerified({
  patientIdentityStore = null,
  config = null,
  patientId,
} = {}) {
  if (!isIdVerificationHardGateEnabled()) return true;
  const pid = normalizeText(patientId);
  if (!pid) return false;

  let store = patientIdentityStore;
  if (!store) {
    try {
      const { createPatientIdentityStore } = require('./patientIdentityVerification');
      const identityPath =
        config?.ccoPatientIdentityStorePath ||
        (config?.stateRoot
          ? path.join(config.stateRoot, 'cco-patient-identity.json')
          : path.join(process.cwd(), 'data', 'cco-patient-identity.json'));
      store = createPatientIdentityStore({ filePath: identityPath });
      await store.load();
    } catch {
      return false;
    }
  }

  try {
    return store.isVerified(pid);
  } catch {
    return false;
  }
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
  patientIdentityStore = null,
  bookingStore = null,
  journalStore = null,
  config = null,
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

  if (!agreementReadout.bookable) {
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

  let patientCard = null;
  if (patientMasterStore?.getPatient) {
    try {
      patientCard = await patientMasterStore.getPatient({
        tenantId,
        patientId: resolvedPatientId,
      });
    } catch {
      patientCard = null;
    }
  }

  const todayVisit = await resolveTodayVisitForPatient({
    patient: patientCard || {},
    bookingStore,
    tenantId,
  });
  const fitnessSigned = await resolveFitnessSignedFromJournal({
    journalStore,
    tenantId,
    patientId: resolvedPatientId,
    patient: patientCard || {},
  });
  const identityVerified = await resolvePatientIdentityVerified({
    patientIdentityStore,
    config,
    patientId: resolvedPatientId,
  });
  const readinessReadout = {
    missingAgreement: false,
    missingHealthDeclaration: patientCard?.missingHealthDeclaration === true,
    missingForm: false,
    missingJournal: false,
    hasJournalPhoto: false,
    photoConsent: { signed: true },
    todayVisit,
    fitnessSigned,
    identityVerified,
  };
  const readyForTreatment = computeReadyForTreatment(readinessReadout, {
    bookable: true,
    coolingOff: agreementReadout.coolingOff || { active: false },
  });

  if (todayVisit && !fitnessSigned) {
    return {
      allowed: false,
      gated: true,
      serviceIds: gatedServiceIds,
      patientId: resolvedPatientId,
      reason: 'operation_day_fitness_required',
      message: 'Friskförsäkran måste signeras innan behandlingsbokning på operationsdagen.',
      agreement,
      agreementReadout,
      readyForTreatment,
    };
  }

  if (!readyForTreatment && agreementReadout.coolingOff?.active) {
    return {
      allowed: false,
      gated: true,
      serviceIds: gatedServiceIds,
      patientId: resolvedPatientId,
      reason: 'treatment_not_ready',
      message: 'Betänketid eller readiness-krav är inte uppfyllda än.',
      agreement,
      agreementReadout,
      readyForTreatment,
    };
  }

  if (isIdVerificationHardGateEnabled() && !identityVerified) {
    return {
      allowed: false,
      gated: true,
      serviceIds: gatedServiceIds,
      patientId: resolvedPatientId,
      reason: 'identity_verification_required',
      message: 'ID-verifiering krävs innan behandlingsbokning.',
      agreement,
      agreementReadout,
      readyForTreatment,
    };
  }

  return {
    allowed: true,
    gated: true,
    serviceIds: gatedServiceIds,
    patientId: resolvedPatientId,
    agreement,
    agreementReadout,
    readyForTreatment,
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
  // ORD-188: exporteras för att gå att MÄTA. Testet som skulle bevisa att
  // listan härleds ur facit hoppade tyst över kontrollen så länge setet var
  // privat — och var därmed grönt även när listan hårdkodades tillbaka.
  TREATMENT_AGREEMENT_REQUIRED_SERVICE_IDS,
  assertTreatmentBookingAllowed,
  buildTreatmentAgreementBookingBlocker,
  checkTreatmentBookingGate,
  collectServiceIds,
  requiresTreatmentAgreement,
  treatmentServiceIds,
};
