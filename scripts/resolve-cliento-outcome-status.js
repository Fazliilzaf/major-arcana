#!/usr/bin/env node
'use strict';

/**
 * Read-only som standard. Slår ihop cross-tenant-dubbletter där den ENDA
 * konflikten är besöksutfallet: ena sidan säger "Booked"/"upcoming" (rå CSV),
 * andra sidan säger "Show"/"Done"/"completed" (berikad). Utfallet vinner.
 *
 * Skillnad mot `merge-cliento-tenant-duplicates.js`: det skriptet slår bara
 * ihop par där varje skillnad är "den ena är tom". Det här skriptet löser även
 * statuskonflikten i de par där ALLA andra fält redan stämmer — dvs. samma
 * bokning, samma tid/personal/noter, bara att ena kopian inte uppdaterats till
 * besöksutfallet.
 *
 * Par med ytterligare konflikter (tid, personal, noter) lämnas ORÖRDA — de
 * behöver ett separat beslut, inte en bulkregel.
 *
 * Användning:
 *   node scripts/resolve-cliento-outcome-status.js \
 *     --store /var/data/cco/cliento-bookings.json \
 *     --expected-total 39735
 *   (lägg till --commit för att skriva; backup skrivs alltid före)
 */

const fs = require('node:fs');

const KANONISK = 'hair-tp-clinic';
const LEGACY = 'hair_tp';

const FALT = [
  'startsAt',
  'endsAt',
  'serviceLabel',
  'serviceId',
  'staffName',
  'locationName',
  'status',
  'rawStatus',
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

function avbryt(meddelande) {
  process.stderr.write(`AVBRUTET: ${meddelande}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    storePath: '',
    canonicalTenant: KANONISK,
    legacyTenant: LEGACY,
    expectedTotal: NaN,
    sample: 0,
    commit: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--store') args.storePath = argv[++i] || '';
    else if (a === '--canonical-tenant') args.canonicalTenant = argv[++i] || '';
    else if (a === '--legacy-tenant') args.legacyTenant = argv[++i] || '';
    else if (a === '--expected-total') args.expectedTotal = Number(argv[++i]);
    else if (a === '--sample') args.sample = Number(argv[++i]) || 0;
    else if (a === '--commit') args.commit = true;
  }
  if (!args.storePath) avbryt('--store saknas.');
  if (!fs.existsSync(args.storePath)) avbryt(`hittar inte ${args.storePath}`);
  if (!Number.isFinite(args.expectedTotal)) {
    avbryt('--expected-total saknas. Mät först, gissa inte.');
  }
  return args;
}

const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const tom = (v) =>
  v === null || v === undefined || v === '' || (typeof v === 'string' && !v.trim());

/** Clientos faktiska status — rawStatus först, faller tillbaka på status. */
function statusOf(booking) {
  return text(booking?.rawStatus) || text(booking?.status);
}

/** Klassar en status i de fyra läger som avgör beslutskategorin. */
function outcomeOf(status) {
  const s = text(status)
    .toLowerCase()
    .replace(/[\s_]+/g, '');
  if (!s) return 'blank';
  if (['show', 'done', 'completed', 'klar', 'genomford', 'betald', 'kom', 'kommit'].includes(s)) {
    return 'outcome';
  }
  if (['booked', 'upcoming', 'bokad', 'bokat', 'pending'].includes(s)) return 'booked';
  if (['noshow', 'nocom', 'utebliven', 'uteblev'].includes(s)) return 'ambiguous';
  if (['cancelled', 'canceled', 'avbokad', 'avbokat', 'cancel'].includes(s)) return 'ambiguous';
  return 'other';
}

/**
 * @returns {{mergebar: boolean, outcome: object|null, booked: object|null,
 *            krockar: Array<string>}}
 *   mergebar när ena sidan är ett besöksutfall, andra sidan "booked", och inga
 *   andra fält står mot varandra.
 */
function klassificera(canonicalRad, legacyRad) {
  const oc = outcomeOf(statusOf(canonicalRad));
  const ol = outcomeOf(statusOf(legacyRad));
  let outcome = null;
  let booked = null;
  if (oc === 'outcome' && ol === 'booked') {
    outcome = canonicalRad;
    booked = legacyRad;
  } else if (ol === 'outcome' && oc === 'booked') {
    outcome = legacyRad;
    booked = canonicalRad;
  }
  const krockar = [];
  for (const falt of FALT) {
    if (falt === 'status' || falt === 'rawStatus') continue;
    const a = canonicalRad[falt];
    const b = legacyRad[falt];
    if (String(a ?? '') === String(b ?? '')) continue;
    if (tom(a) || tom(b)) continue; // kompletterande, inte motstridigt
    krockar.push(falt);
  }
  return { mergebar: Boolean(outcome && booked) && krockar.length === 0, outcome, booked, krockar };
}

/** Union med utfallet som bas: status/rawStatus behålls från utfallssidan, övriga
 *  tomma fält fylls från den andra sidan. */
function slaIhop(outcome, booked) {
  const ut = { ...outcome };
  for (const falt of FALT) {
    if (falt === 'status' || falt === 'rawStatus') continue;
    if (tom(ut[falt]) && !tom(booked[falt])) ut[falt] = booked[falt];
  }
  for (const nyckel of Object.keys(booked)) {
    if (!(nyckel in ut) || tom(ut[nyckel])) ut[nyckel] = ut[nyckel] ?? booked[nyckel];
  }
  const ta = Date.parse(outcome.updatedAt || '') || 0;
  const tb = Date.parse(booked.updatedAt || '') || 0;
  ut.updatedAt = tb > ta ? booked.updatedAt : outcome.updatedAt;
  const da = Date.parse(outcome.createdAt || '') || Infinity;
  const db = Date.parse(booked.createdAt || '') || Infinity;
  ut.createdAt = da <= db ? outcome.createdAt : booked.createdAt;
  return ut;
}

function main() {
  const args = parseArgs(process.argv);
  const state = JSON.parse(fs.readFileSync(args.storePath, 'utf8'));
  const hinkar = state.bookings || {};

  const prefixK = `${args.canonicalTenant}::`;
  const prefixL = `${args.legacyTenant}::`;

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
    avbryt(`storen har ${totalt} rader, --expected-total sa ${args.expectedTotal}. Mät om.`);
  }

  const attSlaIhop = [];
  const hoppade = [];
  const krockPerFalt = {};

  for (const [id, k] of kanoniska) {
    const l = legacy.get(id);
    if (!l) continue;
    const { mergebar, outcome, booked, krockar } = klassificera(k.rad, l.rad);
    if (mergebar) attSlaIhop.push({ id, k, l, outcome, booked });
    else {
      hoppade.push({ id, k, l, krockar });
      for (const kr of krockar) krockPerFalt[kr] = (krockPerFalt[kr] || 0) + 1;
    }
  }

  const rapport = {
    torrkorning: !args.commit,
    store: args.storePath,
    raderFore: totalt,
    unikaBookingId: allaId.size,
    par: attSlaIhop.length + hoppade.length,
    slasIhop: attSlaIhop.length,
    hoppasOver: hoppade.length,
    raderEfterBerakning: totalt - attSlaIhop.length,
    krockPerFalt,
  };

  if (!args.commit) {
    process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
    if (args.sample && attSlaIhop.length) {
      process.stdout.write(
        `\n--- ${Math.min(args.sample, attSlaIhop.length)} av ${attSlaIhop.length} par som SLÅS IHOP ---\n`
      );
      for (const s of attSlaIhop.slice(0, args.sample)) {
        process.stdout.write(
          `  ${s.id}: ${statusOf(s.booked) || '(blank)'} -> ${statusOf(s.outcome) || '(blank)'}\n`
        );
      }
    }
    process.stdout.write('\nTorrkörning — ingenting skrevs.\n');
    return;
  }

  const backup = `${args.storePath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(args.storePath, backup);

  for (const s of attSlaIhop) {
    const sammanslagen = slaIhop(s.outcome, s.booked);
    // Ingen uppgift får ha försvunnit — utom status/rawStatus som medvetet
    // löses till utfallet.
    for (const falt of FALT) {
      if (falt === 'status' || falt === 'rawStatus') continue;
      if (tom(sammanslagen[falt]) && (!tom(s.k.rad[falt]) || !tom(s.l.rad[falt]))) {
        fs.copyFileSync(backup, args.storePath);
        avbryt(
          `bookingId ${s.id}: fältet ${falt} tömdes av sammanslagningen. ` +
            `Ingenting skrevs, storen återställd från ${backup}.`
        );
      }
    }
    // Utfallet måste ha hamnat rätt — annars rulla tillbaka.
    const sammanslagenStatus = statusOf(sammanslagen);
    const forvantadStatus = statusOf(s.outcome);
    if (sammanslagenStatus !== forvantadStatus) {
      fs.copyFileSync(backup, args.storePath);
      avbryt(
        `bookingId ${s.id}: statusen blev ${sammanslagenStatus}, förväntade ${forvantadStatus}.`
      );
    }
    hinkar[s.k.hink][s.k.index] = sammanslagen;
    hinkar[s.l.hink][s.l.index] = null;
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
    avbryt(
      `antalet unika bookingId ändrades ${allaId.size} → ${idEfter.size}. Återställd från ${backup}.`
    );
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

module.exports = { klassificera, slaIhop, outcomeOf, statusOf };
