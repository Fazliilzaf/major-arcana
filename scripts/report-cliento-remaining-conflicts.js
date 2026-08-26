#!/usr/bin/env node
'use strict';

/**
 * Read-only. Listar de cross-tenant-par som ÅTERSTÅR efter att de rena
 * statuskonflikterna lösts — dvs. de som behöver ett mänskligt beslut.
 * Skriver en CSV (semikolonseparerad, med BOM för Excel) med identifierare så
 * kunderna går att slå upp i Cliento.
 *
 *   node scripts/report-cliento-remaining-conflicts.js \
 *     --store /var/data/cco/cliento-bookings.json > kvarvarande.csv
 */

const fs = require('node:fs');
const path = require('node:path');

const { statusOf, outcomeOf, buildCustomerHistory, hasLaterBooking } = require(
  path.join(__dirname, 'report-cliento-conflict-outcome.js')
);
const { createClientoBookingStore } = require(
  path.join(__dirname, '..', 'src', 'ops', 'clientoBookingStore')
);

const KANONISK = 'hair-tp-clinic';
const LEGACY = 'hair_tp';

const FALT = [
  'startsAt',
  'endsAt',
  'serviceLabel',
  'serviceId',
  'staffName',
  'locationName',
  'customerName',
  'customerEmail',
  'customerPhone',
  'clientoCustomerId',
  'patientId',
  'encounterId',
  'priceSek',
  'isReservation',
  'bookingNotes',
  'customerMessage',
  'internalNotes',
  'treatmentNotes',
  'notes',
];

const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const tom = (v) =>
  v === null || v === undefined || v === '' || (typeof v === 'string' && !v.trim());

function bookingIdOf(b) {
  return text(b?.bookingId || b?.id);
}

function groupBy(bookings) {
  const m = new Map();
  for (const b of bookings) {
    const id = bookingIdOf(b);
    if (!id) continue;
    if (!m.has(id)) m.set(id, []);
    m.get(id).push(b);
  }
  return m;
}

/** Fält (utanför status/rawStatus) där båda sidor är ifyllda men olika. */
function fieldKrockar(canon, leg) {
  const ut = [];
  for (const f of FALT) {
    const a = canon[f];
    const b = leg[f];
    if (String(a ?? '') === String(b ?? '')) continue;
    if (tom(a) || tom(b)) continue; // kompletterande — inte en krock
    ut.push(f);
  }
  return ut;
}

function kategori(oc, ol, allaKrockar) {
  const amb = (o) => o === 'noshow' || o === 'cancelled';
  const out = (o) => o === 'show' || o === 'done';
  const bok = (o) => o === 'booked';
  const nonStatus = allaKrockar.filter((f) => f !== 'status' && f !== 'rawStatus');
  if ((amb(oc) && bok(ol)) || (amb(ol) && bok(oc))) {
    return oc === 'noshow' || ol === 'noshow' ? 'no_show' : 'avbokad';
  }
  if ((out(oc) && bok(ol)) || (out(ol) && bok(oc))) {
    return nonStatus.length ? 'omlagd_med_krock' : 'ren_status';
  }
  if (allaKrockar.length) return 'andra_falt';
  return 'ovrigt';
}

function csv(v) {
  const s = text(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildRows({ canonicalBookings, legacyBookings, allBookings }) {
  const history = buildCustomerHistory(allBookings);
  const canon = groupBy(canonicalBookings);
  const leg = groupBy(legacyBookings);

  const rows = [];
  const union = new Set([...canon.keys(), ...leg.keys()]);
  for (const bookingId of union) {
    const ce = canon.get(bookingId) || [];
    const le = leg.get(bookingId) || [];
    if (ce.length !== 1 || le.length !== 1) continue;
    const c = ce[0];
    const l = le[0];

    const rawC = text(c.rawStatus);
    const rawL = text(l.rawStatus);
    const statC = text(c.status);
    const statL = text(l.status);
    const rawDiffers = rawC !== rawL;
    const statusDiffers = statC !== statL;
    const fk = fieldKrockar(c, l);

    const alla = [];
    if (statusDiffers) alla.push('status');
    if (rawDiffers) alla.push('rawStatus');
    alla.push(...fk);

    if (!alla.length) continue; // ingen konflikt kvar — borde inte finnas

    const oc = outcomeOf(statusOf(c));
    const ol = outcomeOf(statusOf(l));

    const amb = (o) => o === 'noshow' || o === 'cancelled';
    let rebooked = '-';
    if (amb(oc) || amb(ol)) {
      const side = amb(oc) ? c : l;
      const refMs = Date.parse(side?.startsAt) || 0;
      const cid = text(side?.clientoCustomerId) || text(side?.customerId);
      const h = cid ? history.get(cid) : null;
      const later = h ? hasLaterBooking(h, bookingId, refMs) : null;
      rebooked = later === null ? 'okand' : later ? 'ombokad' : 'forsvunnen';
    }

    rows.push({
      kategori: kategori(oc, ol, alla),
      ombokad: rebooked,
      bookingId,
      namn: text(c?.customerName) || text(l?.customerName),
      epost: text(c?.customerEmail) || text(l?.customerEmail),
      telefon: text(c?.customerPhone) || text(l?.customerPhone),
      cid: text(c?.clientoCustomerId) || text(l?.clientoCustomerId),
      kanonStatus: statC,
      legacyStatus: statL,
      kanonRawStatus: rawC,
      legacyRawStatus: rawL,
      konfliktfalt: alla.join(';'),
      kanonStart: text(c?.startsAt),
      legacyStart: text(l?.startsAt),
    });
  }

  rows.sort((a, b) => {
    const ord = { no_show: 0, avbokad: 1, omlagd_med_krock: 2, andra_falt: 3, ovrigt: 4 };
    return (
      (ord[a.kategori] ?? 9) - (ord[b.kategori] ?? 9) || a.bookingId.localeCompare(b.bookingId)
    );
  });
  return rows;
}

function parseArgs(argv) {
  const args = { storePath: '' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--store') args.storePath = argv[++i] || '';
    else throw new Error(`Okänt argument: ${argv[i]}`);
  }
  if (!args.storePath) throw new Error('--store <path> krävs.');
  if (!fs.existsSync(args.storePath)) throw new Error(`Hittar inte ${args.storePath}`);
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const store = await createClientoBookingStore({ filePath: args.storePath });
  const rows = buildRows({
    canonicalBookings: store.listAllBookings({ tenantId: KANONISK, limit: 0, exactTenant: true }),
    legacyBookings: store.listAllBookings({ tenantId: LEGACY, limit: 0, exactTenant: true }),
    allBookings: store.listAllBookings({ limit: 0 }),
  });

  const header = [
    'kategori',
    'ombokad',
    'bookingId',
    'namn',
    'epost',
    'telefon',
    'clientoCustomerId',
    'kanonStatus',
    'legacyStatus',
    'kanonRawStatus',
    'legacyRawStatus',
    'konfliktfalt',
    'kanonStartsAt',
    'legacyStartsAt',
  ].join(';');
  process.stdout.write(`\uFEFF${header}\n`);
  for (const r of rows) {
    process.stdout.write(
      [
        csv(r.kategori),
        csv(r.ombokad),
        csv(r.bookingId),
        csv(r.namn),
        csv(r.epost),
        csv(r.telefon),
        csv(r.cid),
        csv(r.kanonStatus),
        csv(r.legacyStatus),
        csv(r.kanonRawStatus),
        csv(r.legacyRawStatus),
        csv(r.konfliktfalt),
        csv(r.kanonStart),
        csv(r.legacyStart),
      ].join(';') + '\n'
    );
  }
  process.stderr.write(`rader: ${rows.length}\n`);
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(`FEL: ${e?.message || e}\n`);
    process.exitCode = 1;
  });
}

module.exports = { buildRows, kategori };
