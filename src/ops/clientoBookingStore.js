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
 *           priceSek, notes, customerPhone, clientoCustomerId, rawStatus,
 *           createdAt, updatedAt }
 *       ]
 *     },
 *     imports: { tenantId → { lastImportAt, lastSource, totalRows, accepted, rejected } }
 *   }
 *
 * Idempotent upsert via bookingId.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
// 2026-08-08: hair-tp-clinic/hair_tp splittrade samma kliniks bokningar i
// två tenant-namnrymder (CCO-STATUS.md punkt 6). Återanvänder den redan
// existerande stavningstoleransen från ccoPatientAssetIdentity.js i stället
// för att skriva en tredje kopia av samma logik.
const { tenantCandidates } = require('./ccoPatientAssetIdentity');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^mailto:/, '');
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function normalizePhoneKey(value) {
  return normalizeText(value).replace(/\D+/g, '');
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

function toBookingBucketKey(tenantId, booking) {
  const t = normalizeText(tenantId);
  if (!t) return null;
  const email = normalizeEmail(booking?.customerEmail);
  if (email) return `${t}::${email}`;
  const clientoCustomerId = normalizeText(booking?.clientoCustomerId);
  if (clientoCustomerId) return `${t}::cliento:${clientoCustomerId}`;
  const phone = normalizePhoneKey(booking?.customerPhone);
  if (phone) return `${t}::phone:${phone}`;
  const source = normalizeText(booking?.source).toLowerCase();
  const bookingId = normalizeText(booking?.bookingId);
  return source.startsWith('cliento') && bookingId ? `${t}::unlinked:${bookingId}` : null;
}

function tenantIdFromBucketKey(key) {
  return normalizeText(key).split('::')[0] || '';
}

function withTenantFromBucket(booking, bucketKey) {
  const tenantId = tenantIdFromBucketKey(bucketKey);
  return tenantId ? { ...booking, tenantId } : { ...booking };
}

function normalizePriceSek(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  let s = String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/kr\.?|sek/g, '');
  if (!s) return null;
  // Europeiskt tusental: 2.500,00 → 2500.00
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

function normalizeBooking(input = {}) {
  const safe = asObject(input);
  const customerEmail = normalizeEmail(safe.customerEmail);
  const customerPhone = normalizePhone(safe.customerPhone || safe.phone);
  const clientoCustomerId = normalizeText(safe.clientoCustomerId || safe.customerId);
  const bookingId = normalizeText(safe.bookingId) || normalizeText(safe.id);
  const rawSource = normalizeText(safe.source);
  const source = rawSource || 'cliento';
  const hasIdentity = Boolean(customerEmail || customerPhone || clientoCustomerId);
  if (!bookingId || (!hasIdentity && !rawSource.toLowerCase().startsWith('cliento'))) return null;
  const startsAt = safe.startsAt ? new Date(safe.startsAt).toISOString() : null;
  const endsAt = safe.endsAt ? new Date(safe.endsAt).toISOString() : null;
  const priceSek = normalizePriceSek(
    safe.priceSek !== undefined
      ? safe.priceSek
      : safe.price !== undefined
        ? safe.price
        : safe.amountSek
  );
  return {
    bookingId,
    customerEmail,
    customerName: normalizeText(safe.customerName),
    customerPhone,
    clientoCustomerId,
    patientId: normalizeText(safe.patientId),
    encounterId: normalizeText(safe.encounterId || safe.treatmentEncounterId),
    serviceLabel: normalizeText(safe.serviceLabel || safe.service),
    staffName: normalizeText(safe.staffName || safe.staff),
    locationName: normalizeText(safe.locationName || safe.location),
    startsAt,
    endsAt,
    durationMinutes: Number.isFinite(Number(safe.durationMinutes))
      ? Number(safe.durationMinutes)
      : null,
    status: normalizeText(safe.status) || 'unknown', // upcoming | completed | cancelled | no_show | unknown
    rawStatus: normalizeText(safe.rawStatus),
    source,
    priceSek,
    bookingNotes: normalizeText(safe.bookingNotes),
    customerMessage: normalizeText(safe.customerMessage),
    internalNotes: normalizeText(safe.internalNotes),
    treatmentNotes: normalizeText(safe.treatmentNotes),
    notes: normalizeText(safe.notes),
    sourceMessageId: normalizeText(safe.sourceMessageId || safe.internetMessageId),
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

function bookingIdIndexKey(tenantId, bookingId) {
  const t = normalizeText(tenantId);
  const id = normalizeText(bookingId);
  return t && id ? `${t}::${id}` : null;
}

const PRESERVE_WHEN_BLANK_FIELDS = Object.freeze([
  'customerName',
  'customerEmail',
  'customerPhone',
  'clientoCustomerId',
  'patientId',
  'encounterId',
  'serviceLabel',
  'staffName',
  'locationName',
  'rawStatus',
  'bookingNotes',
  'customerMessage',
  'internalNotes',
  'treatmentNotes',
  'notes',
  'sourceMessageId',
]);

// Slår ihop två poster för samma bookingId: incoming vinner fält för fält,
// utom att ett tomt incoming-fält aldrig får radera ett redan känt värde i
// existing (se PRESERVE_WHEN_BLANK_FIELDS). Används både av upsertBooking
// (löpande import) och dedupeBookings (sanering av redan skrivna dubbletter).
function mergeBookingRecords(existing, incoming) {
  const merged = {
    ...existing,
    ...incoming,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  };
  for (const field of PRESERVE_WHEN_BLANK_FIELDS) {
    if (!normalizeText(incoming[field]) && normalizeText(existing[field])) {
      merged[field] = existing[field];
    }
  }
  // priceSek is numeric — preserve existing when the update omits/clears it.
  if (incoming.priceSek === null && Number.isFinite(existing.priceSek)) {
    merged.priceSek = existing.priceSek;
  }
  return merged;
}

// Bucket-nyckeln kan innehålla e-post/telefon — aldrig lämpligt att skriva
// ut rått i en rapport. Klassificerar bara TYPEN av identitet, för
// diagnostik utan att exponera patientdata.
function bucketKeyIdentityType(bucketKey) {
  const rest = String(bucketKey || '')
    .split('::')
    .slice(1)
    .join('::');
  if (rest.startsWith('cliento:')) return 'clientoCustomerId';
  if (rest.startsWith('phone:')) return 'phone';
  if (rest.startsWith('unlinked:')) return 'unlinked';
  return rest ? 'email' : 'okänd';
}

function buildBookingIdIndex(bookings) {
  const index = new Map();
  for (const [bucketKey, list] of Object.entries(bookings)) {
    const tenantId = tenantIdFromBucketKey(bucketKey);
    for (const b of asArray(list)) {
      const indexKey = bookingIdIndexKey(tenantId, b?.bookingId);
      if (indexKey && !index.has(indexKey)) index.set(indexKey, bucketKey);
    }
  }
  return index;
}

async function createClientoBookingStore({ filePath = '' } = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('clientoBookingStore filePath saknas.');
  const state = await readJson(resolvedPath, emptyState());
  if (!state.bookings || typeof state.bookings !== 'object') state.bookings = {};
  if (!state.imports || typeof state.imports !== 'object') state.imports = {};
  // Global bookingId → hink-index. Löst i minnet, aldrig persisterat separat —
  // härleds alltid ur state.bookings vid start så det aldrig kan bli inaktuellt.
  // Utan det här deduplicerar upsertBooking bara inom sin egen hink, och samma
  // bokning kan hamna i två hinkar om identitetsfälten skiljer mellan importer
  // (se ORD-100 Fas 0, 2026-08-08 — 17 727 dubbletter hittade i prod).
  const bookingIdIndex = buildBookingIdIndex(state.bookings);

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
    const naturalKey = toBookingBucketKey(tenantId, normalized);
    if (!naturalKey) return null;
    // Om samma bookingId redan finns i en ANNAN hink (identitetsfälten skiljde
    // sig mellan importer), uppdatera den befintliga posten där den ligger i
    // stället för att lägga till en ny kopia i den naturliga hinken — annars
    // uppstår en dubblett som listAllBookings sedan exponerar två gånger.
    const indexKey = bookingIdIndexKey(tenantId, normalized.bookingId);
    const existingBucketKey = indexKey ? bookingIdIndex.get(indexKey) : null;
    const key =
      existingBucketKey && asArray(state.bookings[existingBucketKey]).length
        ? existingBucketKey
        : naturalKey;
    const list = asArray(state.bookings[key]);
    const existingIdx = list.findIndex((b) => b.bookingId === normalized.bookingId);
    if (existingIdx >= 0) {
      list[existingIdx] = mergeBookingRecords(list[existingIdx], normalized);
    } else {
      list.push(normalized);
    }
    state.bookings[key] = list;
    if (indexKey) bookingIdIndex.set(indexKey, key);
    scheduleSave();
    return normalized;
  }

  // Sanering av dubbletter skrivna INNAN den globala bookingId-dedupen fanns
  // (ORD-100 Fas 0, 2026-08-08 — 17 727 poster i prod). Läs-endast: hittar
  // grupper av samma bookingId spridda över flera hinkar. Skriver ingenting.
  function findDuplicateBookingGroups({ tenantId } = {}) {
    const t = normalizeText(tenantId);
    const groups = new Map();
    for (const [bucketKey, list] of Object.entries(state.bookings)) {
      const bucketTenantId = tenantIdFromBucketKey(bucketKey);
      if (t && bucketTenantId !== t) continue;
      asArray(list).forEach((record) => {
        const indexKey = bookingIdIndexKey(bucketTenantId, record?.bookingId);
        if (!indexKey) return;
        if (!groups.has(indexKey)) groups.set(indexKey, []);
        groups.get(indexKey).push({ bucketKey, tenantId: bucketTenantId, record });
      });
    }
    const duplicates = [];
    for (const entries of groups.values()) {
      if (entries.length > 1) duplicates.push(entries);
    }
    return duplicates;
  }

  // commit: false (default) — bara rapport, ingen skrivning. commit: true —
  // slår ihop varje dubblettgrupp (samma fältregler som upsertBooking),
  // väljer en kanonisk hink utifrån den sammanslagna postens egna
  // identitetsfält, tar bort övriga kopior, sparar atomiskt en gång på slutet.
  async function dedupeBookings({ tenantId, commit = false } = {}) {
    const groups = findDuplicateBookingGroups({ tenantId });
    const report = {
      duplicateGroups: groups.length,
      recordsThatWouldBeRemoved: 0,
      samples: [],
    };
    for (const entries of groups) {
      const sorted = [...entries].sort((a, b) =>
        String(a.record.updatedAt || '').localeCompare(String(b.record.updatedAt || ''))
      );
      let merged = sorted[0].record;
      for (let i = 1; i < sorted.length; i += 1) {
        merged = mergeBookingRecords(merged, sorted[i].record);
      }
      const groupTenantId = sorted[0].tenantId;
      const canonicalKey =
        toBookingBucketKey(groupTenantId, merged) || sorted[sorted.length - 1].bucketKey;

      if (report.samples.length < 10) {
        report.samples.push({
          bookingId: merged.bookingId,
          tenantId: groupTenantId,
          bucketsFound: entries.length,
          identityTypesFound: entries.map((e) => bucketKeyIdentityType(e.bucketKey)),
          canonicalIdentityType: bucketKeyIdentityType(canonicalKey),
        });
      }
      report.recordsThatWouldBeRemoved += entries.length - 1;

      if (commit) {
        for (const entry of entries) {
          const list = asArray(state.bookings[entry.bucketKey]).filter(
            (b) => b.bookingId !== merged.bookingId
          );
          state.bookings[entry.bucketKey] = list;
        }
        const canonicalList = asArray(state.bookings[canonicalKey]);
        canonicalList.push(merged);
        state.bookings[canonicalKey] = canonicalList;
        const indexKey = bookingIdIndexKey(groupTenantId, merged.bookingId);
        if (indexKey) bookingIdIndex.set(indexKey, canonicalKey);
      }
    }
    if (commit && groups.length) await save();
    return report;
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

  // Matchar en hink-nyckel mot en tenant, tolerant mot kända stavningsvarianter
  // (hair-tp-clinic/hair_tp m.fl. — se tenantCandidates). Tomt tenantId matchar
  // allt, precis som innan — ändrar INTE beteendet för anrop utan tenantId.
  function bucketKeyMatchesTenant(key, tenantId) {
    const t = normalizeText(tenantId);
    if (!t) return true;
    return tenantCandidates(t).some((candidate) => key.startsWith(candidate + '::'));
  }

  function getBookingsForCustomer({ tenantId, customerEmail }) {
    const t = normalizeText(tenantId);
    if (!t) return [];
    const email = normalizeEmail(customerEmail);
    if (!email) return [];
    // Samma kund kan ha bokningar under BÅDA tenant-stavningarna — slå ihop
    // i stället för att bara läsa en hink, annars missas hälften igen.
    const merged = new Map();
    for (const candidate of tenantCandidates(t)) {
      const key = toBucketKey(candidate, email);
      if (!key) continue;
      for (const b of asArray(state.bookings[key])) {
        if (b?.bookingId) merged.set(b.bookingId, b);
      }
    }
    return [...merged.values()];
  }

  function listAllBookings({ tenantId, limit = 0, exactTenant = false }) {
    const out = [];
    const t = normalizeText(tenantId);
    for (const [key, list] of Object.entries(state.bookings)) {
      if (exactTenant) {
        if (!t || !key.startsWith(`${t}::`)) continue;
      } else if (!bucketKeyMatchesTenant(key, tenantId)) {
        continue;
      }
      for (const b of asArray(list)) out.push(withTenantFromBucket(b, key));
      if (limit > 0 && out.length >= limit) break;
    }
    return out;
  }

  function listBookingsInRange({ tenantId, fromDate, toDate, limit = 0 } = {}) {
    const from = normalizeText(fromDate).slice(0, 10);
    const to = normalizeText(toDate).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return [];
    }
    const out = [];
    for (const [key, list] of Object.entries(state.bookings)) {
      if (!bucketKeyMatchesTenant(key, tenantId)) continue;
      for (const booking of asArray(list)) {
        const date = normalizeText(booking?.startsAt).slice(0, 10);
        if (!date || date < from || date > to) continue;
        out.push(withTenantFromBucket(booking, key));
        if (limit > 0 && out.length >= limit) return out;
      }
    }
    return out;
  }

  function summarize({ tenantId } = {}) {
    const t = normalizeText(tenantId);
    let totalCustomers = 0;
    let totalBookings = 0;
    let upcoming = 0;
    const nowMs = Date.now();
    for (const [key, list] of Object.entries(state.bookings)) {
      if (!bucketKeyMatchesTenant(key, tenantId)) continue;
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
    // state.imports är keyad exakt (inte hinkar) — leta bland samma
    // stavningsvarianter, ta den senaste om flera tenant-stavningar har
    // importerat var för sig.
    let lastImport = null;
    if (t) {
      for (const candidate of tenantCandidates(t)) {
        const entry = state.imports[candidate];
        if (entry && (!lastImport || entry.lastImportAt > lastImport.lastImportAt)) {
          lastImport = entry;
        }
      }
    }
    return {
      tenantId: t || null,
      totalCustomers,
      totalBookings,
      upcomingBookings: upcoming,
      lastImport,
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
    listBookingsInRange,
    summarize,
    clearTenant,
    findDuplicateBookingGroups,
    dedupeBookings,
    flush,
    _state: state,
  };
}

module.exports = {
  createClientoBookingStore,
  normalizeBooking,
  normalizePriceSek,
  mergeBookingRecords,
  bucketKeyIdentityType,
};
