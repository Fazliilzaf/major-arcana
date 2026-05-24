'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    draftProposals: [],
    reminderLog: [],
    lastReports: {},
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
  const dir = require('node:path').dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function createCcoPatientCareStateStore({ filePath }) {
  const state = await readJson(filePath, emptyState());

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function listDraftProposals({ tenantId, status = 'pending', limit = 50 } = {}) {
    const tenant = normalizeText(tenantId);
    const wanted = normalizeText(status).toLowerCase() || 'pending';
    return asArray(state.draftProposals)
      .filter(
        (row) =>
          normalizeText(row.tenantId) === tenant &&
          (wanted === 'all' || normalizeText(row.status).toLowerCase() === wanted)
      )
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
      .slice(0, Math.max(1, Math.min(200, Number(limit) || 50)));
  }

  async function upsertDraftProposal(input = {}) {
    const proposalId = normalizeText(input.proposalId) || crypto.randomUUID();
    const index = state.draftProposals.findIndex((row) => row.proposalId === proposalId);
    const existing = index >= 0 ? state.draftProposals[index] : {};
    const next = {
      ...existing,
      ...input,
      proposalId,
      tenantId: normalizeText(input.tenantId || existing.tenantId),
      patientId: normalizeText(input.patientId || existing.patientId),
      status: normalizeText(input.status || existing.status) || 'pending',
      createdAt: normalizeText(existing.createdAt) || nowIso(),
      updatedAt: nowIso(),
    };
    if (index >= 0) state.draftProposals[index] = next;
    else state.draftProposals.push(next);
    await save();
    return next;
  }

  async function wasReminderSent({ tenantId, reminderKey, withinHours = 24 } = {}) {
    const tenant = normalizeText(tenantId);
    const key = normalizeText(reminderKey);
    if (!tenant || !key) return false;
    const cutoff = Date.now() - Math.max(1, Number(withinHours) || 24) * 60 * 60 * 1000;
    return asArray(state.reminderLog).some(
      (row) =>
        normalizeText(row.tenantId) === tenant &&
        normalizeText(row.reminderKey) === key &&
        Date.parse(row.sentAt || 0) >= cutoff
    );
  }

  async function logReminder(input = {}) {
    state.reminderLog.push({
      reminderId: crypto.randomUUID(),
      tenantId: normalizeText(input.tenantId),
      reminderKey: normalizeText(input.reminderKey),
      reminderType: normalizeText(input.reminderType),
      patientId: normalizeText(input.patientId),
      channel: normalizeText(input.channel) || 'scheduler',
      sentAt: nowIso(),
      metadata: asObject(input.metadata),
    });
    if (state.reminderLog.length > 5000) {
      state.reminderLog = state.reminderLog.slice(-5000);
    }
    await save();
  }

  async function setLastReport({ tenantId, reportType, payload = {} } = {}) {
    const tenant = normalizeText(tenantId);
    const type = normalizeText(reportType);
    if (!tenant || !type) return null;
    state.lastReports = asObject(state.lastReports);
    state.lastReports[tenant] = asObject(state.lastReports[tenant]);
    state.lastReports[tenant][type] = {
      generatedAt: nowIso(),
      ...payload,
    };
    await save();
    return state.lastReports[tenant][type];
  }

  async function getLastReport({ tenantId, reportType } = {}) {
    const tenant = normalizeText(tenantId);
    const type = normalizeText(reportType);
    return asObject(asObject(state.lastReports)[tenant])[type] || null;
  }

  return {
    getLastReport,
    listDraftProposals,
    logReminder,
    setLastReport,
    upsertDraftProposal,
    wasReminderSent,
  };
}

module.exports = { createCcoPatientCareStateStore };
