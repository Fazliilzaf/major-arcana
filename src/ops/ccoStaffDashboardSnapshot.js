'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function createCcoStaffDashboardSnapshot({ filePath, readCache = null } = {}) {
  const snapshotPath = normalizeText(filePath);
  if (!snapshotPath) throw new Error('dashboard snapshot filePath saknas.');

  async function loadTenantSnapshot(tenantId) {
    const state = await readJson(snapshotPath, { tenants: {} });
    return state.tenants?.[tenantId] || null;
  }

  async function saveTenantSnapshot(tenantId, payload) {
    const state = await readJson(snapshotPath, { tenants: {} });
    state.tenants = state.tenants || {};
    state.tenants[tenantId] = {
      ...payload,
      tenantId,
      updatedAt: new Date().toISOString(),
    };
    state.updatedAt = new Date().toISOString();
    await writeJsonAtomic(snapshotPath, state);
    if (readCache?.del) {
      await readCache.del(readCache.buildKey('dashboard-snapshot', tenantId));
    }
    return state.tenants[tenantId];
  }

  async function buildSnapshot({
    tenantId,
    monitorMetrics = null,
    readiness = null,
    ownerDashboard = null,
    pilotReport = null,
    riskSummary = null,
    incidentSummary = null,
    mailInsights = null,
  } = {}) {
    return {
      tenantId,
      monitorMetrics,
      readiness,
      ownerDashboard,
      pilotReport,
      riskSummary,
      incidentSummary,
      mailInsights,
      builtAt: new Date().toISOString(),
    };
  }

  return {
    loadTenantSnapshot,
    saveTenantSnapshot,
    buildSnapshot,
  };
}

function createCcoWorklistSnapshot({ filePath, readCache = null } = {}) {
  const snapshotPath = normalizeText(filePath);
  if (!snapshotPath) throw new Error('worklist snapshot filePath saknas.');

  async function loadTenantSnapshot(tenantId) {
    const state = await readJson(snapshotPath, { tenants: {} });
    return state.tenants?.[tenantId] || null;
  }

  async function saveTenantSnapshot(tenantId, payload) {
    const state = await readJson(snapshotPath, { tenants: {} });
    state.tenants = state.tenants || {};
    state.tenants[tenantId] = {
      ...payload,
      tenantId,
      updatedAt: new Date().toISOString(),
    };
    state.updatedAt = new Date().toISOString();
    await writeJsonAtomic(snapshotPath, state);
    if (readCache?.del) {
      await readCache.del(readCache.buildKey('worklist-snapshot', tenantId));
    }
    return state.tenants[tenantId];
  }

  return {
    loadTenantSnapshot,
    saveTenantSnapshot,
  };
}

module.exports = {
  createCcoStaffDashboardSnapshot,
  createCcoWorklistSnapshot,
};
