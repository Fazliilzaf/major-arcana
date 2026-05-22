const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
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
  const dirPath = path.dirname(filePath);
  await fs.mkdir(dirPath, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function createEmptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    entries: [],
  };
}

function normalizeEntry(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    id: normalizeText(source.id) || crypto.randomUUID(),
    ts: nowIso(),
    tenantId: normalizeText(source.tenantId) || null,
    capability: {
      name: normalizeText(source.capability?.name || source.capabilityName),
      version: normalizeText(source.capability?.version || source.capabilityVersion),
      persistStrategy: normalizeText(source.capability?.persistStrategy || source.persistStrategy),
    },
    decision: normalizeText(source.decision).toLowerCase() || 'unknown',
    runId: normalizeText(source.runId) || null,
    capabilityRunId: normalizeText(source.capabilityRunId) || null,
    correlationId: normalizeText(source.correlationId) || null,
    actor: {
      id: normalizeText(source.actor?.id) || null,
      role: normalizeText(source.actor?.role) || null,
    },
    input: safeObject(source.input),
    output: safeObject(source.output),
    riskSummary: safeObject(source.riskSummary),
    policySummary: safeObject(source.policySummary),
    metadata: safeObject(source.metadata),
  };
}

async function createCapabilityAnalysisStore({
  filePath = '',
  maxEntries = 10000,
} = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('analysisStore filePath saknas.');
  const limit = Math.max(100, Math.min(50000, Number(maxEntries) || 10000));
  const state = await readJson(resolvedPath, createEmptyState());
  if (!Array.isArray(state.entries)) state.entries = [];
  if (!state.createdAt) state.createdAt = nowIso();
  if (!state.version) state.version = 1;

  async function save() {
    state.updatedAt = nowIso();
    if (state.entries.length > limit) {
      state.entries = state.entries.slice(state.entries.length - limit);
    }
    await writeJsonAtomic(resolvedPath, state);
  }

  async function append(entryInput = {}) {
    const entry = normalizeEntry(entryInput);
    state.entries.push(entry);
    await save();
    return entry;
  }

  async function list({
    tenantId = '',
    capabilityName = '',
    limit: queryLimit = 100,
  } = {}) {
    const normalizedTenantId = normalizeText(tenantId);
    const normalizedCapabilityName = normalizeText(capabilityName).toLowerCase();
    const max = Math.max(1, Math.min(1000, Number(queryLimit) || 100));
    let items = Array.isArray(state.entries) ? [...state.entries] : [];

    if (normalizedTenantId) {
      items = items.filter((entry) => normalizeText(entry?.tenantId) === normalizedTenantId);
    }
    if (normalizedCapabilityName) {
      items = items.filter(
        (entry) =>
          normalizeText(entry?.capability?.name).toLowerCase() === normalizedCapabilityName
      );
    }

    items.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
    return items.slice(0, max).map((entry) => safeObject(entry));
  }

  async function getSummary({ tenantId = '' } = {}) {
    const normalizedTenantId = normalizeText(tenantId);
    let items = Array.isArray(state.entries) ? [...state.entries] : [];
    if (normalizedTenantId) {
      items = items.filter((entry) => normalizeText(entry?.tenantId) === normalizedTenantId);
    }
    const byCapability = {};
    for (const entry of items) {
      const key = normalizeText(entry?.capability?.name) || 'unknown';
      byCapability[key] = (byCapability[key] || 0) + 1;
    }
    return {
      tenantId: normalizedTenantId || null,
      total: items.length,
      byCapability,
      latestAt: items.length ? items.sort((a, b) => String(b.ts).localeCompare(String(a.ts)))[0].ts : null,
      generatedAt: nowIso(),
    };
  }

  await save();

  return {
    filePath: resolvedPath,
    append,
    list,
    getSummary,
  };
}

module.exports = {
  createCapabilityAnalysisStore,
};
