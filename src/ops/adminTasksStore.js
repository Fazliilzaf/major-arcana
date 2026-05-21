'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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
    updatedAt: ts,
    tasks: [],
  };
}

function normalizeTask(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: normalizeText(source.id) || crypto.randomUUID(),
    tenantId: normalizeText(source.tenantId) || 'default',
    title: normalizeText(source.title) || 'Namnlös adminuppgift',
    workstream: normalizeText(source.workstream) || 'general',
    owner: normalizeText(source.owner),
    status: normalizeText(source.status).toLowerCase() || 'open',
    dod: normalizeText(source.dod),
    deadline: normalizeText(source.deadline),
    riskLevel: normalizeText(source.riskLevel).toUpperCase() || 'L1',
    nextStep: normalizeText(source.nextStep),
    updatedAt: normalizeText(source.updatedAt) || nowIso(),
  };
}

async function createAdminTasksStore({ filePath = '' } = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('adminTasksStore filePath saknas.');

  let state = await readJson(resolvedPath, createEmptyState());
  if (!state || typeof state !== 'object') state = createEmptyState();
  if (!Array.isArray(state.tasks)) state.tasks = [];

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(resolvedPath, state);
  }

  return {
    async listTasks({
      tenantId = '',
      status = '',
      owner = '',
      riskLevel = '',
      workstream = '',
      deadlineBefore = '',
      limit = 200,
    } = {}) {
      const normalizedTenantId = normalizeText(tenantId);
      const normalizedStatus = normalizeText(status).toLowerCase();
      const normalizedOwner = normalizeText(owner).toUpperCase();
      const normalizedRisk = normalizeText(riskLevel).toUpperCase();
      const normalizedWorkstream = normalizeText(workstream).toLowerCase();
      const deadlineCutoff = normalizeText(deadlineBefore);
      const max = Math.max(1, Math.min(500, Number(limit) || 200));
      let items = state.tasks.map((task) => normalizeTask(task));
      if (normalizedTenantId) {
        items = items.filter((task) => task.tenantId === normalizedTenantId);
      }
      if (normalizedStatus) {
        items = items.filter((task) => task.status === normalizedStatus);
      }
      if (normalizedOwner) {
        items = items.filter((task) => normalizeText(task.owner).toUpperCase() === normalizedOwner);
      }
      if (normalizedRisk) {
        items = items.filter((task) => normalizeText(task.riskLevel).toUpperCase() === normalizedRisk);
      }
      if (normalizedWorkstream) {
        items = items.filter(
          (task) => normalizeText(task.workstream).toLowerCase() === normalizedWorkstream
        );
      }
      if (deadlineCutoff) {
        const cutoffTs = Date.parse(deadlineCutoff);
        if (Number.isFinite(cutoffTs)) {
          items = items.filter((task) => {
            const ts = Date.parse(normalizeText(task.deadline));
            return Number.isFinite(ts) && ts <= cutoffTs;
          });
        }
      }
      return items.slice(0, max);
    },

    async upsertTask(input = {}) {
      const task = normalizeTask(input);
      const index = state.tasks.findIndex((item) => item.id === task.id);
      if (index >= 0) {
        state.tasks[index] = { ...state.tasks[index], ...task, updatedAt: nowIso() };
      } else {
        state.tasks.push({ ...task, updatedAt: nowIso() });
      }
      await save();
      return task;
    },
  };
}

module.exports = {
  createAdminTasksStore,
};
