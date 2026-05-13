const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const AFTERCARE_STATUSES = Object.freeze([
  'needs_review',
  'scheduled',
  'in_progress',
  'complete',
  'cancelled',
]);

const CONTACT_STATUSES = Object.freeze(['pending', 'confirmed', 'not_needed']);
const OUTCOME_STATUSES = Object.freeze(['unknown', 'stable', 'needs_attention']);

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

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    aftercareCases: [],
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

function normalizeEnum(value, allowed, fallback) {
  const normalized = normalizeKey(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

function caseKey(input = {}) {
  const tenantId = normalizeText(input.tenantId);
  const workspaceId = normalizeText(input.workspaceId) || 'major-arcana-preview';
  const conversationId = normalizeText(input.conversationId);
  const customerId = normalizeKey(input.customerId);
  return [tenantId, workspaceId, conversationId, customerId].join('::');
}

function cloneCase(record) {
  if (!record) return null;
  return {
    ...record,
    requiredActions: [...asArray(record.requiredActions)],
    events: asArray(record.events).map((event) => ({ ...event })),
  };
}

function normalizeAftercareCase(input = {}, existing = {}) {
  const safe = asObject(input);
  const previous = asObject(existing);
  const tenantId = normalizeText(safe.tenantId || previous.tenantId);
  const workspaceId =
    normalizeText(safe.workspaceId || previous.workspaceId) || 'major-arcana-preview';
  const conversationId = normalizeText(safe.conversationId || previous.conversationId);
  const customerId = normalizeKey(safe.customerId || previous.customerId);
  if (!tenantId || !workspaceId || !conversationId || !customerId) return null;

  const createdAt = normalizeText(previous.createdAt || safe.createdAt) || nowIso();
  const requiredActions = Array.from(
    new Set(
      [...asArray(previous.requiredActions), ...asArray(safe.requiredActions)]
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  );

  return {
    aftercareCaseId:
      normalizeText(previous.aftercareCaseId || safe.aftercareCaseId) || crypto.randomUUID(),
    tenantId,
    workspaceId,
    conversationId,
    customerId,
    customerName: normalizeText(safe.customerName || previous.customerName),
    category: normalizeText(safe.category || previous.category) || 'Uppföljning',
    aftercareStatus: normalizeEnum(
      safe.aftercareStatus || previous.aftercareStatus,
      AFTERCARE_STATUSES,
      'needs_review'
    ),
    contactStatus: normalizeEnum(
      safe.contactStatus || previous.contactStatus,
      CONTACT_STATUSES,
      'pending'
    ),
    outcomeStatus: normalizeEnum(
      safe.outcomeStatus || previous.outcomeStatus,
      OUTCOME_STATUSES,
      'unknown'
    ),
    scheduledForIso: normalizeText(safe.scheduledForIso || previous.scheduledForIso),
    doctorName: normalizeText(safe.doctorName || previous.doctorName) || 'Dr. Eriksson',
    reminderLeadMinutes:
      Number.parseInt(
        String(safe.reminderLeadMinutes ?? previous.reminderLeadMinutes ?? 120),
        10
      ) || 120,
    notes: normalizeText(safe.notes || previous.notes),
    nextStep: normalizeText(safe.nextStep || previous.nextStep),
    linkedFollowUpId: normalizeText(safe.linkedFollowUpId || previous.linkedFollowUpId),
    requiredActions,
    events: asArray(safe.events).length
      ? asArray(safe.events).map((event) => {
          const safeEvent = asObject(event);
          return {
            eventId: normalizeText(safeEvent.eventId) || crypto.randomUUID(),
            type: normalizeText(safeEvent.type) || 'aftercare_updated',
            label: normalizeText(safeEvent.label) || 'Eftervårdsärende uppdaterat',
            detail: normalizeText(safeEvent.detail),
            actorUserId: normalizeText(safeEvent.actorUserId),
            actorName: normalizeText(safeEvent.actorName),
            createdAt: normalizeText(safeEvent.createdAt) || nowIso(),
          };
        })
      : asArray(previous.events).map((event) => ({ ...event })),
    createdAt,
    updatedAt: nowIso(),
  };
}

async function createCcoAftercareStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoAftercareStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    aftercareCases: asArray(state?.aftercareCases)
      .map((item) => normalizeAftercareCase(item))
      .filter(Boolean),
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) return null;
    return cloneCase(state.aftercareCases.find((item) => caseKey(item) === key));
  }

  async function ensureCase(input = {}) {
    const existing = await getCase(input);
    if (existing) return existing;
    return upsertCase(input);
  }

  async function upsertCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) {
      throw new Error('Eftervårdsärendet saknar tenant, tråd eller kund.');
    }
    const index = state.aftercareCases.findIndex((item) => caseKey(item) === key);
    const existing = index >= 0 ? state.aftercareCases[index] : {};
    const normalized = normalizeAftercareCase(input, existing);
    if (!normalized) {
      throw new Error('Eftervårdsärendet saknar tenant, tråd eller kund.');
    }
    if (index >= 0) {
      state.aftercareCases[index] = normalized;
    } else {
      state.aftercareCases.push(normalized);
    }
    await save();
    return cloneCase(state.aftercareCases[index >= 0 ? index : state.aftercareCases.length - 1]);
  }

  async function recordFollowUpSchedule(input = {}) {
    const existing = await ensureCase({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      customerName: input.customerName,
      category: input.category,
      aftercareStatus: 'needs_review',
    });
    return upsertCase({
      ...existing,
      ...input,
      aftercareStatus: 'scheduled',
      contactStatus: 'pending',
      linkedFollowUpId: normalizeText(input.linkedFollowUpId || existing.linkedFollowUpId),
      nextStep:
        normalizeText(input.nextStep) || 'Genomför planerad uppföljning och dokumentera utfallet',
      requiredActions: ['Genomför planerad uppföljning och dokumentera utfallet'],
      events: [
        ...asArray(existing.events),
        {
          type: 'aftercare_followup_scheduled',
          label: 'Eftervårdsuppföljning schemalagd',
          detail: normalizeText(input.notes) || 'Ny eftervårdsuppföljning skapades.',
          actorUserId: normalizeText(input.actorUserId),
          actorName: normalizeText(input.actorName),
        },
      ],
    });
  }

  return {
    getCase,
    ensureCase,
    upsertCase,
    recordFollowUpSchedule,
  };
}

module.exports = {
  AFTERCARE_STATUSES,
  CONTACT_STATUSES,
  OUTCOME_STATUSES,
  createCcoAftercareStore,
};
