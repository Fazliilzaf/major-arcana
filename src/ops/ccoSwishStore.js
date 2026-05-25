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
    payeeAlias: normalizeText(safe.payeeAlias || prev.payeeAlias),
    connectedAt: normalizeText(safe.connectedAt || prev.connectedAt),
    connectedBy: normalizeText(safe.connectedBy || prev.connectedBy),
    lastError: normalizeText(safe.lastError || prev.lastError),
  };
}

function normalizePaymentRecord(input = {}, existing = {}) {
  const safe = asObject(input);
  const prev = asObject(existing);
  const id = normalizeText(safe.id || prev.id);
  if (!id) return null;
  return {
    id,
    tenantId: normalizeText(safe.tenantId || prev.tenantId),
    instructionUUID: normalizeText(safe.instructionUUID || prev.instructionUUID || id),
    patientId: normalizeText(safe.patientId || prev.patientId),
    commercialCaseId: normalizeText(safe.commercialCaseId || prev.commercialCaseId),
    amount: normalizeText(safe.amount || prev.amount),
    currency: normalizeText(safe.currency || prev.currency) || 'SEK',
    message: normalizeText(safe.message || prev.message),
    status: normalizeText(safe.status || prev.status) || 'CREATED',
    paymentReference: normalizeText(safe.paymentReference || prev.paymentReference),
    paymentRequestToken: normalizeText(safe.paymentRequestToken || prev.paymentRequestToken),
    swishUrl: normalizeText(safe.swishUrl || prev.swishUrl),
    payerAlias: normalizeText(safe.payerAlias || prev.payerAlias),
    payeeAlias: normalizeText(safe.payeeAlias || prev.payeeAlias),
    errorCode: normalizeText(safe.errorCode || prev.errorCode),
    errorMessage: normalizeText(safe.errorMessage || prev.errorMessage),
    createdAt: normalizeText(safe.createdAt || prev.createdAt) || nowIso(),
    updatedAt: normalizeText(safe.updatedAt || prev.updatedAt) || nowIso(),
    paidAt: normalizeText(safe.paidAt || prev.paidAt),
  };
}

async function createCcoSwishStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoSwishStore.');
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
        payments: {},
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
      connected: connection.connected && Boolean(connection.payeeAlias),
      payeeAlias: connection.payeeAlias,
      connectedAt: connection.connectedAt,
      lastError: connection.lastError,
    };
  }

  async function saveConnection({ tenantId, connection, actorUserId } = {}) {
    const tenant = ensureTenant(tenantId);
    tenant.connection = normalizeConnection(
      {
        ...connection,
        connected: Boolean(connection?.payeeAlias),
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

  async function savePayment({ tenantId, payment } = {}) {
    const tenant = ensureTenant(tenantId);
    const normalized = normalizePaymentRecord({ ...payment, tenantId });
    if (!normalized) {
      throw new Error('payment.id krävs.');
    }
    const existing = asObject(tenant.payments[normalized.id]);
    tenant.payments[normalized.id] = normalizePaymentRecord(normalized, existing);
    tenant.updatedAt = nowIso();
    await save();
    return { ...tenant.payments[normalized.id] };
  }

  async function getPayment({ tenantId, paymentId } = {}) {
    const tenant = ensureTenant(tenantId);
    const record = asObject(tenant.payments[normalizeText(paymentId)]);
    return record.id ? { ...record } : null;
  }

  async function findPaymentByInstruction({ instructionUUID } = {}) {
    const token = normalizeText(instructionUUID).toUpperCase();
    if (!token) return null;
    for (const [tenantId, tenant] of Object.entries(state.tenants)) {
      for (const payment of Object.values(asObject(tenant.payments))) {
        if (normalizeText(payment.instructionUUID).toUpperCase() === token) {
          return { tenantId, payment: { ...payment } };
        }
      }
    }
    return null;
  }

  async function listPayments({ tenantId, limit = 50 } = {}) {
    const tenant = ensureTenant(tenantId);
    return Object.values(asObject(tenant.payments))
      .map((item) => ({ ...item }))
      .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
      .slice(0, Math.max(1, Number(limit) || 50));
  }

  return {
    clearConnection,
    findPaymentByInstruction,
    getConnection,
    getPayment,
    getPublicStatus,
    listPayments,
    saveConnection,
    savePayment,
  };
}

module.exports = {
  createCcoSwishStore,
  normalizeConnection,
  normalizePaymentRecord,
};
