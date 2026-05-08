'use strict';

/**
 * clientoBookingStore (CL2) — persistens för bokningar per kund och tenant.
 *
 * Lagring: en JSON-fil med struktur:
 *   {
 *     version, createdAt, updatedAt,
 *     bookings: {
 *       "${tenantId}::${customerEmail-lowercased}": [
 *         { bookingId, customerEmail, customerName, serviceLabel,
 *           staffName, locationName, startsAt, endsAt, status, source,
 *           notes, createdAt, updatedAt }
 *       ]
 *     },
 *     imports: { tenantId → { lastImportAt, lastSource, totalRows, accepted, rejected } }
 *   }
 *
 * Idempotent upsert via bookingId.
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
  return normalizeText(value).toLowerCase().replace(/^mailto:/, '');
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    bookings: {},
    imports: {},
  };
}

function toBucketKey(tenantId, customerEmail) {
  const t = normalizeText(tenantId);
  const e = normalizeEmail(customerEmail);
  if (!t || !e) return null;
  return `${t}::${e}`;
}

function normalizeBooking(input = {}) {
  const safe = asObject(input);
  const customerEmail = normalizeEmail(safe.customerEmail);
  const bookingId = normalizeText(safe.bookingId) || normalizeText(safe.id);
  if (!bookingId || !customerEmail) return null;
  const startsAt = safe.startsAt ? new Date(safe.startsAt).toISOString() : null;
  const endsAt = safe.endsAt ? new Date(safe.endsAt).toISOString() : null;
  return {
    bookingId,
    customerEmail,
    customerName: normalizeText(safe.customerName),
    serviceLabel: normalizeText(safe.serviceLabel || safe.service),
    staffName: normalizeText(safe.staffName || safe.staff),
    locationName: normalizeText(safe.locationName || safe.location),
    startsAt,
    endsAt,
    durationMinutes: Number.isFinite(Number(safe.durationMinutes))
      ? Number(safe.durationMinutes)
      : null,
    status: normalizeText(safe.status) || 'unknown', // upcoming | completed | cancelled | no_show | unknown
    source: normalizeText(safe.source) || 'cliento',
    notes: normalizeText(safe.notes),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
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

async function createClientoBookingStore({ filePath = '' } = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('clientoBookingStore filePath saknas.');
  const state = await readJson(resolvedPath, emptyState());
  if (!state.bookings || typeof state.bookings !== 'object') state.bookings = {};
  if (!state.imports || typeof state.imports !== 'object') state.imports = {};

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
        console.error('[clientoBookingStore] save failed', err);
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

  async function upsertBooking({ tenantId, booking }) {
    const normalized = normalizeBooking(booking);
    if (!normalized) return null;
    const key = toBucketKey(tenantId, normalized.customerEmail);
    if (!key) return null;
    const list = asArray(state.bookings[key]);
    const existingIdx = list.findIndex((b) => b.bookingId === normalized.bookingId);
    if (existingIdx >= 0) {
      const existing = list[existingIdx];
      list[existingIdx] = { ...existing, ...normalized, updatedAt: nowIso() };
    } else {
      list.push(normalized);
    }
    state.bookings[key] = list;
    scheduleSave();
    return normalized;
  }

  async function importBatch({ tenantId, bookings, source = 'cliento' }) {
    const t = normalizeText(tenantId);
    if (!t) return { accepted: 0, rejected: 0 };
    let accepted = 0;
    let rejected = 0;
    for (const raw of asArray(bookings)) {
      const r = await upsertBooking({ tenantId: t, booking: raw });
      if (r) accepted += 1;
      else rejected += 1;
    }
    state.imports[t] = {
      lastImportAt: nowIso(),
      lastSource: source,
      totalRows: asArray(bookings).length,
      accepted,
      rejected,
    };
    scheduleSave();
    await flush();
    return { accepted, rejected };
  }

  function getBookingsForCustomer({ tenantId, customerEmail }) {
    const key = toBucketKey(tenantId, customerEmail);
    if (!key) return [];
    return asArray(state.bookings[key]).slice();
  }

  function listAllBookings({ tenantId, limit = 0 }) {
    const t = normalizeText(tenantId);
    const out = [];
    for (const [key, list] of Object.entries(state.bookings)) {
      if (t && !key.startsWith(t + '::')) continue;
      for (const b of asArray(list)) out.push(b);
      if (limit > 0 && out.length >= limit) break;
    }
    return out;
  }

  function summarize({ tenantId } = {}) {
    const t = normalizeText(tenantId);
    let totalCustomers = 0;
    let totalBookings = 0;
    let upcoming = 0;
    let nowMs = Date.now();
    for (const [key, list] of Object.entries(state.bookings)) {
      if (t && !key.startsWith(t + '::')) continue;
      totalCustomers += 1;
      for (const b of asArray(list)) {
        totalBookings += 1;
        if (
          b.status === 'upcoming' ||
          (b.startsAt && Date.parse(b.startsAt) > nowMs && b.status !== 'cancelled')
        ) {
          upcoming += 1;
        }
      }
    }
    return {
      tenantId: t || null,
      totalCustomers,
      totalBookings,
      upcomingBookings: upcoming,
      lastImport: t ? state.imports[t] || null : null,
    };
  }

  async function clearTenant({ tenantId }) {
    const t = normalizeText(tenantId);
    if (!t) return 0;
    let removed = 0;
    for (const key of Object.keys(state.bookings)) {
      if (key.startsWith(t + '::')) {
        delete state.bookings[key];
        removed += 1;
      }
    }
    delete state.imports[t];
    scheduleSave();
    await flush();
    return removed;
  }

  return {
    upsertBooking,
    importBatch,
    getBookingsForCustomer,
    listAllBookings,
    summarize,
    clearTenant,
    flush,
    _state: state,
  };
}

module.exports = {
  createClientoBookingStore,
  normalizeBooking,
};
