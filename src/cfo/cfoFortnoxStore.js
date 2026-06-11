'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function normalizeConnection(input = {}, existing = {}) {
  const safe = asObject(input);
  const prev = asObject(existing);
  return {
    connected: Boolean(safe.connected ?? prev.connected),
    accessToken: normalizeText(safe.accessToken || prev.accessToken),
    refreshToken: normalizeText(safe.refreshToken || prev.refreshToken),
    expiresAt: normalizeText(safe.expiresAt || prev.expiresAt),
    scope: normalizeText(safe.scope || prev.scope),
    connectedAt: normalizeText(safe.connectedAt || prev.connectedAt),
    connectedBy: normalizeText(safe.connectedBy || prev.connectedBy),
    lastRefreshAt: normalizeText(safe.lastRefreshAt || prev.lastRefreshAt),
    lastError: normalizeText(safe.lastError || prev.lastError),
  };
}

async function createCfoFortnoxStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för cfoFortnoxStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    tenants: state?.tenants && typeof state.tenants === 'object' ? state.tenants : {},
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function ensureTenant(tenantId) {
    const id = normalizeText(tenantId);
    if (!id) throw new Error('tenantId krävs.');
    if (!state.tenants[id]) {
      state.tenants[id] = {
        connection: normalizeConnection({ connected: false }),
        pendingOAuthStates: {},
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    }
    return state.tenants[id];
  }

  async function getConnection({ tenantId } = {}) {
    const tenant = ensureTenant(tenantId);
    return { ...normalizeConnection(tenant.connection) };
  }

  async function getPublicStatus({ tenantId } = {}) {
    const connection = await getConnection({ tenantId });
    return {
      connected: connection.connected && Boolean(connection.accessToken),
      scope: connection.scope,
      connectedAt: connection.connectedAt,
      expiresAt: connection.expiresAt,
      lastRefreshAt: connection.lastRefreshAt,
      lastError: connection.lastError,
    };
  }

  async function saveConnection({ tenantId, connection, actorUserId } = {}) {
    const tenant = ensureTenant(tenantId);
    tenant.connection = normalizeConnection(
      {
        ...connection,
        connected: Boolean(connection?.accessToken),
        connectedBy: actorUserId || connection?.connectedBy,
        connectedAt: connection?.connectedAt || nowIso(),
      },
      tenant.connection
    );
    tenant.updatedAt = nowIso();
    await save();
    return getPublicStatus({ tenantId });
  }

  async function clearConnection({ tenantId } = {}) {
    const tenant = ensureTenant(tenantId);
    tenant.connection = normalizeConnection({ connected: false });
    tenant.updatedAt = nowIso();
    await save();
    return getPublicStatus({ tenantId });
  }

  async function createOAuthState({ tenantId, actorUserId, ttlMs = 10 * 60 * 1000 } = {}) {
    const tenant = ensureTenant(tenantId);
    const stateToken = crypto.randomUUID();
    tenant.pendingOAuthStates[stateToken] = {
      tenantId: normalizeText(tenantId),
      actorUserId: normalizeText(actorUserId),
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
    tenant.updatedAt = nowIso();
    await save();
    return stateToken;
  }

  async function consumeOAuthState(stateToken) {
    const token = normalizeText(stateToken);
    if (!token) return null;
    for (const [tenantId, tenant] of Object.entries(state.tenants)) {
      const pending = asObject(tenant.pendingOAuthStates)[token];
      if (!pending) continue;
      delete tenant.pendingOAuthStates[token];
      tenant.updatedAt = nowIso();
      await save();
      if (Date.parse(pending.expiresAt) < Date.now()) return null;
      return { tenantId, actorUserId: pending.actorUserId };
    }
    return null;
  }

  return {
    clearConnection,
    consumeOAuthState,
    createOAuthState,
    getConnection,
    getPublicStatus,
    saveConnection,
  };
}

module.exports = {
  createCfoFortnoxStore,
  normalizeConnection,
};
