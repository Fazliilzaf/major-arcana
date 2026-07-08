'use strict';

/**
 * ccoPortalNudgeStore — Fas 2, följdsteg. Idempotens för portal-nudgen: håller
 * reda på vilka kunder som redan fått en förberedd portal-länk-nudge så vi
 * ALDRIG förbereder två utkast för samma kund. Ren datalagring — beslut och
 * utskick ligger i servicen/den kontrollerade sändkedjan.
 *
 * Speglar ccoPortalAccessStore: global skrivkö + per-nyckel mutex + atomär skrivning.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function nowIso() {
  return new Date().toISOString();
}
function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}
async function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp.' + process.pid + '.' + crypto.randomUUID();
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, filePath);
}

async function createCcoPortalNudgeStore({ filePath } = {}) {
  if (!filePath) throw new Error('filePath krävs.');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const state = await readJson(filePath, { nudges: {}, version: 1, updatedAt: nowIso() });
  if (!state.nudges || typeof state.nudges !== 'object') state.nudges = {};

  let saveQueue = Promise.resolve();
  async function save() {
    const run = saveQueue.then(async () => {
      state.updatedAt = nowIso();
      await writeJsonAtomic(filePath, state);
    });
    saveQueue = run.catch(() => {});
    await run;
  }

  const locks = new Map();
  async function withLock(key, fn) {
    while (locks.has(key)) await locks.get(key);
    let release;
    const gate = new Promise((r) => (release = r));
    locks.set(key, gate);
    try {
      return await fn();
    } finally {
      locks.delete(key);
      release();
    }
  }

  function key(tenantId, customerId) {
    const t = normalizeText(tenantId);
    const c = normalizeText(customerId);
    if (!t) throw new Error('tenantId krävs.');
    if (!c) throw new Error('customerId krävs.');
    return t + '::' + c;
  }

  /** Har kunden redan fått en förberedd nudge? */
  function wasNudged({ tenantId, customerId } = {}) {
    return Boolean(state.nudges[key(tenantId, customerId)]);
  }

  /** Läs nudge-posten (eller null). */
  function getNudge({ tenantId, customerId } = {}) {
    const rec = state.nudges[key(tenantId, customerId)];
    return rec ? { ...rec } : null;
  }

  /** Registrera att en nudge förberetts. Idempotent per kund. */
  async function recordNudge({ tenantId, customerId, draftId = null, token = null } = {}) {
    const k = key(tenantId, customerId);
    return withLock(k, async () => {
      if (state.nudges[k]) return { ...state.nudges[k], created: false };
      state.nudges[k] = {
        tenantId: normalizeText(tenantId),
        customerId: normalizeText(customerId),
        draftId: normalizeText(draftId) || null,
        // Token lagras maskad — vi behåller bara ett fragment för spårbarhet.
        tokenHint: token ? normalizeText(token).slice(0, 8) + '…' : null,
        nudgedAt: nowIso(),
      };
      await save();
      return { ...state.nudges[k], created: true };
    });
  }

  /** Antal förberedda nudgar (adoptionsmätning). */
  function stats() {
    return { prepared: Object.keys(state.nudges || {}).length };
  }

  return { wasNudged, getNudge, recordNudge, stats };
}

module.exports = { createCcoPortalNudgeStore };
