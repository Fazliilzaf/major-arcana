const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_INTEGRATIONS = Object.freeze({
  calendly: true,
  stripe: true,
  twilio: false,
  slack: true,
  looker: false,
  zapier: false,
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

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    tenants: {},
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
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function normalizeIntegrationRecord(input = {}) {
  const integrationId = normalizeKey(input.integrationId);
  if (!integrationId) return null;
  return {
    integrationId,
    isConnected: input.isConnected !== false,
    actorUserId: normalizeText(input.actorUserId) || null,
    source: normalizeText(input.source) || 'tenant',
    configuredAt: normalizeText(input.configuredAt) || nowIso(),
    updatedAt: normalizeText(input.updatedAt) || nowIso(),
  };
}

function normalizeSalesLeadRecord(input = {}) {
  const tenantId = normalizeText(input.tenantId);
  const name = normalizeText(input.name);
  const email = normalizeText(input.email).toLowerCase();
  if (!tenantId || !name || !email) return null;
  return {
    leadId: normalizeText(input.leadId) || crypto.randomUUID(),
    tenantId,
    actorUserId: normalizeText(input.actorUserId) || null,
    name,
    email,
    message: normalizeText(input.message),
    createdAt: normalizeText(input.createdAt) || nowIso(),
  };
}

function getDefaultIntegrationRecords() {
  const createdAt = nowIso();
  return Object.entries(DEFAULT_INTEGRATIONS).map(([integrationId, isConnected]) => ({
    integrationId,
    isConnected,
    actorUserId: null,
    source: 'default',
    configuredAt: createdAt,
    updatedAt: createdAt,
  }));
}

async function createCcoIntegrationStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoIntegrationStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    tenants:
      state && typeof state.tenants === 'object' && state.tenants
        ? state.tenants
        : {},
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function ensureTenantState(tenantId) {
    const normalizedTenantId = normalizeText(tenantId);
    if (!normalizedTenantId) {
      throw new Error('tenantId krävs.');
    }

    if (!state.tenants[normalizedTenantId]) {
      state.tenants[normalizedTenantId] = {
        integrations: getDefaultIntegrationRecords(),
        salesLeads: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    }

    const tenantState = state.tenants[normalizedTenantId];
    const normalizedIntegrations = Array.isArray(tenantState.integrations)
      ? tenantState.integrations.map((item) => normalizeIntegrationRecord(item)).filter(Boolean)
      : [];
    const knownIds = new Set(normalizedIntegrations.map((item) => item.integrationId));
    for (const defaultRecord of getDefaultIntegrationRecords()) {
      if (!knownIds.has(defaultRecord.integrationId)) {
        normalizedIntegrations.push(defaultRecord);
      }
    }
    tenantState.integrations = normalizedIntegrations;
    tenantState.salesLeads = Array.isArray(tenantState.salesLeads)
      ? tenantState.salesLeads.map((item) => normalizeSalesLeadRecord(item)).filter(Boolean)
      : [];
    tenantState.updatedAt = nowIso();
    return tenantState;
  }

  async function getTenantIntegrations({ tenantId }) {
    const tenantState = ensureTenantState(tenantId);
    return tenantState.integrations
      .map((item) => ({ ...item }))
      .sort((a, b) => String(a.integrationId).localeCompare(String(b.integrationId)));
  }

  async function setIntegrationConnection({ tenantId, integrationId, isConnected, actorUserId }) {
    const tenantState = ensureTenantState(tenantId);
    const normalizedIntegrationId = normalizeKey(integrationId);
    if (!normalizedIntegrationId) {
      throw new Error('integrationId krävs.');
    }

    const existingIndex = tenantState.integrations.findIndex(
      (item) => item.integrationId === normalizedIntegrationId
    );
    const previous = existingIndex >= 0 ? tenantState.integrations[existingIndex] : null;
    const nextRecord = {
      integrationId: normalizedIntegrationId,
      isConnected: Boolean(isConnected),
      actorUserId: normalizeText(actorUserId) || null,
      source: 'tenant',
      configuredAt: previous?.configuredAt || nowIso(),
      updatedAt: nowIso(),
    };

    if (existingIndex >= 0) {
      tenantState.integrations[existingIndex] = nextRecord;
    } else {
      tenantState.integrations.push(nextRecord);
    }
    tenantState.updatedAt = nowIso();
    await save();
    return { ...nextRecord };
  }

  async function addSalesLead(input) {
    const lead = normalizeSalesLeadRecord(input);
    if (!lead) {
      throw new Error('Ofullständig sales lead.');
    }
    const tenantState = ensureTenantState(lead.tenantId);
    tenantState.salesLeads.unshift(lead);
    tenantState.salesLeads = tenantState.salesLeads.slice(0, 500);
    tenantState.updatedAt = nowIso();
    await save();
    return { ...lead };
  }

  return {
    getTenantIntegrations,
    setIntegrationConnection,
    addSalesLead,
  };
}

module.exports = {
  createCcoIntegrationStore,
};
