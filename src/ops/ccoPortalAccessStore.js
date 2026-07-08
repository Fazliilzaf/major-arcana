'use strict';

/**
 * ccoPortalAccessStore — Fas 2, steg 2. Auth-primitiv för patientportalens
 * "magiska länk": en BESTÅENDE per-patient token som ger åtkomst att läsa/skriva
 * portal-meddelanden utan BankID varje gång (BankID sparas för signering/känsliga
 * actions). Token är per-patient, har utgång, kan roteras och återkallas.
 *
 * Säkerhet:
 *   - Token är en bearer-hemlighet i länken → resolve() släpper bara igenom
 *     icke-utgångna, icke-återkallade tokens och returnerar bara {tenantId,
 *     customerId} (aldrig något känsligt).
 *   - Ren datalagring. Grindar INGET utskick och rör ingen personal-RBAC — den
 *     här modulen är enbart patient-sidans identitets-uppslag.
 *
 * Speglar ccoPortalMessageStore: global skrivkö + per-nyckel mutex + atomär skrivning.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_TTL_DAYS = 90;

function nowMs() {
  return Date.now();
}
function nowIso() {
  return new Date().toISOString();
}
function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function newToken() {
  return crypto.randomBytes(32).toString('base64url');
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
function emptyState() {
  return { tokens: {}, byCustomer: {}, version: 1, updatedAt: nowIso() };
}

function isActive(rec) {
  if (!rec || rec.revokedAt) return false;
  return !(rec.expiresAtMs && nowMs() > rec.expiresAtMs);
}

async function createCcoPortalAccessStore({ filePath } = {}) {
  if (!filePath) throw new Error('filePath krävs.');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const state = await readJson(filePath, emptyState());
  if (!state.tokens || typeof state.tokens !== 'object') state.tokens = {};
  if (!state.byCustomer || typeof state.byCustomer !== 'object') state.byCustomer = {};

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

  function custKey(tenantId, customerId) {
    const t = normalizeText(tenantId);
    const c = normalizeText(customerId);
    if (!t) throw new Error('tenantId krävs.');
    if (!c) throw new Error('customerId krävs.');
    return t + '::' + c;
  }

  function ttlMs(ttlDays) {
    // Default bara när inget giltigt tal ges. Ett explicit (även litet/negativt)
    // värde respekteras — nyttigt för test och för korta engångslänkar.
    const days = Number.isFinite(ttlDays) ? ttlDays : DEFAULT_TTL_DAYS;
    return days * 24 * 60 * 60 * 1000;
  }

  /**
   * Ge patienten en giltig token. Idempotent: finns redan en aktiv token för
   * kunden återanvänds den (samma länk fortsätter funka). Annars skapas en ny.
   */
  async function issueToken({ tenantId, customerId, ttlDays } = {}) {
    const key = custKey(tenantId, customerId);
    return withLock(key, async () => {
      const existingToken = state.byCustomer[key];
      if (existingToken && isActive(state.tokens[existingToken])) {
        const rec = state.tokens[existingToken];
        return { token: existingToken, expiresAt: rec.expiresAt, reused: true };
      }
      const token = newToken();
      const created = nowMs();
      const expiresAtMs = created + ttlMs(ttlDays);
      state.tokens[token] = {
        tenantId: normalizeText(tenantId),
        customerId: normalizeText(customerId),
        createdAt: nowIso(),
        expiresAtMs,
        expiresAt: new Date(expiresAtMs).toISOString(),
        revokedAt: null,
      };
      state.byCustomer[key] = token;
      await save();
      return { token, expiresAt: state.tokens[token].expiresAt, reused: false };
    });
  }

  /** Rotera: återkalla nuvarande token och ge en ny (t.ex. vid misstänkt läcka). */
  async function rotateToken({ tenantId, customerId, ttlDays } = {}) {
    const key = custKey(tenantId, customerId);
    return withLock(key, async () => {
      const prev = state.byCustomer[key];
      if (prev && state.tokens[prev]) state.tokens[prev].revokedAt = nowIso();
      const token = newToken();
      const created = nowMs();
      const expiresAtMs = created + ttlMs(ttlDays);
      state.tokens[token] = {
        tenantId: normalizeText(tenantId),
        customerId: normalizeText(customerId),
        createdAt: nowIso(),
        expiresAtMs,
        expiresAt: new Date(expiresAtMs).toISOString(),
        revokedAt: null,
      };
      state.byCustomer[key] = token;
      await save();
      return { token, expiresAt: state.tokens[token].expiresAt, reused: false };
    });
  }

  /** Återkalla patientens token (utan att ge en ny). */
  async function revokeToken({ tenantId, customerId } = {}) {
    const key = custKey(tenantId, customerId);
    return withLock(key, async () => {
      const tok = state.byCustomer[key];
      if (tok && state.tokens[tok] && !state.tokens[tok].revokedAt) {
        state.tokens[tok].revokedAt = nowIso();
        await save();
        return { revoked: true };
      }
      return { revoked: false };
    });
  }

  /** Slå upp en token → {tenantId, customerId} om giltig, annars null. */
  function resolveToken(token) {
    const rec = state.tokens[normalizeText(token)];
    if (!isActive(rec)) return null;
    return { tenantId: rec.tenantId, customerId: rec.customerId, expiresAt: rec.expiresAt };
  }

  /** Aggregat för adoptionsmätning: aktiva vs totala utfärdade tokens. */
  function stats() {
    const all = Object.values(state.tokens || {});
    let active = 0;
    let revoked = 0;
    for (const rec of all) {
      if (rec?.revokedAt) revoked += 1;
      else if (isActive(rec)) active += 1;
    }
    return { total: all.length, active, revoked };
  }

  return { issueToken, rotateToken, revokeToken, resolveToken, stats };
}

module.exports = { createCcoPortalAccessStore, DEFAULT_TTL_DAYS };
