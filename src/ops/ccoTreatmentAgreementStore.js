'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const AGREEMENT_STATUSES = Object.freeze([
  'draft',
  'patient_info_sent',
  'sent',
  'cooling_off',
  'signed',
  'bookable',
  'cancelled',
]);

const DELIVERY_MODES = Object.freeze(['distans', 'plats']);
const {
  DEFAULT_COOLING_OFF_DAYS,
  coolingOffDaysForNewHairTpRecord,
} = require('./ccoHairTpCoolingOffPolicy');
const {
  computeSignedAgreementBookable,
  defaultTemplateBindingForOffer,
  resolveAgreementTemplateBinding,
  isTemplateVersionApproved,
} = require('./ccoTemplateVersionApprovalStore');
const {
  BUNDLE_STATUSES,
  computeBundleStatus,
  deriveTreatmentTypeFromOffer,
  normalizeConsentState,
  resolveConsentTemplateForAgreement,
} = require('./ccoTreatmentAgreementBundle');
const AGREEMENT_VERSION = '251203';

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = normalizeKey(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

function agreementKey(input = {}) {
  const tenantId = normalizeText(input.tenantId);
  const patientId = normalizeKey(input.patientId);
  return tenantId && patientId ? `${tenantId}::${patientId}` : '';
}

function emptyState() {
  return {
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    agreements: [],
  };
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function getCoolingOffMeta(agreement = {}, nowMs = Date.now()) {
  const endsAt = normalizeText(agreement.coolingOffEndsAt);
  if (!endsAt) {
    return { active: false, endsAt: '', remainingMs: 0, remainingDays: 0 };
  }
  const endsMs = Date.parse(endsAt);
  if (!Number.isFinite(endsMs)) {
    return { active: false, endsAt: '', remainingMs: 0, remainingDays: 0 };
  }
  const remainingMs = Math.max(0, endsMs - nowMs);
  return {
    active: remainingMs > 0,
    endsAt,
    remainingMs,
    remainingDays: Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
  };
}

function buildTreatmentAgreementReadout(
  agreement = {},
  { nowMs = Date.now(), templateApproval = null } = {}
) {
  const safe = asObject(agreement);
  const status = normalizeEnum(safe.agreementStatus, AGREEMENT_STATUSES, 'draft');
  const deliveryMode = normalizeEnum(safe.deliveryMode, DELIVERY_MODES, 'plats');
  const cooling = getCoolingOffMeta(safe, nowMs);
  const patientInfoSent = Boolean(safe.patientInfoSentAt);
  const templateBinding = resolveAgreementTemplateBinding(safe);
  const templateVersionApproved = templateBinding.requiresApproval
    ? isTemplateVersionApproved(templateApproval)
    : true;
  const consent = normalizeConsentState(safe.consent);
  const consentResolution = resolveConsentTemplateForAgreement(safe);
  const bundleStatus = computeBundleStatus(safe, { consentResolution, templateApproval });

  let phase = 'draft';
  let nextStep = 'Skicka patientinformation (bilaga 1) till kunden.';
  let waitingOn = 'operator';
  let bookable = false;

  if (status === 'cancelled') {
    phase = 'cancelled';
    nextStep = 'Avtalet är avbrutet.';
  } else if (status === 'bookable' || status === 'signed') {
    phase = status === 'bookable' ? 'bookable' : 'signed';
    bookable =
      computeSignedAgreementBookable(safe, templateApproval) &&
      (!consent.templateApiId || consent.signed === true);
    if (bookable) {
      nextStep = 'Avtalet är signerat — kunden kan boka behandlingstid.';
      waitingOn = 'customer';
    } else if (templateBinding.requiresApproval) {
      nextStep = `Mall ${templateBinding.templateId}@${templateBinding.templateVersion} väntar legal review.`;
      waitingOn = 'legal';
    } else {
      nextStep = 'Avtalet är signerat men inte bokningsbart än.';
      waitingOn = 'legal';
    }
  } else if (status === 'cooling_off' || (status === 'sent' && cooling.active)) {
    phase = 'cooling_off';
    nextStep = `Betänketid till ${cooling.endsAt.slice(0, 10)} (${cooling.remainingDays} dagar kvar).`;
    waitingOn = 'legal';
  } else if (status === 'sent') {
    phase = 'sent';
    nextStep = 'Väntar på kundsignering.';
    waitingOn = 'customer';
  } else if (status === 'patient_info_sent') {
    phase = 'patient_info_sent';
    nextStep = 'Skapa behandlingsavtal från accepterad offert.';
  } else if (patientInfoSent) {
    phase = 'patient_info_sent';
    nextStep = 'Skapa behandlingsavtal från accepterad offert.';
  }

  return {
    phase,
    status,
    deliveryMode,
    agreementVersion: normalizeText(safe.agreementVersion) || AGREEMENT_VERSION,
    patientInfoSent,
    patientInfoSentAt: normalizeText(safe.patientInfoSentAt),
    patientInfoChannel: normalizeText(safe.patientInfoChannel),
    coolingOff: cooling,
    signedAt: normalizeText(safe.signedAt),
    customerSignedName: normalizeText(safe.customerSignedName),
    nextStep,
    waitingOn,
    bookable,
    templateId: templateBinding.templateId || null,
    templateVersion: templateBinding.templateVersion || null,
    templateVersionApproved,
    templateApprovalStatus: normalizeText(templateApproval?.status) || null,
    treatmentType:
      normalizeText(safe.treatmentType) || deriveTreatmentTypeFromOffer(safe.offerType),
    bundleStatus,
    consent,
    consentSigned: consent.signed === true,
    consentTemplateResolved: consentResolution?.found === true,
    angerBlanketUrl:
      deliveryMode === 'distans'
        ? 'https://www.konsumentverket.se/for-foretag/konsumentratt-for-foretagare/om-konsumentratt/om-konsumentratt/angerblankett/'
        : '',
    patientInfoPdfUrl: '/patientinformation/hartransplantation-dhi-prp-minimal.pdf',
  };
}

function canAcceptAgreement(agreement = {}, options = {}) {
  const status = normalizeEnum(agreement.agreementStatus, AGREEMENT_STATUSES, 'draft');
  if (status === 'signed' || status === 'bookable') {
    return { allowed: false, reason: 'Behandlingsavtalet är redan signerat.' };
  }
  if (status !== 'sent' && status !== 'cooling_off') {
    return { allowed: false, reason: 'Avtalet måste skickas för signering först.' };
  }
  const deliveryMode = normalizeEnum(agreement.deliveryMode, DELIVERY_MODES, 'plats');
  const cooling = getCoolingOffMeta(agreement, options.nowMs);
  if (deliveryMode === 'distans' && cooling.active && options.forceAccept !== true) {
    return {
      allowed: false,
      reason: `Betänketid gäller till ${cooling.endsAt.slice(0, 10)} (${cooling.remainingDays} dagar kvar).`,
      coolingOff: cooling,
    };
  }
  return { allowed: true, reason: '', coolingOff: cooling };
}

function cloneAgreement(record) {
  if (!record) return null;
  return {
    ...record,
    attachments: asArray(record.attachments).map((item) => ({ ...item })),
    patientInfoLog: asArray(record.patientInfoLog).map((item) => ({ ...item })),
    events: asArray(record.events).map((event) => ({ ...event })),
  };
}

function normalizeAgreement(input = {}, existing = {}) {
  const safe = asObject(input);
  const previous = asObject(existing);
  const tenantId = normalizeText(safe.tenantId || previous.tenantId);
  const patientId = normalizeKey(safe.patientId || previous.patientId);
  if (!tenantId || !patientId) return null;

  const createdAt = normalizeText(previous.createdAt || safe.createdAt) || nowIso();

  return {
    agreementId: normalizeText(previous.agreementId || safe.agreementId) || crypto.randomUUID(),
    tenantId,
    patientId,
    patientName: normalizeText(safe.patientName || previous.patientName),
    deliveryMode: normalizeEnum(
      safe.deliveryMode || previous.deliveryMode,
      DELIVERY_MODES,
      'plats'
    ),
    agreementStatus: normalizeEnum(
      safe.agreementStatus || previous.agreementStatus,
      AGREEMENT_STATUSES,
      'draft'
    ),
    agreementVersion:
      normalizeText(safe.agreementVersion || previous.agreementVersion) || AGREEMENT_VERSION,
    templateId: normalizeText(safe.templateId || previous.templateId),
    templateVersion: normalizeText(safe.templateVersion || previous.templateVersion),
    treatmentType:
      normalizeText(safe.treatmentType || previous.treatmentType) ||
      deriveTreatmentTypeFromOffer(safe.offerType || previous.offerType),
    consent: normalizeConsentState(safe.consent, previous.consent),
    bundleStatus: normalizeEnum(
      safe.bundleStatus || previous.bundleStatus,
      BUNDLE_STATUSES,
      'missing_consent_template'
    ),
    linkedCommercialCaseId: normalizeText(
      safe.linkedCommercialCaseId || previous.linkedCommercialCaseId
    ),
    linkedJournalEntryId: normalizeText(safe.linkedJournalEntryId || previous.linkedJournalEntryId),
    offerType: normalizeText(safe.offerType || previous.offerType),
    quotedAmount: normalizeText(safe.quotedAmount || previous.quotedAmount),
    agreementDocumentId: normalizeText(safe.agreementDocumentId || previous.agreementDocumentId),
    agreementDocumentPdfId: normalizeText(
      safe.agreementDocumentPdfId || previous.agreementDocumentPdfId
    ),
    patientInfoVersion:
      normalizeText(safe.patientInfoVersion || previous.patientInfoVersion) || '251030-minimal',
    patientInfoSentAt: normalizeText(safe.patientInfoSentAt || previous.patientInfoSentAt),
    patientInfoChannel: normalizeText(safe.patientInfoChannel || previous.patientInfoChannel),
    patientInfoLog: asArray(safe.patientInfoLog).length
      ? asArray(safe.patientInfoLog)
      : asArray(previous.patientInfoLog),
    attachments: asArray(safe.attachments).length
      ? asArray(safe.attachments)
      : asArray(previous.attachments),
    coolingOffDays:
      Number(safe.coolingOffDays ?? previous.coolingOffDays) ||
      coolingOffDaysForNewHairTpRecord(previous.coolingOffDays),
    coolingOffEndsAt: normalizeText(safe.coolingOffEndsAt || previous.coolingOffEndsAt),
    esignToken: normalizeText(safe.esignToken || previous.esignToken),
    esignStatus: normalizeText(safe.esignStatus || previous.esignStatus) || 'draft',
    agreementSentAt: normalizeText(safe.agreementSentAt || previous.agreementSentAt),
    signedAt: normalizeText(safe.signedAt || previous.signedAt),
    customerSignedName: normalizeText(safe.customerSignedName || previous.customerSignedName),
    events: asArray(safe.events).length
      ? asArray(safe.events).map((event) => {
          const safeEvent = asObject(event);
          return {
            eventId: normalizeText(safeEvent.eventId) || crypto.randomUUID(),
            type: normalizeText(safeEvent.type) || 'agreement_updated',
            label: normalizeText(safeEvent.label) || 'Behandlingsavtal uppdaterat',
            detail: normalizeText(safeEvent.detail),
            actorUserId: normalizeText(safeEvent.actorUserId),
            createdAt: normalizeText(safeEvent.createdAt) || nowIso(),
          };
        })
      : asArray(previous.events).map((event) => ({ ...event })),
    createdAt,
    updatedAt: nowIso(),
  };
}

async function createCcoTreatmentAgreementStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoTreatmentAgreementStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    agreements: asArray(state?.agreements)
      .map((item) => normalizeAgreement(item))
      .filter(Boolean),
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getPatientAgreement({ tenantId, patientId } = {}) {
    const key = agreementKey({ tenantId, patientId });
    return cloneAgreement(state.agreements.find((item) => agreementKey(item) === key));
  }

  async function upsertAgreement(input = {}) {
    const key = agreementKey(input);
    if (!key) throw new Error('Behandlingsavtalet saknar tenant eller patientId.');
    const index = state.agreements.findIndex((item) => agreementKey(item) === key);
    const existing = index >= 0 ? state.agreements[index] : {};
    const normalized = normalizeAgreement(input, existing);
    if (!normalized) throw new Error('Behandlingsavtalet kunde inte normaliseras.');
    const consentResolution = resolveConsentTemplateForAgreement(normalized);
    normalized.bundleStatus = computeBundleStatus(normalized, { consentResolution });
    if (
      consentResolution?.found &&
      consentResolution.template &&
      !normalized.consent.templateApiId
    ) {
      normalized.consent = normalizeConsentState({
        ...normalized.consent,
        templateId: consentResolution.template.id,
        templateApiId: consentResolution.template.apiId,
        templateVersion: consentResolution.template.version,
        templateTitle: consentResolution.template.title,
      });
    }
    if (index >= 0) {
      state.agreements[index] = normalized;
    } else {
      state.agreements.push(normalized);
    }
    await save();
    return cloneAgreement(state.agreements[index >= 0 ? index : state.agreements.length - 1]);
  }

  async function findAgreementByEsignToken(token) {
    const normalized = normalizeText(token);
    if (!normalized) return null;
    return cloneAgreement(
      state.agreements.find((item) => normalizeText(item.esignToken) === normalized)
    );
  }

  return {
    getPatientAgreement,
    upsertAgreement,
    findAgreementByEsignToken,
  };
}

module.exports = {
  AGREEMENT_STATUSES,
  BUNDLE_STATUSES,
  DELIVERY_MODES,
  AGREEMENT_VERSION,
  DEFAULT_COOLING_OFF_DAYS,
  buildTreatmentAgreementReadout,
  canAcceptAgreement,
  createCcoTreatmentAgreementStore,
  defaultTemplateBindingForOffer,
  computeBundleStatus,
};
