'use strict';

/**
 * customerConsolidationStore (DI5) — håller en kanonisk vy per kund som
 * mailat företaget från fler än en mailbox. Används av UI:t för att samla
 * en kunds alla trådar under en "primary mailbox" (default contact@).
 *
 * Key: `${tenantId}::${customerEmailLower}`
 *
 * Entry shape:
 *   {
 *     tenantId, customerEmail,
 *     primaryMailboxId,                  // den mailbox kunden ska visas under
 *     observedMailboxIds: string[],      // alla mailboxar kunden mailat
 *     messageCount: number,              // hur många messages totalt
 *     conversationIds: string[],         // alla involverade conversation-ids
 *     firstSeenAt, lastSeenAt,           // ISO
 *     consolidatedAt: ISO
 *   }
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

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    entries: {},
    runs: {}, // tenantId → { lastRunAt, customersConsolidated, multiMailboxCount }
  };
}

function toEntryKey(tenantId, customerEmail) {
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

async function createCustomerConsolidationStore({ filePath = '' } = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('customerConsolidationStore filePath saknas.');

  const state = await readJson(resolvedPath, emptyState());
  if (!state.version) state.version = 1;
  if (!state.createdAt) state.createdAt = nowIso();
  if (!state.entries || typeof state.entries !== 'object' || Array.isArray(state.entries)) {
    state.entries = {};
  }
  if (!state.runs || typeof state.runs !== 'object' || Array.isArray(state.runs)) {
    state.runs = {};
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
        console.error('[customerConsolidationStore] save failed', err);
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

  async function upsertEntry({
    tenantId,
    customerEmail,
    primaryMailboxId,
    observedMailboxIds = [],
    messageCount = 0,
    conversationIds = [],
    firstSeenAt = null,
    lastSeenAt = null,
  } = {}) {
    const key = toEntryKey(tenantId, customerEmail);
    if (!key) return null;
    const existing = state.entries[key] || {};
    const merged = {
      ...existing,
      tenantId: normalizeText(tenantId),
      customerEmail: normalizeEmail(customerEmail),
      primaryMailboxId: normalizeText(primaryMailboxId) || existing.primaryMailboxId || null,
      observedMailboxIds: Array.from(
        new Set(
          [...(existing.observedMailboxIds || []), ...(observedMailboxIds || [])]
            .map((id) => normalizeText(id))
            .filter(Boolean)
        )
      ).sort(),
      messageCount: Number(messageCount) || existing.messageCount || 0,
      conversationIds: Array.from(
        new Set(
          [...(existing.conversationIds || []), ...(conversationIds || [])]
            .map((id) => normalizeText(id))
            .filter(Boolean)
        )
      ).slice(0, 1000),
      firstSeenAt: existing.firstSeenAt
        ? compareIsoMin(existing.firstSeenAt, firstSeenAt)
        : firstSeenAt || null,
      lastSeenAt: lastSeenAt
        ? compareIsoMax(existing.lastSeenAt, lastSeenAt)
        : existing.lastSeenAt || null,
      consolidatedAt: nowIso(),
    };
    state.entries[key] = merged;
    scheduleSave();
    return merged;
  }

  function compareIsoMin(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
  }

  function compareIsoMax(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
  }

  function getEntry({ tenantId, customerEmail } = {}) {
    const key = toEntryKey(tenantId, customerEmail);
    if (!key) return null;
    return state.entries[key] || null;
  }

  function listEntries({ tenantId = '', onlyMultiMailbox = false, limit = 0 } = {}) {
    const t = normalizeText(tenantId);
    const out = [];
    for (const entry of Object.values(state.entries)) {
      const e = asObject(entry);
      if (t && e.tenantId !== t) continue;
      if (onlyMultiMailbox && (!Array.isArray(e.observedMailboxIds) || e.observedMailboxIds.length < 2)) {
        continue;
      }
      out.push({ ...e });
      if (limit > 0 && out.length >= limit) break;
    }
    return out.sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0));
  }

  function countEntries({ tenantId = '', onlyMultiMailbox = false } = {}) {
    return listEntries({ tenantId, onlyMultiMailbox }).length;
  }

  async function recordRun({
    tenantId,
    customersConsolidated = 0,
    multiMailboxCount = 0,
  } = {}) {
    const t = normalizeText(tenantId);
    if (!t) return null;
    const next = {
      tenantId: t,
      lastRunAt: nowIso(),
      customersConsolidated: Number(customersConsolidated) || 0,
      multiMailboxCount: Number(multiMailboxCount) || 0,
    };
    state.runs[t] = next;
    scheduleSave();
    return next;
  }

  function getRunInfo(tenantId = '') {
    const t = normalizeText(tenantId);
    if (!t) return null;
    return state.runs[t] || null;
  }

  return {
    upsertEntry,
    getEntry,
    listEntries,
    countEntries,
    recordRun,
    getRunInfo,
    flush,
    _state: state,
  };
}

module.exports = {
  createCustomerConsolidationStore,
};
