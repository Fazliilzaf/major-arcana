#!/usr/bin/env node
'use strict';

/**
 * Read-only som standard. Slår ihop de återstående cross-tenant-paren där ena
 * sidan är "Booked"/"upcoming" (rå CSV) och andra sidan är ett besöksutfall
 * (Show/Done/NoShow/Cancelled). Utfallet vinner — för status OCH för övriga
 * fält (utfallssidan är den berikade, post-besök-truth).
 *
 * Detta täcker de 50 no-show/avbokad (Cliento-verifierade) och de 165
 * ombokningarna. Par utan statuskonflikt (147) och det enda Show↔NoShow-paret
 * lämnas orörda.
 *
 *   node scripts/resolve-cliento-final-outcomes.js \
 *     --store /var/data/cco/cliento-bookings.json --expected-total 39568
 */

const fs = require('node:fs');

const KANONISK = 'hair-tp-clinic';
const LEGACY = 'hair_tp';

function statusOf(booking) {
  return (
    (typeof booking?.rawStatus === 'string' ? booking.rawStatus.trim() : '') ||
    (typeof booking?.status === 'string' ? booking.status.trim() : '')
  );
}

function outcomeOf(status) {
  const s = String(status || '')
    .toLowerCase()
    .replace(/[\s_]+/g, '');
  if (!s) return 'blank';
  if (['show', 'done', 'completed', 'klar', 'genomford', 'betald', 'kom', 'kommit'].includes(s))
    return 'done';
  if (['noshow', 'nocom', 'utebliven', 'uteblev'].includes(s)) return 'noshow';
  if (['cancelled', 'canceled', 'avbokad', 'avbokat', 'cancel'].includes(s)) return 'cancelled';
  if (['booked', 'upcoming', 'bokad', 'bokat', 'pending'].includes(s)) return 'booked';
  return 'other';
}

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

function avbryt(msg) {
  process.stderr.write(`AVBRUTET: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { storePath: '', expectedTotal: NaN, commit: false, sample: 0 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--store') args.storePath = argv[++i] || '';
    else if (a === '--expected-total') args.expectedTotal = Number(argv[++i]);
    else if (a === '--commit') args.commit = true;
    else if (a === '--sample') args.sample = Number(argv[++i]) || 0;
  }
  if (!args.storePath) avbryt('--store saknas.');
  if (!fs.existsSync(args.storePath)) avbryt(`hittar inte ${args.storePath}`);
  if (!Number.isFinite(args.expectedTotal)) avbryt('--expected-total saknas.');
  return args;
}

const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const tom = (v) =>
  v === null || v === undefined || v === '' || (typeof v === 'string' && !v.trim());

const utfallet = (o) => ['show', 'done', 'noshow', 'cancelled'].includes(o);
const bokat = (o) => o === 'booked';

function slaIhop(outcome, booked) {
  const ut = { ...outcome }; // utfallssidan vinner för konflikter
  for (const f of FALT) {
    if (tom(ut[f]) && !tom(booked[f])) ut[f] = booked[f]; // union-fyll bara blanka
  }
  for (const k of Object.keys(booked)) {
    if (!(k in ut) || tom(ut[k])) ut[k] = ut[k] ?? booked[k];
  }
  const ta = Date.parse(outcome.updatedAt || '') || 0;
  const tb = Date.parse(booked.updatedAt || '') || 0;
  ut.updatedAt = tb > ta ? booked.updatedAt : outcome.updatedAt;
  return ut;
}

function main() {
  const args = parseArgs(process.argv);
  const state = JSON.parse(fs.readFileSync(args.storePath, 'utf8'));
  const hinkar = state.bookings || {};

  const prefixK = `${KANONISK}::`;
  const prefixL = `${LEGACY}::`;

  let totalt = 0;
  const allaId = new Set();
  const kanoniska = new Map();
  const legacy = new Map();
  for (const [hink, lista] of Object.entries(hinkar)) {
    const rader = Array.isArray(lista) ? lista : [];
    totalt += rader.length;
    const mal = hink.startsWith(prefixK) ? kanoniska : hink.startsWith(prefixL) ? legacy : null;
    rader.forEach((rad, index) => {
      const id = text(rad?.bookingId);
      if (!id) return;
      allaId.add(id);
      if (mal && !mal.has(id)) mal.set(id, { hink, index, rad });
    });
  }

  if (totalt !== args.expectedTotal) {
    avbryt(`storen har ${totalt} rader, --expected-total sa ${args.expectedTotal}.`);
  }

  const attSlaIhop = [];
  for (const [id, k] of kanoniska) {
    const l = legacy.get(id);
    if (!l) continue;
    const oc = outcomeOf(statusOf(k.rad));
    const ol = outcomeOf(statusOf(l.rad));
    let outcome = null;
    let booked = null;
    if (utfallet(oc) && bokat(ol)) {
      outcome = k;
      booked = l;
    } else if (utfallet(ol) && bokat(oc)) {
      outcome = l;
      booked = k;
    }
    if (!outcome || !booked) continue;
    attSlaIhop.push({ id, outcome, booked });
  }

  const rapport = {
    torrkorning: !args.commit,
    raderFore: totalt,
    slasIhop: attSlaIhop.length,
    raderEfterBerakning: totalt - attSlaIhop.length,
  };

  if (!args.commit) {
    process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
    if (args.sample && attSlaIhop.length) {
      process.stdout.write(
        `\n--- ${Math.min(args.sample, attSlaIhop.length)} av ${attSlaIhop.length} ---\n`
      );
      for (const s of attSlaIhop.slice(0, args.sample)) {
        process.stdout.write(
          `  ${s.id}: ${statusOf(s.booked.rad) || '(blank)'} -> ${statusOf(s.outcome.rad) || '(blank)'}\n`
        );
      }
    }
    process.stdout.write('\nTorrkörning — ingenting skrevs.\n');
    return;
  }

  const backup = `${args.storePath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(args.storePath, backup);

  for (const s of attSlaIhop) {
    const sammanslagen = slaIhop(s.outcome.rad, s.booked.rad);
    if (statusOf(sammanslagen) !== statusOf(s.outcome.rad)) {
      fs.copyFileSync(backup, args.storePath);
      avbryt(`bookingId ${s.id}: utfallet tappades. Återställd från ${backup}.`);
    }
    hinkar[s.outcome.hink][s.outcome.index] = sammanslagen;
    hinkar[s.booked.hink][s.booked.index] = null;
  }

  for (const hink of Object.keys(hinkar)) {
    const kvar = (hinkar[hink] || []).filter(Boolean);
    if (kvar.length) hinkar[hink] = kvar;
    else delete hinkar[hink];
  }

  let efter = 0;
  const idEfter = new Set();
  for (const lista of Object.values(hinkar)) {
    for (const rad of lista || []) {
      efter += 1;
      const id = text(rad?.bookingId);
      if (id) idEfter.add(id);
    }
  }
  if (idEfter.size !== allaId.size) {
    fs.copyFileSync(backup, args.storePath);
    avbryt(`antalet unika bookingId ändrades. Återställd från ${backup}.`);
  }

  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(args.storePath, JSON.stringify(state, null, 2), 'utf8');

  rapport.torrkorning = false;
  rapport.backup = backup;
  rapport.raderEfter = efter;
  process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { slaIhop };
