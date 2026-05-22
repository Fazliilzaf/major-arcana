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

function uniqueActions(value) {
  return [
    ...new Set(
      asArray(value)
        .map((item) => normalizeText(item))
        .filter(Boolean)
    ),
  ];
}

function buildConsultationOperatorActions({ phase = '', waitingOn = '', consentStatus = '' } = {}) {
  if (phase === 'closed' || phase === 'cancelled') return [];
  if (phase === 'documents_blocked') {
    return [
      {
        action: 'resolve_consultation_documents',
        key: 'resolve_consultation_documents',
        label:
          normalizeKey(consentStatus) === 'required' ? 'Säkra samtycke' : 'Lås upp dokumentflöde',
        type: 'surface_action',
        surfaceAction: 'consultation_open',
        noteDestination: normalizeKey(consentStatus) === 'required' ? 'medicinsk' : 'behandling',
        noteTemplate: normalizeKey(consentStatus) === 'required' ? 'samtycke' : 'behandling',
        emphasis: 'primary',
      },
      {
        action: 'document_consultation_status',
        key: 'document_consultation_status',
        label: normalizeKey(consentStatus) === 'required' ? 'Samtyckesnot' : 'Dokumentnot',
        type: 'surface_action',
        surfaceAction: 'note_open',
        noteDestination: 'medicinsk',
        noteTemplate: normalizeKey(consentStatus) === 'required' ? 'samtycke' : 'behandling',
        emphasis: 'secondary',
      },
    ];
  }
  if (phase === 'clinical_validation') {
    return [
      {
        action: 'resolve_consultation_clinical',
        key: 'resolve_consultation_clinical',
        label: 'Verifiera kliniskt',
        type: 'surface_action',
        surfaceAction: 'consultation_open',
        noteDestination: 'medicinsk',
        noteTemplate: 'allergi',
        emphasis: waitingOn === 'clinic' ? 'primary' : 'secondary',
      },
      {
        action: 'capture_consultation_clinical_note',
        key: 'capture_consultation_clinical_note',
        label: 'Klinisk not',
        type: 'surface_action',
        surfaceAction: 'note_open',
        noteDestination: 'medicinsk',
        noteTemplate: 'allergi',
        emphasis: 'secondary',
      },
    ];
  }
  if (phase === 'scheduled' || phase === 'ready_for_consultation') {
    return [
      {
        action: 'handoff_consultation_ready',
        key: 'handoff_consultation_ready',
        label: phase === 'scheduled' ? 'Bekräfta konsultation' : 'Planera konsultation',
        type: 'surface_action',
        surfaceAction: 'schedule_open',
        emphasis: 'primary',
      },
      {
        action: 'review_consultation_booking_handoff',
        key: 'review_consultation_booking_handoff',
        label: 'Bokningshandoff',
        type: 'surface_action',
        surfaceAction: 'booking_surface',
        emphasis: 'secondary',
      },
    ];
  }
  return [
    {
      action: 'review_consultation_case',
      key: 'review_consultation_case',
      label: 'Granska konsultation',
      type: 'surface_action',
      surfaceAction: 'consultation_open',
      emphasis: 'primary',
    },
    {
      action: 'document_consultation_status',
      key: 'document_consultation_status',
      label: 'Konsultationsnot',
      type: 'surface_action',
      surfaceAction: 'note_open',
      noteDestination: 'medicinsk',
      noteTemplate: 'samtycke',
      emphasis: 'secondary',
    },
  ];
}

function buildConsultationCaseReadout(consultationCase = {}) {
  const safeCase = consultationCase && typeof consultationCase === 'object' ? consultationCase : {};
  const consultationStatus = normalizeConsultationStatus(safeCase.consultationStatus);
  const clinicalStatus = normalizeClinicalStatus(safeCase.clinicalStatus);
  const documentStatus = normalizeDocumentStatus(safeCase.documentStatus);
  const consentStatus = normalizeConsentStatus(safeCase.consentStatus);
  const requiredActions = uniqueActions(safeCase.requiredActions);

  let phase = 'review';
  let blocker = {
    key: 'consultation_review',
    action: 'review_consultation_case',
    label: 'Konsultationsärendet behöver bedömas',
    score: 70,
  };
  let nextStep = 'Verifiera konsultationsbehov och välj nästa tydliga arbetssteg';
  let waitingOn = 'operator';
  let queueBucket = 'active';
  let handoffCopy = '';

  if (consultationStatus === 'complete') {
    phase = 'closed';
    blocker = {
      key: 'consultation_complete',
      action: 'consultation_complete',
      label: 'Konsultationen är klar',
      score: 12,
    };
    nextStep = 'Konsultationen är klar och nästa handoff kan tas i bokning eller behandling';
    waitingOn = 'booking';
    queueBucket = 'closed';
    handoffCopy =
      'Konsultationen är klar. Bokning eller nästa behandlingssteg kan nu ta över utan nytt konsultationsarbete.';
  } else if (
    documentStatus === 'missing' ||
    documentStatus === 'needs_validation' ||
    consentStatus === 'required'
  ) {
    phase = 'documents_blocked';
    blocker = {
      key: 'consultation_documents',
      action: 'resolve_consultation_documents',
      label:
        consentStatus === 'required'
          ? 'Samtycke och dokumentunderlag blockerar konsultationen'
          : 'Dokumentunderlaget blockerar konsultationen',
      score: 94,
    };
    nextStep =
      consentStatus === 'required'
        ? 'Säkra samtycke och dokumentunderlag innan konsultationen kan drivas vidare'
        : 'Validera dokumentunderlaget innan konsultationen kan drivas vidare';
    waitingOn = consentStatus === 'required' ? 'patient' : 'operator';
    queueBucket = 'critical';
  } else if (clinicalStatus === 'needs_validation') {
    phase = 'clinical_validation';
    blocker = {
      key: 'consultation_clinical',
      action: 'resolve_consultation_clinical',
      label: 'Kliniskt underlag behöver verifieras före konsultation',
      score: 88,
    };
    nextStep = 'Verifiera kliniskt underlag innan konsultationen lämnas vidare';
    waitingOn = 'clinic';
    queueBucket = 'critical';
  } else if (consultationStatus === 'scheduled') {
    phase = 'scheduled';
    blocker = {
      key: 'consultation_scheduled',
      action: 'handoff_consultation_ready',
      label: 'Konsultationen är planerad och behöver operativ handoff',
      score: 76,
    };
    nextStep = requiredActions[0] || 'Förbered planerad konsultation och håll ihop nästa handoff';
    waitingOn = 'operator';
    queueBucket = 'active';
  } else if (consultationStatus === 'ready') {
    phase = 'ready_for_consultation';
    blocker = {
      key: 'consultation_ready',
      action: 'handoff_consultation_ready',
      label: 'Konsultationen är redo att planeras eller lämnas vidare',
      score: 68,
    };
    nextStep = requiredActions[0] || 'Planera eller bekräfta konsultationens nästa steg';
    waitingOn = 'operator';
    queueBucket = 'planned';
  }

  return {
    enabled: true,
    status: consultationStatus,
    phase,
    blocker,
    consultationType: normalizeText(safeCase.consultationType),
    requestedTreatment: normalizeText(safeCase.requestedTreatment),
    clinicalStatus,
    documentStatus,
    consentStatus,
    treatmentPlanStatus: normalizeText(safeCase.treatmentPlanStatus),
    nextStep,
    requiredActions,
    queueBucket,
    operatorActions: buildConsultationOperatorActions({
      phase,
      waitingOn,
      consentStatus,
    }),
    notes: normalizeText(safeCase.notes),
    waitingOn,
    attention: {
      what: nextStep,
      where:
        phase === 'documents_blocked'
          ? 'Dokument & samtycke'
          : phase === 'clinical_validation'
            ? 'Kliniskt underlag'
            : 'Konsultation',
      when: normalizeText(safeCase.updatedAt),
      confidence:
        phase === 'documents_blocked' || phase === 'clinical_validation'
          ? 'Hög - blockerande konsultationssignal'
          : 'Medel - aktiv konsultationssignal',
    },
    handoffCopy,
  };
}

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
  buildConsultationCaseReadout,
  createCcoConsultationStore,
};
