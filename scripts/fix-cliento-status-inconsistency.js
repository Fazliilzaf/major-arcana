#!/usr/bin/env node
'use strict';

/**
 * Read-only som standard. Slår ihop cross-tenant-par där rawStatus stämmer
 * ("Booked") men det härledda `status`-fältet skiljer sig ("completed" vs
 * "upcoming"). Besöket ligger i DÅTID (verifierat i data: alla 33 är förflutna),
 * så "upcoming" är en kvarleva från innan besöket ägde rum — rätt värde är
 * "completed". Kopiorna slås ihop och "completed"-sidan behålls.
 *
 * Skriver ALDRIG utan --commit; backup skapas före skrivning.
 *
 *   node scripts/fix-cliento-status-inconsistency.js \
 *     --store /var/data/cco/cliento-bookings.json --expected-total 39586
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

function andraKrockar(a, b) {
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

/** Bas = "completed"-sidan (besöket är förflutet); union-fyll från andra sidan. */
function slaIhop(bas, annan) {
  const ut = { ...bas };
  for (const f of FALT) {
    if (tom(ut[f]) && !tom(annan[f])) ut[f] = annan[f];
  }
  for (const k of Object.keys(annan)) {
    if (!(k in ut) || tom(ut[k])) ut[k] = ut[k] ?? annan[k];
  }
  const ta = Date.parse(bas.updatedAt || '') || 0;
  const tb = Date.parse(annan.updatedAt || '') || 0;
  ut.updatedAt = tb > ta ? annan.updatedAt : bas.updatedAt;
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

  const attFixa = [];
  for (const [id, k] of kanoniska) {
    const l = legacy.get(id);
    if (!l) continue;
    const rawK = text(k.rad.rawStatus);
    const rawL = text(l.rad.rawStatus);
    if (!rawK || rawK !== rawL) continue; // rawStatus måste stämma och vara ifylld
    if (rawK !== 'Booked') continue; // bara det kända importfallet
    const statK = text(k.rad.status);
    const statL = text(l.rad.status);
    if (statK === statL) continue;
    // Rätt värde är "completed" (besöket ligger i dåtid); den andra sidan är "upcoming".
    if (statK !== 'completed' && statL !== 'completed') continue;
    if (statK !== 'upcoming' && statL !== 'upcoming') continue;
    if (andraKrockar(k.rad, l.rad).length) continue; // andra konflikter — hoppa
    const bas = statK === 'completed' ? k : l;
    const annan = bas === k ? l : k;
    attFixa.push({ id, k, l, bas, annan });
  }

  const rapport = {
    torrkorning: !args.commit,
    raderFore: totalt,
    fixas: attFixa.length,
    raderEfterBerakning: totalt - attFixa.length,
  };

  if (!args.commit) {
    process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
    if (args.sample && attFixa.length) {
      process.stdout.write(
        `\n--- ${Math.min(args.sample, attFixa.length)} av ${attFixa.length} par ---\n`
      );
      for (const s of attFixa.slice(0, args.sample)) {
        process.stdout.write(
          `  ${s.id}: behåller completed (kasserar ${text(s.annan.rad.status)})\n`
        );
      }
    }
    process.stdout.write('\nTorrkörning — ingenting skrevs.\n');
    return;
  }

  const backup = `${args.storePath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(args.storePath, backup);

  for (const s of attFixa) {
    const sammanslagen = slaIhop(s.bas.rad, s.annan.rad);
    for (const f of FALT) {
      if (tom(sammanslagen[f]) && (!tom(s.k.rad[f]) || !tom(s.l.rad[f]))) {
        fs.copyFileSync(backup, args.storePath);
        avbryt(`bookingId ${s.id}: fältet ${f} tömdes. Återställd från ${backup}.`);
      }
    }
    if (sammanslagen.status !== 'completed') {
      fs.copyFileSync(backup, args.storePath);
      avbryt(`bookingId ${s.id}: statusen blev ${sammanslagen.status}, förväntade completed.`);
    }
    hinkar[s.bas.hink][s.bas.index] = sammanslagen;
    hinkar[s.annan.hink][s.annan.index] = null;
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
