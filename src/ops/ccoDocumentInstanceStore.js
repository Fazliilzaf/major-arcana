'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const ALLOWED_STATUSES = new Set([
  'pending',
  'sent',
  'viewed',
  'filling',
  'filled',
  'signed',
  'delivered',
  'archived',
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, instances: [] };
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

function normalizeInstance(input = {}) {
  const tenantId = normalizeText(input.tenantId);
  const patientId = normalizeText(input.patientId);
  const documentTypeId = normalizeText(input.documentTypeId) || null;
  const needsManualTriage = input.needsManualTriage === true;
  if (!tenantId || !patientId) return null;
  if (!documentTypeId && !needsManualTriage) return null;
  const createdAt = normalizeText(input.createdAt) || nowIso();
  const status = ALLOWED_STATUSES.has(input.status) ? input.status : 'pending';
  return {
    instanceId: normalizeText(input.instanceId) || crypto.randomUUID(),
    tenantId,
    patientId,
    documentTypeId,
    needsManualTriage,
    status,
    createdAt,
    sentAt: normalizeText(input.sentAt) || null,
    filledAt: normalizeText(input.filledAt) || null,
    signedAt: normalizeText(input.signedAt) || null,
    deliveredAt: normalizeText(input.deliveredAt) || null,
    actor: normalizeText(input.actor) || null,
    sourceMessageId: normalizeText(input.sourceMessageId) || null,
    triageConfidence: normalizeText(input.triageConfidence) || null,
    payload: input.payload && typeof input.payload === 'object' ? input.payload : null,
    auditRef: normalizeText(input.auditRef) || null,
    updatedAt: normalizeText(input.updatedAt) || createdAt,
  };
}

async function createCcoDocumentInstanceStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoDocumentInstanceStore.');
  }

  async function loadState() {
    const state = await readJson(filePath, emptyState());
    state.instances = Array.isArray(state.instances) ? state.instances : [];
    return state;
  }

  async function saveState(state) {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
    return state;
  }

  async function createInstance({
    tenantId,
    patientId,
    documentTypeId,
    needsManualTriage = false,
    status,
    actor,
    payload,
    sourceMessageId = null,
    triageConfidence = null,
  }) {
    const row = normalizeInstance({
      tenantId,
      patientId,
      documentTypeId,
      needsManualTriage,
      status,
      actor,
      payload,
      sourceMessageId,
      triageConfidence,
    });
    if (!row) throw new Error('Ogiltig dokumentinstans.');
    const state = await loadState();
    state.instances.push(row);
    await saveState(state);
    return row;
  }

  async function transition(instanceId, newStatus, actor = null) {
    const key = normalizeText(instanceId);
    const status = normalizeText(newStatus);
    if (!key || !ALLOWED_STATUSES.has(status)) {
      throw new Error('Ogiltig statusövergång.');
    }
    const state = await loadState();
    const row = state.instances.find((item) => item.instanceId === key);
    if (!row) return null;
    row.status = status;
    row.actor = normalizeText(actor) || row.actor;
    row.updatedAt = nowIso();
    const ts = row.updatedAt;
    if (status === 'sent') row.sentAt = ts;
    if (status === 'filled') row.filledAt = ts;
    if (status === 'signed') row.signedAt = ts;
    if (status === 'delivered') row.deliveredAt = ts;
    await saveState(state);
    return row;
  }

  async function listForPatient({ tenantId, patientId }) {
    const tid = normalizeText(tenantId);
    const pid = normalizeText(patientId);
    const state = await loadState();
    return state.instances.filter((row) => row.tenantId === tid && row.patientId === pid);
  }

  async function listForTenant({ tenantId }) {
    const tid = normalizeText(tenantId);
    const state = await loadState();
    return state.instances.filter((row) => row.tenantId === tid);
  }

  async function findBySourceMessageId(sourceMessageId) {
    const key = normalizeText(sourceMessageId);
    if (!key) return null;
    const state = await loadState();
    return state.instances.find((row) => row.sourceMessageId === key) || null;
  }

  async function findOpenForPatientType({ tenantId, patientId, documentTypeId }) {
    const tid = normalizeText(tenantId);
    const pid = normalizeText(patientId);
    const typeId = normalizeText(documentTypeId);
    if (!tid || !pid || !typeId) return null;
    const state = await loadState();
    return (
      state.instances.find(
        (row) =>
          row.tenantId === tid &&
          row.patientId === pid &&
          row.documentTypeId === typeId &&
          !['archived'].includes(row.status)
      ) || null
    );
  }

  return {
    createInstance,
    transition,
    listForPatient,
    listForTenant,
    findBySourceMessageId,
    findOpenForPatientType,
  };
}

module.exports = {
  createCcoDocumentInstanceStore,
  ALLOWED_STATUSES,
};
