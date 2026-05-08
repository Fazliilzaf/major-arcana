'use strict';

/**
 * ccoConversationNotesStore — enkel append-only notes-store per
 * mailboxConversationId. Används av /cco/ för interna anteckningar
 * som operatörer skriver om en kund/tråd.
 *
 * Designprinciper:
 *   • Persistent JSON-fil (ARCANA_STATE_ROOT)
 *   • Append-only (ingen edit/delete från UI ännu)
 *   • Notes sorteras nyast först vid läsning
 *   • Ingen schema-validering — frontend ansvarar för rimlig längd (max 2000 tecken)
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
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

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    // notesByConversation: { [conversationKey]: [{noteId, body, authorEmail, authorName, createdAt}] }
    notesByConversation: {},
  };
}

async function createCcoConversationNotesStore({ filePath } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoConversationNotesStore.');
  }
  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    notesByConversation:
      state?.notesByConversation && typeof state.notesByConversation === 'object'
        ? state.notesByConversation
        : {},
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function listNotes({ conversationKey } = {}) {
    const key = normalizeText(conversationKey);
    if (!key) return [];
    const arr = asArray(state.notesByConversation[key]);
    // Returnera nyast först, defensiv kopia
    return [...arr]
      .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')))
      .map((n) => cloneJson(n));
  }

  async function addNote({ conversationKey, body, authorEmail, authorName } = {}) {
    const key = normalizeText(conversationKey);
    if (!key) throw new Error('conversationKey krävs.');
    const text = normalizeText(body);
    if (!text) throw new Error('body krävs.');
    if (text.length > 2000) {
      throw new Error('Anteckning är för lång (max 2000 tecken).');
    }
    const note = {
      noteId: crypto.randomUUID(),
      body: text,
      authorEmail: normalizeText(authorEmail).toLowerCase() || null,
      authorName: normalizeText(authorName) || null,
      createdAt: nowIso(),
    };
    if (!Array.isArray(state.notesByConversation[key])) {
      state.notesByConversation[key] = [];
    }
    state.notesByConversation[key].push(note);
    await save();
    return cloneJson(note);
  }

  function countNotes({ conversationKey } = {}) {
    const key = normalizeText(conversationKey);
    if (!key) return 0;
    return asArray(state.notesByConversation[key]).length;
  }

  return {
    listNotes,
    addNote,
    countNotes,
  };
}

module.exports = {
  createCcoConversationNotesStore,
};
