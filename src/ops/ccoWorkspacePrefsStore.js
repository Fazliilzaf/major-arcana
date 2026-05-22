const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    preferences: [],
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

function compositeKey(tenantId, userId, workspaceId) {
  return [normalizeText(tenantId), normalizeText(userId), normalizeText(workspaceId)].join('::');
}

function normalizePrefsRecord(input = {}) {
  const tenantId = normalizeText(input.tenantId);
  const userId = normalizeText(input.userId);
  const workspaceId = normalizeText(input.workspaceId);
  if (!tenantId || !userId || !workspaceId) {
    return null;
  }
  const createdAt = normalizeText(input.createdAt) || nowIso();
  const updatedAt = normalizeText(input.updatedAt) || createdAt;
  return {
    preferenceId: normalizeText(input.preferenceId) || crypto.randomUUID(),
    tenantId,
    userId,
    workspaceId,
    leftWidth: toPositiveInt(input.leftWidth, 458),
    rightWidth: toPositiveInt(input.rightWidth, 372),
    createdAt,
    updatedAt,
  };
}

async function createCcoWorkspacePrefsStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoWorkspacePrefsStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    preferences: Array.isArray(state?.preferences)
      ? state.preferences.map((item) => normalizePrefsRecord(item)).filter(Boolean)
      : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getWorkspacePrefs({ tenantId, userId, workspaceId }) {
    const key = compositeKey(tenantId, userId, workspaceId);
    const match = state.preferences.find(
      (item) => compositeKey(item.tenantId, item.userId, item.workspaceId) === key
    );
    return match ? { ...match } : null;
  }

  async function saveWorkspacePrefs(input) {
    const next = normalizePrefsRecord(input);
    if (!next) {
      throw new Error('Workspace preferences saknar obligatoriska fält.');
    }
    const key = compositeKey(next.tenantId, next.userId, next.workspaceId);
    const existingIndex = state.preferences.findIndex(
      (item) => compositeKey(item.tenantId, item.userId, item.workspaceId) === key
    );

    if (existingIndex >= 0) {
      const existing = state.preferences[existingIndex];
      state.preferences[existingIndex] = {
        ...existing,
        ...next,
        preferenceId: existing.preferenceId,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      };
      await save();
      return { ...state.preferences[existingIndex] };
    }

    const created = {
      ...next,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.preferences.push(created);
    await save();
    return { ...created };
  }

  async function resetWorkspacePrefs({ tenantId, userId, workspaceId }) {
    const key = compositeKey(tenantId, userId, workspaceId);
    const beforeLength = state.preferences.length;
    state.preferences = state.preferences.filter(
      (item) => compositeKey(item.tenantId, item.userId, item.workspaceId) !== key
    );
    if (state.preferences.length !== beforeLength) {
      await save();
    }
    return {
      reset: state.preferences.length !== beforeLength,
      tenantId: normalizeText(tenantId),
      userId: normalizeText(userId),
      workspaceId: normalizeText(workspaceId),
    };
  }

  return {
    getWorkspacePrefs,
    saveWorkspacePrefs,
    resetWorkspacePrefs,
  };
}

module.exports = {
  createCcoWorkspacePrefsStore,
};
