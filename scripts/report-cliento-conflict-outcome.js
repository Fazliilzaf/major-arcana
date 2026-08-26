#!/usr/bin/env node
'use strict';

/**
 * Read-only: klassificerar cross-tenant statuskonflikter i clientoBookingStore
 * och avgör — för no-show/cancelled-utfall — om kunden ombokade (har en senare
 * bokning) eller försvann (ingen senare bokning). Skriver ALDRIG till storen.
 *
 * Viktigt om statusfälten:
 *   • `rawStatus` är Clientos egna status ("Show"/"Booked"/"NoShow"/"Cancelled"/
 *     "Done"). Det är HÄR besöksutfallet ligger — inte i `status`.
 *   • `status` är en normaliserad härledning ("completed"/"upcoming"/…). Den
 *     kollapsar t.ex. "Booked" och "Show" till samma värde och döljer därför
 *     konflikten. Den här rapporten jämför därför `rawStatus` (faller tillbaka
 *     på `status` om rawStatus saknas).
 *
 * Riktning: den berikade sidan (med utfallet) är `hair_tp` (legacy); den råa
 * CSV-sidan (som bara säger "Booked") är `hair-tp-clinic` (kanonisk). Rapporten
 * är dock riktningsoberoende — den hittar utfallssidan oavsett tenant.
 *
 * Användning:
 *   node scripts/report-cliento-conflict-outcome.js \
 *     --store /var/data/cco/cliento-bookings.json \
 *     [--details 530] [--identifiers]
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { createClientoBookingStore } = require(
  path.join(__dirname, '..', 'src', 'ops', 'clientoBookingStore')
);

const KANONISK = 'hair-tp-clinic';
const LEGACY = 'hair_tp';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s_]+/g, '');
}

/** Clientos faktiska status — rawStatus först, faller tillbaka på status. */
function statusOf(booking) {
  return normalizeText(booking?.rawStatus) || normalizeText(booking?.status);
}

/** Råstatus → kanoniskt utfall. 'other' = okänt värde, 'blank' = saknas. */
function outcomeOf(status) {
  const s = normalizeKey(status);
  if (!s) return 'blank';
  if (['show', 'kom', 'kommit'].includes(s)) return 'show';
  if (['done', 'completed', 'klar', 'genomford', 'betald'].includes(s)) return 'done';
  if (['noshow', 'nocom', 'utebliven', 'uteblev'].includes(s)) return 'noshow';
  if (['cancelled', 'canceled', 'avbokad', 'avbokat', 'cancel'].includes(s)) return 'cancelled';
  if (['booked', 'bokad', 'bokat', 'pending', 'upcoming'].includes(s)) return 'booked';
  return 'other';
}

function bookingIdOf(booking) {
  return normalizeText(booking?.bookingId || booking?.id);
}

function customerIdOf(booking) {
  return normalizeText(booking?.clientoCustomerId || booking?.customerId);
}

function shortRef(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function groupUniqueByBookingId(bookings) {
  const groups = new Map();
  for (const booking of Array.isArray(bookings) ? bookings : []) {
    const id = bookingIdOf(booking);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(booking);
  }
  return groups;
}

/** clientoCustomerId → deduplicerade, sorterade bokningar (över båda tenants). */
function buildCustomerHistory(bookings) {
  const byCustomer = new Map();
  const seen = new Set();
  for (const booking of Array.isArray(bookings) ? bookings : []) {
    const cid = customerIdOf(booking);
    const bid = bookingIdOf(booking);
    if (!cid || !bid) continue;
    const key = `${cid}::${bid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byCustomer.has(cid)) byCustomer.set(cid, []);
    byCustomer.get(cid).push({
      bookingId: bid,
      startsAtMs: Date.parse(booking?.startsAt) || 0,
      outcome: outcomeOf(statusOf(booking)),
    });
  }
  for (const list of byCustomer.values()) {
    list.sort((a, b) => a.startsAtMs - b.startsAtMs || a.bookingId.localeCompare(b.bookingId));
  }
  return byCustomer;
}

/**
 * Har kunden en ANNAN bokning (annat bookingId) med startsAt strängt senare än
 * `referenceMs`? `null` = kan inte avgöras (saknar kund-ID).
 */
function hasLaterBooking(history, excludedBookingId, referenceMs) {
  if (!history) return null;
  return history.some((h) => h.bookingId !== excludedBookingId && h.startsAtMs > referenceMs);
}

function buildConflictOutcomeReport({
  canonicalBookings = [],
  legacyBookings = [],
  allBookings = [],
  identifiers = false,
  details = 0,
} = {}) {
  const history = buildCustomerHistory(allBookings);
  const canonical = groupUniqueByBookingId(canonicalBookings);
  const legacy = groupUniqueByBookingId(legacyBookings);

  const statusTransitions = new Map();
  const unknownStatuses = new Set();

  let totalPairs = 0;
  let safeCount = 0;
  let needsHistoryCount = 0;
  let reviewCount = 0;

  let rebooked = 0;
  let lost = 0;
  let unknown = 0;

  const detailRows = [];

  const union = new Set([...canonical.keys(), ...legacy.keys()]);
  for (const bookingId of union) {
    const canonEntries = canonical.get(bookingId) || [];
    const legacyEntries = legacy.get(bookingId) || [];
    if (canonEntries.length !== 1 || legacyEntries.length !== 1) continue;

    totalPairs += 1;
    const canon = canonEntries[0];
    const leg = legacyEntries[0];

    const rawCanon = statusOf(canon);
    const rawLeg = statusOf(leg);
    if (rawCanon === rawLeg) continue; // rawStatus överensstämmer — ingen statuskonflikt

    const oc = outcomeOf(rawCanon);
    const ol = outcomeOf(rawLeg);
    if (oc === 'other') unknownStatuses.add(rawCanon);
    if (ol === 'other') unknownStatuses.add(rawLeg);

    const transition = `${rawCanon || '(blank)'} -> ${rawLeg || '(blank)'}`;
    statusTransitions.set(transition, (statusTransitions.get(transition) || 0) + 1);

    const isAmbiguous = (o) => o === 'noshow' || o === 'cancelled';
    const isSafeOutcome = (o) => o === 'show' || o === 'done';
    const isBooked = (o) => o === 'booked';

    let category;
    if ((isAmbiguous(oc) && isBooked(ol)) || (isAmbiguous(ol) && isBooked(oc))) {
      category = 'needs_history';
    } else if ((isSafeOutcome(oc) && isBooked(ol)) || (isSafeOutcome(ol) && isBooked(oc))) {
      category = 'safe';
    } else {
      category = 'review'; // utfall mot utfall, blank eller okänt
    }

    if (category === 'safe') {
      safeCount += 1;
      continue;
    }
    if (category === 'review') {
      reviewCount += 1;
      continue;
    }

    // needs_history: utfallssidan är den som är noshow/cancelled.
    needsHistoryCount += 1;
    const outcomeBooking = isAmbiguous(oc) ? canon : leg;
    const outcomeType = isAmbiguous(oc) ? oc : ol;
    const referenceMs = Date.parse(outcomeBooking?.startsAt) || 0;
    const cid = customerIdOf(outcomeBooking);
    const custHistory = cid ? history.get(cid) : null;

    let later;
    if (!cid || !custHistory) {
      later = null;
      unknown += 1;
    } else {
      later = hasLaterBooking(custHistory, bookingId, referenceMs);
      if (later === true) rebooked += 1;
      else if (later === false) lost += 1;
      else unknown += 1;
    }

    if (details > 0 && detailRows.length < details) {
      const row = {
        category: outcomeType === 'noshow' ? 'no_show' : 'cancelled',
        transition,
        rebooked: later === null ? 'unknown' : later ? 'rebooked' : 'lost',
        laterBookings: custHistory
          ? custHistory.filter((h) => h.bookingId !== bookingId && h.startsAtMs > referenceMs)
              .length
          : null,
        referenceDate: outcomeBooking?.startsAt || '',
      };
      if (identifiers) {
        row.clientoCustomerId = cid || '';
        row.customerName = normalizeText(outcomeBooking?.customerName);
        row.customerEmail = normalizeText(outcomeBooking?.customerEmail);
        row.customerPhone = normalizeText(outcomeBooking?.customerPhone);
        row.bookingId = bookingId;
      } else {
        row.customerRef = cid ? shortRef(cid) : '';
        row.bookingRef = shortRef(bookingId);
      }
      detailRows.push(row);
    }
  }

  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    zeroWrites: true,
    identifiersIncluded: Boolean(identifiers),
    summary: {
      crossTenantPairs: totalPairs,
      rawStatusConflictPairs: safeCount + needsHistoryCount + reviewCount,
      safeToPreserveOutcome: safeCount,
      needsHistory: needsHistoryCount,
      manualReview: reviewCount,
      rebooked,
      lost,
      unknown,
    },
    statusTransitions: Object.fromEntries(
      [...statusTransitions.entries()].sort((a, b) => b[1] - a[1])
    ),
    unknownRawStatuses: [...unknownStatuses].sort(),
    details: detailRows,
    detailCount: detailRows.length,
  };
}

function parseArgs(argv) {
  const args = {
    storePath: '',
    details: 0,
    identifiers: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--store') args.storePath = argv[++i] || '';
    else if (a === '--details') args.details = Number(argv[++i]) || 0;
    else if (a === '--identifiers') args.identifiers = true;
    else throw new Error(`Okänt argument: ${a}`);
  }
  if (!args.storePath) throw new Error('--store <explicit path> krävs.');
  if (!fs.existsSync(args.storePath) || !fs.statSync(args.storePath).isFile()) {
    throw new Error(`Store-filen finns inte: ${args.storePath}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const store = await createClientoBookingStore({ filePath: args.storePath });
  const report = buildConflictOutcomeReport({
    canonicalBookings: store.listAllBookings({ tenantId: KANONISK, limit: 0, exactTenant: true }),
    legacyBookings: store.listAllBookings({ tenantId: LEGACY, limit: 0, exactTenant: true }),
    allBookings: store.listAllBookings({ limit: 0 }),
    identifiers: args.identifiers,
    details: args.details,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`FEL: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildConflictOutcomeReport,
  buildCustomerHistory,
  hasLaterBooking,
  outcomeOf,
  statusOf,
};
