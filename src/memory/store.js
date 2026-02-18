const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

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
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

function isValidRole(role) {
  return role === 'user' || role === 'assistant';
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeBrand(brand) {
  if (typeof brand !== 'string') return null;
  const trimmed = brand.trim();
  return trimmed ? trimmed : null;
}

async function createMemoryStore({ filePath, ttlMs }) {
  const state = await readJson(filePath, { conversations: {} });

  function pruneExpired() {
    if (!ttlMs) return;
    const cutoff = Date.now() - ttlMs;
    for (const [id, convo] of Object.entries(state.conversations)) {
      const updatedAt = Date.parse(convo.updatedAt || '');
      if (!Number.isFinite(updatedAt) || updatedAt < cutoff) {
        delete state.conversations[id];
      }
    }
  }

  pruneExpired();
  await writeJsonAtomic(filePath, state);

  async function save() {
    pruneExpired();
    await writeJsonAtomic(filePath, state);
  }

  async function createConversation(brand) {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    state.conversations[id] = {
      id,
      brand: normalizeBrand(brand),
      createdAt,
      updatedAt: createdAt,
      summary: '',
      messages: [],
    };
    await save();
    return id;
  }

  async function getConversation(id) {
    return state.conversations[id] || null;
  }

  async function ensureConversation(id, brand) {
    const existing = state.conversations[id];
    if (existing) {
      const normalized = normalizeBrand(brand);
      if (normalized && !existing.brand) {
        existing.brand = normalized;
        existing.updatedAt = nowIso();
        await save();
      }
      return existing;
    }
    const createdAt = nowIso();
    state.conversations[id] = {
      id,
      brand: normalizeBrand(brand),
      createdAt,
      updatedAt: createdAt,
      summary: '',
      messages: [],
    };
    await save();
    return state.conversations[id];
  }

  async function appendMessage(id, role, content) {
    if (!isValidRole(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
    const convo = await ensureConversation(id);
    convo.messages.push({
      role,
      content: String(content ?? ''),
      ts: nowIso(),
    });
    convo.updatedAt = nowIso();
    await save();
    return convo;
  }

  async function setSummary(id, summary) {
    const convo = await ensureConversation(id);
    convo.summary = String(summary ?? '');
    convo.updatedAt = nowIso();
    await save();
    return convo;
  }

  async function replaceMessages(id, messages) {
    const convo = await ensureConversation(id);
    convo.messages = Array.isArray(messages) ? messages : [];
    convo.updatedAt = nowIso();
    await save();
    return convo;
  }

  async function deleteConversation(id) {
    if (!state.conversations[id]) return false;
    delete state.conversations[id];
    await save();
    return true;
  }

  return {
    filePath,
    ttlMs,
    createConversation,
    getConversation,
    ensureConversation,
    appendMessage,
    setSummary,
    replaceMessages,
    deleteConversation,
  };
}

module.exports = { createMemoryStore };
