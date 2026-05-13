const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

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

const CONSULTATION_STATUSES = Object.freeze(['needs_review', 'ready', 'scheduled', 'complete']);

const CLINICAL_STATUSES = Object.freeze(['inactive', 'needs_validation', 'validated']);

const DOCUMENT_STATUSES = Object.freeze(['inactive', 'missing', 'needs_validation', 'validated']);

const CONSENT_STATUSES = Object.freeze(['required', 'confirmed', 'not_applicable']);

function normalizeConsultationStatus(value) {
  const normalized = normalizeKey(value);
  return CONSULTATION_STATUSES.includes(normalized) ? normalized : 'needs_review';
}

function normalizeClinicalStatus(value) {
  const normalized = normalizeKey(value);
  return CLINICAL_STATUSES.includes(normalized) ? normalized : 'inactive';
}

function normalizeDocumentStatus(value) {
  const normalized = normalizeKey(value);
  return DOCUMENT_STATUSES.includes(normalized) ? normalized : 'inactive';
}

function normalizeConsentStatus(value) {
  const normalized = normalizeKey(value);
  return CONSENT_STATUSES.includes(normalized) ? normalized : 'required';
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    cases: [],
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

function caseKey(input = {}) {
  return [
    normalizeText(input.tenantId),
    normalizeText(input.workspaceId),
    normalizeText(input.conversationId),
    normalizeKey(input.customerId || input.customerEmail),
  ].join('::');
}

function normalizeEvent(input = {}) {
  const type = normalizeText(input.type);
  const label = normalizeText(input.label);
  const detail = normalizeText(input.detail);
  if (!type && !label && !detail) return null;
  return {
    eventId: normalizeText(input.eventId) || crypto.randomUUID(),
    type: type || 'consultation_updated',
    label: label || 'Konsultationsärende uppdaterat',
    detail,
    createdAt: normalizeText(input.createdAt) || nowIso(),
    actorUserId: normalizeText(input.actorUserId),
    actorName: normalizeText(input.actorName),
    metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {},
  };
}

function normalizeConsultationCase(input = {}, existing = {}) {
  const tenantId = normalizeText(input.tenantId || existing.tenantId);
  const workspaceId = normalizeText(input.workspaceId || existing.workspaceId);
  const conversationId = normalizeText(input.conversationId || existing.conversationId);
  const customerId = normalizeKey(input.customerId || input.customerEmail || existing.customerId);
  if (!tenantId || !workspaceId || !conversationId || !customerId) return null;
  const previous = existing && typeof existing === 'object' ? existing : {};
  const createdAt = normalizeText(previous.createdAt || input.createdAt) || nowIso();
  const rawEvents = asArray(input.events).length ? asArray(input.events) : asArray(previous.events);
  return {
    consultationCaseId:
      normalizeText(previous.consultationCaseId || input.consultationCaseId) || crypto.randomUUID(),
    tenantId,
    workspaceId,
    conversationId,
    customerId,
    customerName: normalizeText(input.customerName || previous.customerName),
    consultationType: normalizeText(input.consultationType || previous.consultationType),
    requestedTreatment: normalizeText(input.requestedTreatment || previous.requestedTreatment),
    consultationStatus: normalizeConsultationStatus(
      input.consultationStatus || previous.consultationStatus
    ),
    clinicalStatus: normalizeClinicalStatus(input.clinicalStatus || previous.clinicalStatus),
    documentStatus: normalizeDocumentStatus(input.documentStatus || previous.documentStatus),
    consentStatus: normalizeConsentStatus(input.consentStatus || previous.consentStatus),
    treatmentPlanStatus: normalizeText(input.treatmentPlanStatus || previous.treatmentPlanStatus),
    notes: normalizeText(input.notes || previous.notes),
    requiredActions: asArray(input.requiredActions || previous.requiredActions)
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 12),
    events: rawEvents
      .map((item) => normalizeEvent(item))
      .filter(Boolean)
      .slice(-50),
    createdAt,
    updatedAt: nowIso(),
  };
}

function cloneCase(item) {
  return item
    ? {
        ...item,
        requiredActions: [...asArray(item.requiredActions)],
        events: asArray(item.events).map((event) => ({
          ...event,
          metadata:
            event.metadata && typeof event.metadata === 'object' ? { ...event.metadata } : {},
        })),
      }
    : null;
}

async function createCcoConsultationStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoConsultationStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    cases: asArray(state.cases)
      .map((item) => normalizeConsultationCase(item))
      .filter(Boolean),
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) return null;
    return cloneCase(state.cases.find((item) => caseKey(item) === key));
  }

  async function ensureCase(input = {}) {
    const existing = await getCase(input);
    if (existing) return existing;
    return upsertCase(input);
  }

  async function upsertCase(input = {}) {
    const existingKey = caseKey(input);
    if (!existingKey || existingKey.split('::').some((part) => !part)) {
      throw new Error('Konsultationsärendet saknar obligatoriska fält.');
    }
    const existingIndex = state.cases.findIndex((item) => caseKey(item) === existingKey);
    const existing = existingIndex >= 0 ? state.cases[existingIndex] : {};
    const normalized = normalizeConsultationCase(input, existing);
    if (!normalized) {
      throw new Error('Konsultationsärendet saknar obligatoriska fält.');
    }
    if (existingIndex >= 0) {
      state.cases[existingIndex] = normalized;
    } else {
      state.cases.push({
        ...normalized,
        events: normalized.events.length
          ? normalized.events
          : [
              normalizeEvent({
                type: 'consultation_case_created',
                label: 'Konsultationsärende öppnat',
                detail: 'CCO skapade ett konsultationsärende för tråden.',
              }),
            ].filter(Boolean),
      });
    }
    await save();
    return cloneCase(state.cases[existingIndex >= 0 ? existingIndex : state.cases.length - 1]);
  }

  async function recordDocumentCheck(input = {}) {
    const existing = await ensureCase(input);
    const nextDocumentStatus = normalizeDocumentStatus(input.documentStatus);
    const nextConsentStatus = normalizeConsentStatus(input.consentStatus);
    return upsertCase({
      ...existing,
      ...input,
      documentStatus: nextDocumentStatus,
      consentStatus: nextConsentStatus,
      events: [
        ...asArray(existing.events),
        normalizeEvent({
          type: 'document_check_recorded',
          label: 'Dokumentkontroll registrerad',
          detail:
            normalizeText(input.detail) ||
            normalizeText(input.notes) ||
            'Samtycke eller dokumentunderlag uppdaterades.',
          actorUserId: normalizeText(input.actorUserId),
          actorName: normalizeText(input.actorName),
          metadata: {
            documentStatus: nextDocumentStatus,
            consentStatus: nextConsentStatus,
          },
        }),
      ],
    });
  }

  return {
    getCase,
    ensureCase,
    upsertCase,
    recordDocumentCheck,
  };
}

module.exports = {
  CONSULTATION_STATUSES,
  CLINICAL_STATUSES,
  DOCUMENT_STATUSES,
  CONSENT_STATUSES,
  createCcoConsultationStore,
};
