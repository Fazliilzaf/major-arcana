const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { ensureDirectoryWithRetry } = require('./persistentDir');

const ALLOWED_EVENT_TYPES = new Set([
  'form_submit',
  'analyzer',
  'chat_intent',
  'exit_intent',
  'pdf_guide',
  'web_lead',
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = {};
  for (const [rawKey, rawVal] of Object.entries(value)) {
    const key = normalizeText(rawKey).slice(0, 60);
    if (!key) continue;
    if (rawVal === null) {
      metadata[key] = null;
      continue;
    }
    const valType = typeof rawVal;
    if (valType === 'string') {
      metadata[key] = rawVal.slice(0, 500);
      continue;
    }
    if (valType === 'number' || valType === 'boolean') {
      metadata[key] = rawVal;
    }
  }
  return metadata;
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
  const dir = path.dirname(filePath);
  await ensureDirectoryWithRetry(dir);
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    events: [],
    auditTrail: [],
  };
}

function normalizeEvent(input) {
  const source = input && typeof input === 'object' ? input : {};
  const eventType = normalizeKey(source.eventType);
  if (!ALLOWED_EVENT_TYPES.has(eventType)) return null;

  return {
    id: normalizeText(source.id) || crypto.randomUUID(),
    ts: normalizeText(source.ts) || nowIso(),
    eventType,
    tenantId: normalizeText(source.tenantId) || null,
    brand: normalizeText(source.brand) || null,
    channel: normalizeText(source.channel) || 'web',
    intent: normalizeText(source.intent) || 'web_lead',
    sourceHost: normalizeText(source.sourceHost) || null,
    correlationId: normalizeText(source.correlationId) || null,
    idempotencyKey: normalizeText(source.idempotencyKey) || null,
    gatewayRunId: normalizeText(source.gatewayRunId) || null,
    decision: normalizeKey(source.decision) || 'allow',
    contactEmail: normalizeText(source.contactEmail).toLowerCase() || null,
    metadata: sanitizeMetadata(source.metadata),
  };
}

function normalizeAuditEntry(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    id: normalizeText(source.id) || crypto.randomUUID(),
    ts: normalizeText(source.ts) || nowIso(),
    action: normalizeText(source.action) || 'gateway.audit',
    outcome: normalizeText(source.outcome) || 'success',
    tenantId: normalizeText(source.tenantId) || null,
    correlationId: normalizeText(source.correlationId) || null,
    gatewayRunId: normalizeText(source.gatewayRunId) || null,
    metadata: sanitizeMetadata(source.metadata),
  };
}

function pruneEvents(events, { maxEvents, retentionDays, nowMs = Date.now() }) {
  const cutoff = nowMs - retentionDays * 24 * 60 * 60 * 1000;
  const kept = (Array.isArray(events) ? events : [])
    .map((item) => normalizeEvent(item))
    .filter((item) => {
      if (!item) return false;
      const ts = Date.parse(item.ts);
      return Number.isFinite(ts) && ts >= cutoff;
    });
  return kept.slice(Math.max(0, kept.length - maxEvents));
}

function pruneAuditTrail(entries, { maxEntries, retentionDays, nowMs = Date.now() }) {
  const cutoff = nowMs - retentionDays * 24 * 60 * 60 * 1000;
  const kept = (Array.isArray(entries) ? entries : [])
    .map((item) => normalizeAuditEntry(item))
    .filter((item) => {
      const ts = Date.parse(item.ts);
      return Number.isFinite(ts) && ts >= cutoff;
    });
  return kept.slice(Math.max(0, kept.length - maxEntries));
}

async function createWebBridgeAuditStore({
  filePath,
  maxEvents = 5000,
  maxAuditEntries = 10000,
  retentionDays = 180,
} = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('webBridgeAuditStore filePath saknas.');
  }

  const safeMaxEvents = Math.max(100, Math.min(50000, Number(maxEvents) || 5000));
  const safeMaxAuditEntries = Math.max(100, Math.min(100000, Number(maxAuditEntries) || 10000));
  const safeRetentionDays = Math.max(7, Math.min(3650, Number(retentionDays) || 180));

  const loaded = await readJson(filePath, emptyState());
  const state = loaded && typeof loaded === 'object' ? loaded : emptyState();
  if (!Array.isArray(state.events)) state.events = [];
  if (!Array.isArray(state.auditTrail)) state.auditTrail = [];
  if (!state.createdAt) state.createdAt = nowIso();

  state.events = pruneEvents(state.events, {
    maxEvents: safeMaxEvents,
    retentionDays: safeRetentionDays,
  });
  state.auditTrail = pruneAuditTrail(state.auditTrail, {
    maxEntries: safeMaxAuditEntries,
    retentionDays: safeRetentionDays,
  });
  state.updatedAt = nowIso();
  await writeJsonAtomic(filePath, state);

  async function save() {
    state.events = pruneEvents(state.events, {
      maxEvents: safeMaxEvents,
      retentionDays: safeRetentionDays,
    });
    state.auditTrail = pruneAuditTrail(state.auditTrail, {
      maxEntries: safeMaxAuditEntries,
      retentionDays: safeRetentionDays,
    });
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function recordEvent(event) {
    const normalized = normalizeEvent(event);
    if (!normalized) {
      throw new Error('Ogiltig web bridge-event payload.');
    }
    state.events.push(normalized);
    await save();
    return normalized;
  }

  async function recordAudit(entry) {
    const normalized = normalizeAuditEntry(entry);
    state.auditTrail.push(normalized);
    await save();
    return normalized;
  }

  async function listRecentEvents({ tenantId = '', limit = 20 } = {}) {
    const normalizedTenant = normalizeText(tenantId);
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
    const filtered = state.events.filter((item) => {
      if (!normalizedTenant) return true;
      return normalizeText(item.tenantId) === normalizedTenant;
    });
    return filtered.slice(Math.max(0, filtered.length - safeLimit));
  }

  return {
    recordEvent,
    recordAudit,
    listRecentEvents,
    _state: state,
  };
}

module.exports = {
  createWebBridgeAuditStore,
  ALLOWED_EVENT_TYPES,
};
