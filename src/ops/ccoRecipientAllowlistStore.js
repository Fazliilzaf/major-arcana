'use strict';

/**
 * ccoRecipientAllowlistStore — CCO kontrollerad send, steg 2a.
 *
 * En per-tenant allowlist över MOTTAGAR-adresser (patientens `to:`) som är
 * godkända för utgående mail. Detta är säkerhetsprimitiven som ett framtida
 * (flagg- + owner-gated) utskick måste fråga innan något lämnar systemet:
 * en adress som inte är aktivt allowlistad får aldrig ta emot mail.
 *
 * Owner-mandat / avgränsning:
 *   - Denna modul SKICKAR INGENTING. Ren datalagring + kontroll (isAllowed).
 *   - Befintlig ARCANA_GRAPH_SEND_ALLOWLIST gäller AVSÄNDAR-brevlådan; detta är
 *     en separat lista för MOTTAGAR-adressen och ersätter den inte.
 *   - Varje mutation loggas i den befintliga audit-loggen (ccoAuditLog).
 *   - Rå adress lagras på persistent disk (behövs för exakt matchning), men i
 *     audit-detalj och API-svar exponeras endast maskerad adress.
 *
 * Speglar ccoCommDraftStore: factory + per-nyckel async-mutex + atomär skrivning.
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

/** Normaliserad nyckel för jämförelse: trimmad + gemener. */
function normalizeAddress(email) {
  return normalizeText(email).toLowerCase();
}

/** Konservativ e-postform-koll — vi lagrar bara rimliga adresser. */
function isPlausibleEmail(email) {
  const e = normalizeAddress(email);
  if (!e || e.length > 254) return false;
  // en @, icke-tom local + domän med minst en punkt, inga blanksteg.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function maskAddress(email) {
  const e = normalizeAddress(email);
  if (!e.includes('@')) return null;
  const [local, domain] = e.split('@');
  const head = local.slice(0, 2);
  return head + '***@' + domain;
}

async function readJson(filePath, fallback) {
  try {
    const txt = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(txt);
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
  return { tenants: {}, version: 1, updatedAt: nowIso() };
}

function cloneEntry(entry = {}) {
  return {
    address: entry.address,
    addressMasked: entry.addressMasked,
    active: !!entry.active,
    note: entry.note || null,
    addedBy: entry.addedBy || null,
    addedAt: entry.addedAt || null,
    updatedAt: entry.updatedAt || null,
    removedBy: entry.removedBy || null,
    removedAt: entry.removedAt || null,
  };
}

function logAudit(auditLog, action, { tenantId, address }, actor, result = 'ok', extra = {}) {
  if (!auditLog?.append) return;
  auditLog.append({
    action,
    actor: { role: actor?.role || 'unknown', userId: actor?.userId || null },
    target: { kind: 'comm_recipient_allowlist', id: maskAddress(address), tenantId: tenantId || null },
    result,
    // Aldrig rå adress i audit-detalj — bara maskerad.
    detail: { recipientMasked: maskAddress(address), ...extra },
  });
}

async function createCcoRecipientAllowlistStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs.');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const state = await readJson(filePath, emptyState());
  if (!state.tenants || typeof state.tenants !== 'object') state.tenants = {};

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  // Per-tenant async-mutex: serialiserar read-modify-write så två samtidiga
  // add/remove på samma tenant inte skriver över varandra (last-writer-wins).
  const tenantLocks = new Map();
  async function withTenantLock(tenantId, fn) {
    while (tenantLocks.has(tenantId)) {
      await tenantLocks.get(tenantId);
    }
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    tenantLocks.set(tenantId, gate);
    try {
      return await fn();
    } finally {
      tenantLocks.delete(tenantId);
      release();
    }
  }

  function bucket(tenantId) {
    const t = normalizeText(tenantId);
    if (!t) throw new Error('tenantId krävs.');
    if (!state.tenants[t]) state.tenants[t] = { entries: {} };
    if (!state.tenants[t].entries) state.tenants[t].entries = {};
    return state.tenants[t].entries;
  }

  /**
   * Lägg till (eller återaktivera) en mottagaradress. Idempotent: en redan
   * aktiv adress lämnas orörd men uppdaterar note/updatedAt.
   */
  async function addRecipient(tenantId, address, { actor = {}, note = '' } = {}) {
    const t = normalizeText(tenantId);
    if (!t) throw new Error('tenantId krävs.');
    if (!isPlausibleEmail(address)) {
      const e = new Error('ogiltig mottagaradress');
      e.statusCode = 400;
      throw e;
    }
    const key = normalizeAddress(address);
    return withTenantLock(t, async () => {
      const entries = bucket(t);
      const existing = entries[key];
      const wasActive = !!existing?.active;
      const entry = {
        address: key,
        addressMasked: maskAddress(key),
        active: true,
        note: normalizeText(note) || existing?.note || null,
        addedBy: existing?.addedBy || actor?.userId || null,
        addedAt: existing?.addedAt || nowIso(),
        updatedAt: nowIso(),
        removedBy: null,
        removedAt: null,
      };
      entries[key] = entry;
      await save();
      logAudit(
        auditLog,
        'communication.recipient_allowlist.added',
        { tenantId: t, address: key },
        actor,
        'ok',
        { reactivated: !wasActive && !!existing }
      );
      return cloneEntry(entry);
    });
  }

  /** Soft-remove: markerar adressen inaktiv (historiken bevaras för audit). */
  async function removeRecipient(tenantId, address, { actor = {} } = {}) {
    const t = normalizeText(tenantId);
    if (!t) throw new Error('tenantId krävs.');
    const key = normalizeAddress(address);
    return withTenantLock(t, async () => {
      const entries = bucket(t);
      const existing = entries[key];
      if (!existing || !existing.active) {
        // Inget aktivt att ta bort → idempotent no-op (loggas ändå som ok).
        logAudit(
          auditLog,
          'communication.recipient_allowlist.removed',
          { tenantId: t, address: key },
          actor,
          'ok',
          { noop: true }
        );
        return null;
      }
      existing.active = false;
      existing.removedBy = actor?.userId || null;
      existing.removedAt = nowIso();
      existing.updatedAt = nowIso();
      await save();
      logAudit(
        auditLog,
        'communication.recipient_allowlist.removed',
        { tenantId: t, address: key },
        actor,
        'ok'
      );
      return cloneEntry(existing);
    });
  }

  /**
   * Säkerhetskontrollen: är adressen aktivt allowlistad för denna tenant?
   * Rent lässteg, ingen mutation, ingen audit. Fail-closed på ogiltig input.
   */
  function isAllowed(tenantId, address) {
    const t = normalizeText(tenantId);
    if (!t || !isPlausibleEmail(address)) return false;
    const entries = state.tenants[t]?.entries || {};
    const entry = entries[normalizeAddress(address)];
    return !!(entry && entry.active);
  }

  /** Listar (default) aktiva poster för en tenant. */
  function listRecipients(tenantId, { includeInactive = false } = {}) {
    const t = normalizeText(tenantId);
    if (!t) return [];
    const entries = state.tenants[t]?.entries || {};
    return Object.values(entries)
      .filter((e) => (includeInactive ? true : e.active))
      .map(cloneEntry)
      .sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
  }

  return {
    addRecipient,
    removeRecipient,
    isAllowed,
    listRecipients,
  };
}

module.exports = {
  createCcoRecipientAllowlistStore,
  // exporterade för test/återanvändning
  normalizeAddress,
  isPlausibleEmail,
  maskAddress,
};
