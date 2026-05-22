const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function sanitizeTag(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/\s+/g, '-').slice(0, 40);
  return normalized;
}

function sanitizeTags(values) {
  const tags = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = sanitizeTag(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(normalized);
    if (tags.length >= 12) break;
  }
  return tags;
}

function normalizePriority(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['hög', 'hog', 'high'].includes(normalized)) return 'high';
  if (['låg', 'lag', 'low'].includes(normalized)) return 'low';
  return 'medium';
}

function normalizeVisibility(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (
    ['alla operatörer', 'alla operatorer', 'all_operators', 'operators', 'all operators'].includes(
      normalized
    )
  ) {
    return 'all_operators';
  }
  if (['intern', 'internal'].includes(normalized)) return 'internal';
  return 'team';
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    notes: [],
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

function createCompositeKey(tenantId, workspaceId, conversationId, customerId, destinationKey) {
  return [
    normalizeText(tenantId),
    normalizeText(workspaceId),
    normalizeText(conversationId),
    normalizeKey(customerId),
    normalizeKey(destinationKey),
  ].join('::');
}

function normalizeNoteRecord(input = {}) {
  const tenantId = normalizeText(input.tenantId);
  const workspaceId = normalizeText(input.workspaceId);
  const conversationId = normalizeText(input.conversationId);
  const customerId = normalizeKey(input.customerId);
  const destinationKey = normalizeKey(input.destinationKey);
  if (!tenantId || !workspaceId || !conversationId || !customerId || !destinationKey) {
    return null;
  }

  const createdAt = normalizeText(input.createdAt) || nowIso();
  const updatedAt = normalizeText(input.updatedAt) || createdAt;

  return {
    noteId: normalizeText(input.noteId) || crypto.randomUUID(),
    tenantId,
    workspaceId,
    conversationId,
    customerId,
    customerName: normalizeText(input.customerName) || null,
    destinationKey,
    destinationLabel: normalizeText(input.destinationLabel) || destinationKey,
    text: normalizeText(input.text),
    tags: sanitizeTags(input.tags),
    priority: normalizePriority(input.priority),
    visibility: normalizeVisibility(input.visibility),
    templateKey: normalizeKey(input.templateKey) || null,
    actorUserId: normalizeText(input.actorUserId) || null,
    createdAt,
    updatedAt,
  };
}

async function createCcoNoteStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoNoteStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    notes: Array.isArray(state?.notes)
      ? state.notes.map((item) => normalizeNoteRecord(item)).filter(Boolean)
      : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function selectNotes({ tenantId, workspaceId, conversationId, customerId }) {
    const tenant = normalizeText(tenantId);
    const workspace = normalizeText(workspaceId);
    const conversation = normalizeText(conversationId);
    const customer = normalizeKey(customerId);
    return state.notes.filter(
      (note) =>
        note.tenantId === tenant &&
        note.workspaceId === workspace &&
        note.conversationId === conversation &&
        note.customerId === customer
    );
  }

  async function getNotesByConversation({ tenantId, workspaceId, conversationId, customerId }) {
    const notes = selectNotes({ tenantId, workspaceId, conversationId, customerId }).sort((a, b) =>
      String(a.destinationKey).localeCompare(String(b.destinationKey))
    );
    return notes.map((item) => ({ ...item }));
  }

  async function getNote({ tenantId, workspaceId, conversationId, customerId, destinationKey }) {
    const compositeKey = createCompositeKey(
      tenantId,
      workspaceId,
      conversationId,
      customerId,
      destinationKey
    );
    const match = state.notes.find(
      (note) =>
        createCompositeKey(
          note.tenantId,
          note.workspaceId,
          note.conversationId,
          note.customerId,
          note.destinationKey
        ) === compositeKey
    );
    return match ? { ...match } : null;
  }

  async function saveNote(input) {
    const next = normalizeNoteRecord(input);
    if (!next) {
      throw new Error('Anteckningen saknar obligatoriska fält.');
    }

    const compositeKey = createCompositeKey(
      next.tenantId,
      next.workspaceId,
      next.conversationId,
      next.customerId,
      next.destinationKey
    );

    const existingIndex = state.notes.findIndex(
      (note) =>
        createCompositeKey(
          note.tenantId,
          note.workspaceId,
          note.conversationId,
          note.customerId,
          note.destinationKey
        ) === compositeKey
    );

    if (existingIndex >= 0) {
      const existing = state.notes[existingIndex];
      state.notes[existingIndex] = {
        ...existing,
        ...next,
        noteId: existing.noteId,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
      };
      await save();
      return { ...state.notes[existingIndex] };
    }

    const created = {
      ...next,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.notes.push(created);
    await save();
    return { ...created };
  }

  return {
    getNotesByConversation,
    getNote,
    saveNote,
  };
}

module.exports = {
  createCcoNoteStore,
};
