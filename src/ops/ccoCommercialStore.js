const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const COMMERCIAL_STATUSES = Object.freeze([
  'needs_review',
  'quote_sent',
  'deposit_pending',
  'payment_pending',
  'ready',
  'complete',
  'cancelled',
]);

const QUOTE_STATUSES = Object.freeze(['missing', 'draft', 'sent', 'accepted']);
const PAYMENT_STATUSES = Object.freeze(['pending', 'partially_paid', 'paid', 'blocked']);

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
    commercialCases: [],
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

function normalizeCommercialCase(input = {}, existing = {}) {
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
    commercialCaseId:
      normalizeText(previous.commercialCaseId || safe.commercialCaseId) || crypto.randomUUID(),
    tenantId,
    workspaceId,
    conversationId,
    customerId,
    customerName: normalizeText(safe.customerName || previous.customerName),
    offerType: normalizeText(safe.offerType || previous.offerType),
    commercialStatus: normalizeEnum(
      safe.commercialStatus || previous.commercialStatus,
      COMMERCIAL_STATUSES,
      'needs_review'
    ),
    quoteStatus: normalizeEnum(safe.quoteStatus || previous.quoteStatus, QUOTE_STATUSES, 'missing'),
    paymentStatus: normalizeEnum(
      safe.paymentStatus || previous.paymentStatus,
      PAYMENT_STATUSES,
      'pending'
    ),
    quotedAmount: normalizeText(safe.quotedAmount || previous.quotedAmount),
    depositAmount: normalizeText(safe.depositAmount || previous.depositAmount),
    dueDateIso: normalizeText(safe.dueDateIso || previous.dueDateIso),
    notes: normalizeText(safe.notes || previous.notes),
    nextStep: normalizeText(safe.nextStep || previous.nextStep),
    linkedOperationCaseId: normalizeText(
      safe.linkedOperationCaseId || previous.linkedOperationCaseId
    ),
    requiredActions,
    events: asArray(safe.events).length
      ? asArray(safe.events).map((event) => {
          const safeEvent = asObject(event);
          return {
            eventId: normalizeText(safeEvent.eventId) || crypto.randomUUID(),
            type: normalizeText(safeEvent.type) || 'commercial_updated',
            label: normalizeText(safeEvent.label) || 'Kommersiellt ärende uppdaterat',
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

async function createCcoCommercialStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoCommercialStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    commercialCases: asArray(state?.commercialCases)
      .map((item) => normalizeCommercialCase(item))
      .filter(Boolean),
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) return null;
    return cloneCase(state.commercialCases.find((item) => caseKey(item) === key));
  }

  async function ensureCase(input = {}) {
    const existing = await getCase(input);
    if (existing) return existing;
    return upsertCase(input);
  }

  async function upsertCase(input = {}) {
    const key = caseKey(input);
    if (!key || key.split('::').some((part) => !part)) {
      throw new Error('Det kommersiella ärendet saknar tenant, tråd eller kund.');
    }
    const index = state.commercialCases.findIndex((item) => caseKey(item) === key);
    const existing = index >= 0 ? state.commercialCases[index] : {};
    const normalized = normalizeCommercialCase(input, existing);
    if (!normalized) {
      throw new Error('Det kommersiella ärendet saknar tenant, tråd eller kund.');
    }
    if (index >= 0) {
      state.commercialCases[index] = normalized;
    } else {
      state.commercialCases.push(normalized);
    }
    await save();
    return cloneCase(state.commercialCases[index >= 0 ? index : state.commercialCases.length - 1]);
  }

  return {
    getCase,
    ensureCase,
    upsertCase,
  };
}

module.exports = {
  COMMERCIAL_STATUSES,
  QUOTE_STATUSES,
  PAYMENT_STATUSES,
  createCcoCommercialStore,
};
