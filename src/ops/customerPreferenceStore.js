'use strict';

/**
 * customerPreferenceStore (DI6) — per-customer preferences inom en tenant.
 *
 * Just nu: preferredMailboxId. Kan utökas med tags, customer-segment, VIP, etc.
 *
 * Key: `${tenantId}::${customerEmail-lowercased}` → { preferredMailboxId, ... }
 *
 * Lagras i data/cco/customer-preferences.json. Idempotent upsert.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    entries: {},
  };
}

function toKey(tenantId, customerEmail) {
  const t = normalizeText(tenantId);
  const e = normalizeEmail(customerEmail);
  if (!t || !e) return null;
  return `${t}::${e}`;
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, filePath);
}

async function createCustomerPreferenceStore({ filePath = '' } = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('customerPreferenceStore filePath saknas.');

  const state = await readJson(resolvedPath, emptyState());
  if (!state.version) state.version = 1;
  if (!state.entries || typeof state.entries !== 'object' || Array.isArray(state.entries)) {
    state.entries = {};
  }

  let saveTimer = null;
  let savePending = false;

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(resolvedPath, state);
  }

  function scheduleSave() {
    if (saveTimer) return;
    savePending = true;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      if (!savePending) return;
      savePending = false;
      try {
        await save();
      } catch (err) {
        console.error('[customerPreferenceStore] save failed', err);
      }
    }, 500);
  }

  async function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (savePending) {
      savePending = false;
      await save();
    }
  }

  async function setPreferredMailbox({ tenantId, customerEmail, preferredMailboxId, reason = '' }) {
    const key = toKey(tenantId, customerEmail);
    if (!key) return null;
    const existing = state.entries[key] || {};
    const next = {
      ...existing,
      tenantId: normalizeText(tenantId),
      customerEmail: normalizeEmail(customerEmail),
      preferredMailboxId: normalizeEmail(preferredMailboxId) || null,
      preferenceReason: normalizeText(reason),
      updatedAt: nowIso(),
    };
    state.entries[key] = next;
    scheduleSave();
    return next;
  }

  function getPreference({ tenantId, customerEmail }) {
    const key = toKey(tenantId, customerEmail);
    if (!key) return null;
    return state.entries[key] || null;
  }

  function listPreferences({ tenantId = '', preferredMailboxId = '' } = {}) {
    const t = normalizeText(tenantId);
    const m = normalizeEmail(preferredMailboxId);
    const out = [];
    for (const entry of Object.values(state.entries)) {
      if (t && entry.tenantId !== t) continue;
      if (m && entry.preferredMailboxId !== m) continue;
      out.push({ ...entry });
    }
    return out;
  }

  function countPreferences({ tenantId = '' } = {}) {
    const t = normalizeText(tenantId);
    if (!t) return Object.keys(state.entries).length;
    let n = 0;
    for (const entry of Object.values(state.entries)) {
      if (entry.tenantId === t) n += 1;
    }
    return n;
  }

  return {
    setPreferredMailbox,
    getPreference,
    listPreferences,
    countPreferences,
    flush,
    _state: state,
  };
}

module.exports = {
  createCustomerPreferenceStore,
};
