'use strict';

/**
 * messageIntelligenceStore (DI3) — persistens för per-message enrichment.
 *
 * Map: `${tenantId}::${mailboxId}::${graphMessageId}` → enrichment-objekt
 * (se messageEnrichment.js för shape).
 *
 * Lagras i samma data/cco/-katalog som övriga stores. Idempotent upsert.
 *
 * Metadata på toppnivån:
 *   - version
 *   - createdAt / updatedAt
 *   - lastBackfillRunAt (per tenantId)
 */

const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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
    runs: {}, // tenantId → { lastBackfillRunAt, lastDeltaRunAt, processedTotal }
  };
}

function toEntryKey(tenantId, mailboxId, graphMessageId) {
  const t = normalizeText(tenantId);
  const m = normalizeText(mailboxId);
  const g = normalizeText(graphMessageId);
  if (!t || !m || !g) return null;
  return `${t}::${m}::${g}`;
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

async function createMessageIntelligenceStore({ filePath = '' } = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('messageIntelligenceStore filePath saknas.');

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
        console.error('[messageIntelligenceStore] save failed', err);
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

  async function upsertEnrichment({
    tenantId,
    mailboxId,
    graphMessageId,
    enrichment,
    source = 'runner',
  }) {
    const key = toEntryKey(tenantId, mailboxId, graphMessageId);
    if (!key) return null;
    const enriched = asObject(enrichment);
    const existing = state.entries[key] || {};
    const merged = {
      ...existing,
      tenantId: normalizeText(tenantId),
      mailboxId: normalizeText(mailboxId),
      graphMessageId: normalizeText(graphMessageId),
      ...enriched,
      source,
      updatedAt: nowIso(),
    };
    state.entries[key] = merged;
    scheduleSave();
    return merged;
  }

  function getEnrichment({ tenantId, mailboxId, graphMessageId } = {}) {
    const key = toEntryKey(tenantId, mailboxId, graphMessageId);
    if (!key) return null;
    return state.entries[key] || null;
  }

  function listEnrichments({ tenantId = '', mailboxIds = [], limit = 0 } = {}) {
    const t = normalizeText(tenantId);
    const mailboxIdSet =
      Array.isArray(mailboxIds) && mailboxIds.length > 0
        ? new Set(mailboxIds.map((id) => normalizeText(id)).filter(Boolean))
        : null;
    const out = [];
    for (const entry of Object.values(state.entries)) {
      const e = asObject(entry);
      if (t && e.tenantId !== t) continue;
      if (mailboxIdSet && !mailboxIdSet.has(e.mailboxId)) continue;
      out.push({ ...e });
      if (limit > 0 && out.length >= limit) break;
    }
    return out;
  }

  function countEnrichments({ tenantId = '' } = {}) {
    const t = normalizeText(tenantId);
    if (!t) return Object.keys(state.entries).length;
    let n = 0;
    for (const entry of Object.values(state.entries)) {
      if (asObject(entry).tenantId === t) n += 1;
    }
    return n;
  }

  async function recordRun({ tenantId, runType = 'backfill', processed = 0 } = {}) {
    const t = normalizeText(tenantId);
    if (!t) return null;
    const existing = state.runs[t] || {};
    const next = {
      tenantId: t,
      ...existing,
      [runType === 'delta' ? 'lastDeltaRunAt' : 'lastBackfillRunAt']: nowIso(),
      processedTotal: (existing.processedTotal || 0) + Number(processed || 0),
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
    upsertEnrichment,
    getEnrichment,
    listEnrichments,
    countEnrichments,
    recordRun,
    getRunInfo,
    flush,
    _state: state,
  };
}

module.exports = {
  createMessageIntelligenceStore,
};
