#!/usr/bin/env node
'use strict';

/**
 * Read-only. Visar, för varje "omlagd med krock"-par (165 st), exakt vilka
 * fält som skiljer sig och värdena sida vid sida — kanonisk → legacy.
 * Långa noter kortas till 90 tecken. Ingen skrivning.
 *
 *   node scripts/report-cliento-rebook-diffs.js \
 *     --store /var/data/cco/cliento-bookings.json > ombokningar-diff.txt
 */

const fs = require('node:fs');
const path = require('node:path');

const { statusOf, outcomeOf } = require(path.join(__dirname, 'report-cliento-conflict-outcome.js'));
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

function kort(v) {
  const s = text(v);
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
}

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

function diffar(canon, leg) {
  const ut = [];
  // status och rawStatus först
  if (text(canon.status) !== text(leg.status)) {
    ut.push(`status: ${kort(canon.status) || '(blank)'} → ${kort(leg.status) || '(blank)'}`);
  }
  if (text(canon.rawStatus) !== text(leg.rawStatus)) {
    ut.push(
      `rawStatus: ${kort(canon.rawStatus) || '(blank)'} → ${kort(leg.rawStatus) || '(blank)'}`
    );
  }
  for (const f of FALT) {
    const a = canon[f];
    const b = leg[f];
    if (String(a ?? '') === String(b ?? '')) continue;
    if (tom(a) && tom(b)) continue;
    ut.push(`${f}: ${kort(a) || '(tom)'} → ${kort(b) || '(tom)'}`);
  }
  return ut;
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
  const canon = groupBy(store.listAllBookings({ tenantId: KANONISK, limit: 0, exactTenant: true }));
  const leg = groupBy(store.listAllBookings({ tenantId: LEGACY, limit: 0, exactTenant: true }));

  let count = 0;
  for (const bookingId of new Set([...canon.keys(), ...leg.keys()])) {
    const ce = canon.get(bookingId) || [];
    const le = leg.get(bookingId) || [];
    if (ce.length !== 1 || le.length !== 1) continue;
    const c = ce[0];
    const l = le[0];

    const oc = outcomeOf(statusOf(c));
    const ol = outcomeOf(statusOf(l));
    const out = (o) => o === 'show' || o === 'done';
    const bok = (o) => o === 'booked';
    const isOmlagd = (out(oc) && bok(ol)) || (out(ol) && bok(oc));
    if (!isOmlagd) continue;

    const d = diffar(c, l);
    if (!d.length) continue;
    count += 1;
    const kund = [
      text(c.customerName) || text(l.customerName),
      text(c.customerEmail) || text(l.customerEmail),
      text(c.customerPhone) || text(l.customerPhone),
    ]
      .filter(Boolean)
      .join(' · ');
    process.stdout.write(`\n${bookingId} — ${kund || '(kund saknas)'}\n`);
    for (const rad of d) process.stdout.write(`    ${rad}\n`);
  }
  process.stderr.write(`omlagda par: ${count}\n`);
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(`FEL: ${e?.message || e}\n`);
    process.exitCode = 1;
  });
}
