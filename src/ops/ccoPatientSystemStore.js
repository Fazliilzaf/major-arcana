const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const PATIENT_SYSTEM_MODULES = Object.freeze([
  'communication',
  'booking',
  'consultation',
  'clinical',
  'documents',
  'media',
  'operation',
  'aftercare',
  'tasks',
  'commercial',
]);

const MODULE_LABELS = Object.freeze({
  communication: 'Kommunikation',
  booking: 'Bokning',
  consultation: 'Konsultation',
  clinical: 'Kliniskt underlag',
  documents: 'Dokument & samtycke',
  media: 'Bild & media',
  operation: 'Operation',
  aftercare: 'Eftervård',
  tasks: 'Teamuppgifter',
  commercial: 'Offert & betalning',
});

const MODULE_STATUS_PRIORITY = Object.freeze({
  blocked: 90,
  needs_validation: 80,
  needs_action: 70,
  waiting_customer: 55,
  scheduled: 40,
  draft: 35,
  ready: 30,
  complete: 10,
  inactive: 0,
});

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

function normalizeStatus(value, fallback = 'inactive') {
  const normalized = normalizeKey(value);
  return Object.prototype.hasOwnProperty.call(MODULE_STATUS_PRIORITY, normalized)
    ? normalized
    : fallback;
}

function normalizeConfidence(value, fallback = 0.6) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric > 1) return Math.max(0, Math.min(1, numeric / 100));
  return Math.max(0, Math.min(1, numeric));
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    patients: [],
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

function canonicalPatientKey(input = {}) {
  const safe = asObject(input);
  const email = normalizeKey(safe.email || safe.customerEmail || safe.identity?.email);
  if (email) return `email:${email}`;
  const phone = normalizeKey(safe.phone || safe.customerPhone || safe.identity?.phone).replace(
    /\s+/g,
    ''
  );
  if (phone) return `phone:${phone}`;
  const name = normalizeKey(safe.name || safe.customerName || safe.identity?.name);
  return name ? `name:${name}` : '';
}

function normalizeIdentity(input = {}, existing = {}) {
  const safe = asObject(input);
  const identity = asObject(safe.identity);
  return {
    name: normalizeText(identity.name || safe.name || safe.customerName || existing.name),
    email: normalizeKey(identity.email || safe.email || safe.customerEmail || existing.email),
    phone: normalizeText(identity.phone || safe.phone || safe.customerPhone || existing.phone),
    language: normalizeText(identity.language || safe.language || existing.language) || 'sv',
    contactPreference: normalizeText(
      identity.contactPreference || safe.contactPreference || existing.contactPreference
    ),
    clinic: normalizeText(identity.clinic || safe.clinic || existing.clinic),
    leadSource: normalizeText(identity.leadSource || safe.leadSource || existing.leadSource),
    tags: Array.from(
      new Set([
        ...asArray(existing.tags)
          .map((tag) => normalizeText(tag))
          .filter(Boolean),
        ...asArray(identity.tags || safe.tags)
          .map((tag) => normalizeText(tag))
          .filter(Boolean),
      ])
    ),
  };
}

function normalizeModule(moduleId, input = {}, existing = {}) {
  const safe = asObject(input);
  const previous = asObject(existing);
  const status = normalizeStatus(safe.status || previous.status);
  const confidence = normalizeConfidence(safe.confidence ?? previous.confidence, 0.6);
  const validationRequired =
    safe.validationRequired === true ||
    previous.validationRequired === true ||
    status === 'needs_validation' ||
    confidence < 0.75;
  return {
    moduleId,
    label: MODULE_LABELS[moduleId],
    status,
    nextAction: normalizeText(safe.nextAction || previous.nextAction),
    waitingOn: normalizeText(safe.waitingOn || previous.waitingOn),
    confidence,
    validationRequired,
    updatedAt: normalizeText(safe.updatedAt || previous.updatedAt) || nowIso(),
    metadata: {
      ...asObject(previous.metadata),
      ...asObject(safe.metadata),
    },
  };
}

function normalizeModules(input = {}, existing = {}) {
  const safe = asObject(input);
  return PATIENT_SYSTEM_MODULES.reduce((modules, moduleId) => {
    modules[moduleId] = normalizeModule(moduleId, safe[moduleId], existing[moduleId]);
    return modules;
  }, {});
}

function normalizeTimelineEvent(event = {}) {
  const safe = asObject(event);
  const moduleId = PATIENT_SYSTEM_MODULES.includes(normalizeKey(safe.module))
    ? normalizeKey(safe.module)
    : 'communication';
  const label = normalizeText(safe.label || safe.title);
  const detail = normalizeText(safe.detail || safe.description);
  if (!label && !detail) return null;
  const confidence = normalizeConfidence(safe.confidence, 0.7);
  return {
    eventId: normalizeText(safe.eventId) || `patient-event-${crypto.randomUUID()}`,
    type: normalizeText(safe.type) || 'note',
    module: moduleId,
    moduleLabel: MODULE_LABELS[moduleId],
    label: label || detail,
    detail,
    occurredAt: normalizeText(safe.occurredAt || safe.createdAt) || nowIso(),
    source: normalizeText(safe.source) || 'cco',
    confidence,
    validationState:
      normalizeText(safe.validationState) ||
      (confidence < 0.75 ? 'needs_human_validation' : 'observed'),
    actorName: normalizeText(safe.actorName),
    metadata: { ...asObject(safe.metadata) },
  };
}

function normalizePatientRecord(input = {}, existing = {}) {
  const safe = asObject(input);
  const previous = asObject(existing);
  const tenantId = normalizeText(safe.tenantId || previous.tenantId);
  const workspaceId =
    normalizeText(safe.workspaceId || previous.workspaceId) || 'major-arcana-preview';
  const identity = normalizeIdentity(safe, previous.identity);
  const canonicalKey = canonicalPatientKey({ ...safe, identity }) || previous.canonicalKey;
  if (!tenantId || !workspaceId || !canonicalKey) return null;
  const createdAt = normalizeText(previous.createdAt || safe.createdAt) || nowIso();
  const timeline = [
    ...asArray(previous.timeline),
    ...asArray(safe.timeline)
      .map((event) => normalizeTimelineEvent(event))
      .filter(Boolean),
  ]
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .slice(-200);
  return {
    patientId: normalizeText(previous.patientId || safe.patientId) || crypto.randomUUID(),
    tenantId,
    workspaceId,
    canonicalKey,
    identity,
    careTeam: {
      ...asObject(previous.careTeam),
      ...asObject(safe.careTeam),
    },
    pipeline: {
      status: normalizeText(safe.pipeline?.status || previous.pipeline?.status) || 'active',
      nextStep: normalizeText(safe.pipeline?.nextStep || previous.pipeline?.nextStep),
      nextContactAt: normalizeText(
        safe.pipeline?.nextContactAt || previous.pipeline?.nextContactAt
      ),
      lostReason: normalizeText(safe.pipeline?.lostReason || previous.pipeline?.lostReason),
    },
    modules: normalizeModules(safe.modules, previous.modules),
    timeline,
    createdAt,
    updatedAt: nowIso(),
  };
}

function patientKey(input = {}) {
  return [
    normalizeText(input.tenantId),
    normalizeText(input.workspaceId) || 'major-arcana-preview',
    normalizeText(input.canonicalKey) || canonicalPatientKey(input),
  ].join('::');
}

function clonePatient(patient) {
  return patient
    ? {
        ...patient,
        identity: { ...patient.identity, tags: [...asArray(patient.identity?.tags)] },
        careTeam: { ...patient.careTeam },
        pipeline: { ...patient.pipeline },
        modules: Object.fromEntries(
          Object.entries(asObject(patient.modules)).map(([key, value]) => [
            key,
            { ...value, metadata: { ...asObject(value.metadata) } },
          ])
        ),
        timeline: asArray(patient.timeline).map((event) => ({
          ...event,
          metadata: { ...asObject(event.metadata) },
        })),
        patient360: buildPatient360Readout(patient),
      }
    : null;
}

function moduleWithId(modules = {}, moduleId) {
  const module = asObject(modules)[moduleId];
  return module ? { ...module, moduleId, label: module.label || MODULE_LABELS[moduleId] } : null;
}

function hasModuleStatus(module, statuses = []) {
  return Boolean(module && statuses.includes(normalizeStatus(module.status)));
}

function deriveOrchestratedAttentionModule(patient = {}) {
  const modules = asObject(patient.modules);
  const documents = moduleWithId(modules, 'documents');
  const operation = moduleWithId(modules, 'operation');
  const aftercare = moduleWithId(modules, 'aftercare');
  const commercial = moduleWithId(modules, 'commercial');
  const booking = moduleWithId(modules, 'booking');
  const consultation = moduleWithId(modules, 'consultation');
  const clinical = moduleWithId(modules, 'clinical');
  const tasks = moduleWithId(modules, 'tasks');

  if (hasModuleStatus(documents, ['blocked'])) return documents;
  if (hasModuleStatus(operation, ['blocked'])) return operation;
  if (hasModuleStatus(aftercare, ['blocked'])) return aftercare;
  if (hasModuleStatus(commercial, ['blocked'])) return commercial;

  if (
    hasModuleStatus(operation, ['scheduled', 'ready']) &&
    (hasModuleStatus(clinical, ['needs_validation']) ||
      hasModuleStatus(aftercare, ['scheduled']) ||
      hasModuleStatus(tasks, ['needs_action']))
  ) {
    return operation;
  }

  if (
    hasModuleStatus(aftercare, ['needs_validation', 'needs_action']) &&
    hasModuleStatus(operation, ['complete'])
  ) {
    return aftercare;
  }

  if (
    hasModuleStatus(clinical, ['needs_validation']) &&
    (hasModuleStatus(consultation, ['scheduled', 'ready']) ||
      hasModuleStatus(booking, ['waiting_customer', 'scheduled', 'ready']) ||
      hasModuleStatus(commercial, ['waiting_customer', 'ready']))
  ) {
    return clinical;
  }

  if (
    hasModuleStatus(consultation, ['scheduled', 'ready']) &&
    hasModuleStatus(booking, ['waiting_customer']) &&
    hasModuleStatus(commercial, ['waiting_customer', 'ready'])
  ) {
    return consultation;
  }

  if (
    hasModuleStatus(booking, ['needs_validation']) &&
    hasModuleStatus(consultation, ['ready']) &&
    hasModuleStatus(commercial, ['waiting_customer', 'ready'])
  ) {
    return booking;
  }

  if (
    hasModuleStatus(commercial, ['waiting_customer']) &&
    !hasModuleStatus(booking, ['needs_validation']) &&
    (hasModuleStatus(booking, ['scheduled', 'ready']) || hasModuleStatus(consultation, ['ready']))
  ) {
    return commercial;
  }

  if (
    normalizeKey(booking?.metadata?.bookingStatus) === 'confirmed_external' &&
    normalizeKey(booking?.metadata?.postConfirmationMode) !== 'reply' &&
    hasModuleStatus(aftercare, ['needs_action', 'scheduled', 'ready'])
  ) {
    return aftercare;
  }

  if (
    hasModuleStatus(consultation, ['scheduled', 'ready']) &&
    hasModuleStatus(tasks, ['needs_action'])
  ) {
    return consultation;
  }

  if (
    hasModuleStatus(commercial, ['waiting_customer', 'ready']) &&
    hasModuleStatus(tasks, ['needs_action'])
  ) {
    return commercial;
  }

  if (
    hasModuleStatus(aftercare, ['scheduled', 'needs_action', 'needs_validation']) &&
    hasModuleStatus(tasks, ['needs_action'])
  ) {
    return aftercare;
  }

  return null;
}

function getAttentionModule(patient = {}) {
  const modules = asObject(patient.modules);
  const orchestratedModule = deriveOrchestratedAttentionModule(patient);
  if (orchestratedModule) return orchestratedModule;
  return PATIENT_SYSTEM_MODULES.map((moduleId, index) => ({
    ...modules[moduleId],
    __priorityIndex: index,
  }))
    .filter(Boolean)
    .sort((a, b) => {
      const priorityDelta =
        (MODULE_STATUS_PRIORITY[b.status] || 0) - (MODULE_STATUS_PRIORITY[a.status] || 0);
      if (priorityDelta) return priorityDelta;
      const orderDelta = (a.__priorityIndex ?? 999) - (b.__priorityIndex ?? 999);
      if (orderDelta) return orderDelta;
      return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
    })
    .map(({ __priorityIndex, ...module }) => module)[0];
}

function buildPatient360Readout(patient = {}) {
  const attentionModule = getAttentionModule(patient) || {};
  const latestEvent = asArray(patient.timeline).at(-1);
  const confidence = normalizeConfidence(attentionModule.confidence, 0.6);
  const validationRequired =
    attentionModule.validationRequired === true ||
    latestEvent?.validationState === 'needs_human_validation' ||
    confidence < 0.75;
  return {
    what:
      normalizeText(attentionModule.nextAction) ||
      normalizeText(patient.pipeline?.nextStep) ||
      'Öppna nästa tydliga steg',
    where: normalizeText(attentionModule.label) || 'CCO',
    when:
      normalizeText(patient.pipeline?.nextContactAt) ||
      normalizeText(latestEvent?.occurredAt) ||
      normalizeText(patient.updatedAt),
    validation: validationRequired ? 'Kräver mänsklig validering' : 'Tillräckligt underlag',
    confidence,
    moduleId: normalizeText(attentionModule.moduleId),
    status: normalizeText(attentionModule.status),
  };
}

async function createCcoPatientSystemStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoPatientSystemStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    patients: asArray(state?.patients)
      .map((item) => normalizePatientRecord(item))
      .filter(Boolean),
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function upsertPatient(input = {}) {
    const lookupKey = patientKey(input);
    if (!lookupKey || lookupKey.split('::').some((part) => !part)) {
      throw new Error('Patient 360-posten saknar tenant eller identifierbar kund.');
    }
    const existingIndex = state.patients.findIndex((item) => patientKey(item) === lookupKey);
    const existing = existingIndex >= 0 ? state.patients[existingIndex] : {};
    const normalized = normalizePatientRecord(input, existing);
    if (!normalized) {
      throw new Error('Patient 360-posten saknar tenant eller identifierbar kund.');
    }
    if (existingIndex >= 0) {
      state.patients[existingIndex] = normalized;
    } else {
      state.patients.push(normalized);
    }
    await save();
    return clonePatient(
      state.patients[existingIndex >= 0 ? existingIndex : state.patients.length - 1]
    );
  }

  async function ensurePatient(input = {}) {
    const existing = await getPatient(input);
    if (existing) return existing;
    return upsertPatient(input);
  }

  async function getPatient(input = {}) {
    const key = patientKey(input);
    if (!key || key.split('::').some((part) => !part)) return null;
    return clonePatient(state.patients.find((item) => patientKey(item) === key));
  }

  async function addTimelineEvent(input = {}) {
    const existing = await ensurePatient(input);
    return upsertPatient({
      ...existing,
      timeline: [
        normalizeTimelineEvent({
          type: input.type,
          module: input.module,
          label: input.label,
          detail: input.detail,
          occurredAt: input.occurredAt,
          source: input.source,
          confidence: input.confidence,
          validationState: input.validationState,
          actorName: input.actorName,
          metadata: input.metadata,
        }),
      ].filter(Boolean),
    });
  }

  async function listPatients({ tenantId, status, limit = 50 } = {}) {
    const tenant = normalizeText(tenantId);
    const normalizedStatus = normalizeKey(status);
    const max = Math.max(1, Math.min(200, Number(limit) || 50));
    return state.patients
      .filter((item) => !tenant || item.tenantId === tenant)
      .filter((item) => !normalizedStatus || item.pipeline?.status === normalizedStatus)
      .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
      .slice(0, max)
      .map((item) => clonePatient(item));
  }

  return {
    addTimelineEvent,
    ensurePatient,
    getPatient,
    listPatients,
    upsertPatient,
    _state: state,
  };
}

module.exports = {
  MODULE_LABELS,
  PATIENT_SYSTEM_MODULES,
  buildPatient360Readout,
  createCcoPatientSystemStore,
  deriveOrchestratedAttentionModule,
  normalizePatientRecord,
  normalizeTimelineEvent,
};
