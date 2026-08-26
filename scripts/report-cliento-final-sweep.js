#!/usr/bin/env node
'use strict';

/**
 * Read-only. Slutrapportering av det som återstår i cross-tenant-städningen.
 * Producerar tre filer i `data/`:
 *   1. enskilda-booked-upcoming.csv — förflutna bokningar med rawStatus
 *      "Booked" men status "upcoming" (importbugg), som INTE är dubbletter.
 *   2. 50-noshow-avbokad.csv — no-show/avbokad-paren med ombokad/försvunnen.
 *   3. 312-krockar-sorterade.txt — paren med fältkrockar, sorterade så att
 *      datumkrockar kommer först.
 *
 *   node scripts/report-cliento-final-sweep.js \
 *     --store /var/data/cco/cliento-bookings.json
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
const NU = Date.parse('2026-08-26T00:00:00.000Z');

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
const csv = (v) => {
  const s = text(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

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

function fieldKrockar(a, b) {
  const ut = [];
  for (const f of FALT) {
    const x = a[f];
    const y = b[f];
    if (String(x ?? '') === String(y ?? '')) continue;
    if (tom(x) || tom(y)) continue;
    ut.push(f);
  }
  return ut;
}

function kort(v) {
  const s = text(v);
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
}

/** Lägre = allvarligare. Datumkrock är värst (tyder på ombokning). */
function allvarlighet(konfliktfalt) {
  const s = new Set(konfliktfalt);
  if (s.has('startsAt') || s.has('endsAt')) return 0;
  if (s.has('staffName')) return 1;
  if (
    s.has('bookingNotes') ||
    s.has('notes') ||
    s.has('customerMessage') ||
    s.has('treatmentNotes')
  )
    return 2;
  if (s.has('serviceId') || s.has('serviceLabel')) return 3;
  if (s.has('priceSek')) return 4;
  return 5;
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
  const all = store.listAllBookings({ limit: 0 });
  const canon = groupBy(store.listAllBookings({ tenantId: KANONISK, limit: 0, exactTenant: true }));
  const leg = groupBy(store.listAllBookings({ tenantId: LEGACY, limit: 0, exactTenant: true }));
  const history = buildCustomerHistory(all);

  // Tenant-tillhörighet per bookingId (för att skilja dubblett från enskild).
  const tenantOf = new Map();
  for (const b of all) {
    const id = bookingIdOf(b);
    if (!id) continue;
    if (!tenantOf.has(id)) tenantOf.set(id, new Set());
    tenantOf.get(id).add(text(b.tenantId) || 'okänd');
  }

  // ── Uppgift 1: enskilda förflutna "Booked → upcoming" ──
  const enskilda = [];
  const sedd = new Set();
  for (const b of all) {
    const id = bookingIdOf(b);
    if (!id) continue;
    if (sedd.has(id)) continue; // dedup — vi vill ha en rad per bookingId
    sedd.add(id);
    if (b.rawStatus !== 'Booked' || b.status !== 'upcoming') continue;
    const t = Date.parse(b.startsAt) || 0;
    if (!t || t >= NU) continue; // bara förflutna
    if ((tenantOf.get(id)?.size || 0) > 1) continue; // dubblett — inte enskild
    enskilda.push({
      bookingId: id,
      namn: text(b.customerName),
      epost: text(b.customerEmail),
      telefon: text(b.customerPhone),
      cid: text(b.clientoCustomerId),
      startsAt: text(b.startsAt),
    });
  }
  enskilda.sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
  const f1 = 'data/enskilda-booked-upcoming.csv';
  let out = '\uFEFFbookingId;namn;epost;telefon;clientoCustomerId;startsAt\n';
  for (const r of enskilda) {
    out +=
      [
        csv(r.bookingId),
        csv(r.namn),
        csv(r.epost),
        csv(r.telefon),
        csv(r.cid),
        csv(r.startsAt),
      ].join(';') + '\n';
  }
  fs.writeFileSync(f1, out, 'utf8');

  // ── Uppgift 2 + 3: paren med konflikt ──
  const noShow = [];
  const krockPar = [];
  for (const bookingId of new Set([...canon.keys(), ...leg.keys()])) {
    const ce = canon.get(bookingId) || [];
    const le = leg.get(bookingId) || [];
    if (ce.length !== 1 || le.length !== 1) continue;
    const c = ce[0];
    const l = le[0];

    const rawC = text(c.rawStatus);
    const rawL = text(l.rawStatus);
    const statC = text(c.status);
    const statL = text(l.status);
    const oc = outcomeOf(statusOf(c));
    const ol = outcomeOf(statusOf(l));
    const amb = (o) => o === 'noshow' || o === 'cancelled';
    const bok = (o) => o === 'booked';
    const fk = fieldKrockar(c, l);

    if ((amb(oc) && bok(ol)) || (amb(ol) && bok(oc))) {
      // no-show / avbokad
      const side = amb(oc) ? c : l;
      const refMs = Date.parse(side?.startsAt) || 0;
      const cid = text(side?.clientoCustomerId) || text(side?.customerId);
      const h = cid ? history.get(cid) : null;
      const later = h ? hasLaterBooking(h, bookingId, refMs) : null;
      noShow.push({
        kategori: oc === 'noshow' || ol === 'noshow' ? 'no_show' : 'avbokad',
        ombokad: later === null ? 'okand' : later ? 'ombokad' : 'forsvunnen',
        bookingId,
        namn: text(c.customerName) || text(l.customerName),
        epost: text(c.customerEmail) || text(l.customerEmail),
        telefon: text(c.customerPhone) || text(l.customerPhone),
        cid,
        startsAt: text(side?.startsAt),
        kanonRaw: rawC,
        legacyRaw: rawL,
      });
    } else if (fk.length) {
      // fältkrock (omlagd eller andra fält)
      const alla = [];
      if (statC !== statL) alla.push('status');
      if (rawC !== rawL) alla.push('rawStatus');
      alla.push(...fk);
      krockPar.push({ bookingId, c, l, konfliktfalt: alla });
    }
  }

  noShow.sort((a, b) => {
    const o = { ombokad: 0, forsvunnen: 1, okand: 2 };
    return (o[a.ombokad] ?? 3) - (o[b.ombokad] ?? 3) || a.bookingId.localeCompare(b.bookingId);
  });
  const f2 = 'data/50-noshow-avbokad.csv';
  out =
    '\uFEFFkategori;ombokad;bookingId;namn;epost;telefon;clientoCustomerId;startsAt;kanonRawStatus;legacyRawStatus\n';
  for (const r of noShow) {
    out +=
      [
        csv(r.kategori),
        csv(r.ombokad),
        csv(r.bookingId),
        csv(r.namn),
        csv(r.epost),
        csv(r.telefon),
        csv(r.cid),
        csv(r.startsAt),
        csv(r.kanonRaw),
        csv(r.legacyRaw),
      ].join(';') + '\n';
  }
  fs.writeFileSync(f2, out, 'utf8');

  krockPar.sort((a, b) => {
    const d = allvarlighet(a.konfliktfalt) - allvarlighet(b.konfliktfalt);
    if (d !== 0) return d;
    return a.bookingId.localeCompare(b.bookingId);
  });
  const f3 = 'data/312-krockar-sorterade.txt';
  let txt = '';
  for (const { bookingId, c, l, konfliktfalt } of krockPar) {
    const kund = [
      text(c.customerName) || text(l.customerName),
      text(c.customerEmail) || text(l.customerEmail),
      text(c.customerPhone) || text(l.customerPhone),
    ]
      .filter(Boolean)
      .join(' · ');
    txt += `\n${bookingId} — ${kund || '(kund saknas)'} [${konfliktfalt.join(', ')}]\n`;
    for (const f of konfliktfalt) {
      txt += `    ${f}: ${kort(c[f]) || '(tom)'} → ${kort(l[f]) || '(tom)'}\n`;
    }
  }
  fs.writeFileSync(f3, txt, 'utf8');

  process.stderr.write(
    `enskilda Booked→upcoming (förflutna): ${enskilda.length}\n` +
      `no-show/avbokad: ${noShow.length}\n` +
      `fältkrock-par: ${krockPar.length}\n`
  );
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(`FEL: ${e?.message || e}\n`);
    process.exitCode = 1;
  });
}
