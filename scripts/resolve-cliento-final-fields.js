#!/usr/bin/env node
'use strict';

/**
 * Read-only som standard. Slår ihop de sista cross-tenant-paren där rawStatus
 * stämmer (ingen utfallskonflikt) men andra fält skiljer sig — dvs. de 147
 * "andra fält"-paren. Den berikade sidan (hair_tp, legacy) behålls för
 * konflikter; tomma fält fylls från kanoniska sidan. Vid statusfältskonflikt
 * (completed/upcoming) föredras "completed" — besöket ligger i dåtid.
 *
 * Paret med utfallskonflikt (Show↔NoShow) lämnas orört.
 *
 *   node scripts/resolve-cliento-final-fields.js \
 *     --store /var/data/cco/cliento-bookings.json --expected-total 39834
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

function slaIhop(legacyRad, canonRad) {
  const ut = { ...legacyRad };
  for (const f of FALT) {
    if (f === 'rawStatus') continue; // stämmer redan
    if (f === 'status') {
      const ls = text(ut.status);
      const cs = text(canonRad.status);
      if (ls !== cs) ut.status = ls === 'upcoming' ? cs : ls; // föredra icke-upcoming
      continue;
    }
    if (tom(ut[f]) && !tom(canonRad[f])) ut[f] = canonRad[f]; // fyll bara blanka
  }
  for (const k of Object.keys(canonRad)) {
    if (!(k in ut) || tom(ut[k])) ut[k] = ut[k] ?? canonRad[k];
  }
  const ta = Date.parse(legacyRad.updatedAt || '') || 0;
  const tb = Date.parse(canonRad.updatedAt || '') || 0;
  ut.updatedAt = tb > ta ? canonRad.updatedAt : legacyRad.updatedAt;
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
    const rawK = text(k.rad.rawStatus);
    const rawL = text(l.rad.rawStatus);
    if (rawK !== rawL) continue; // utfallskonflikt (t.ex. Show↔NoShow) — lämna
    attSlaIhop.push({ id, k, l });
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
        process.stdout.write(`  ${s.id}\n`);
      }
    }
    process.stdout.write('\nTorrkörning — ingenting skrevs.\n');
    return;
  }

  const backup = `${args.storePath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(args.storePath, backup);

  for (const s of attSlaIhop) {
    const sammanslagen = slaIhop(s.l.rad, s.k.rad); // legacy = bas
    for (const f of FALT) {
      if (f === 'rawStatus') continue;
      if (tom(sammanslagen[f]) && (!tom(s.k.rad[f]) || !tom(s.l.rad[f]))) {
        fs.copyFileSync(backup, args.storePath);
        avbryt(`bookingId ${s.id}: fältet ${f} tömdes. Återställd från ${backup}.`);
      }
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
