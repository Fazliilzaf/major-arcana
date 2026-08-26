#!/usr/bin/env node
'use strict';

/**
 * Read-only som standard. Rättar enskilda (ej cross-tenant-dubbletter)
 * förflutna bokningar som har rawStatus "Booked" men status "upcoming".
 * En förfluten bokning kan inte vara "upcoming" — den har ägt rum. Rätt värde
 * är "completed" (samma mönster som de 1 525 konsistenta "Booked→completed").
 *
 *   node scripts/fix-cliento-past-upcoming-singles.js \
 *     --store /var/data/cco/cliento-bookings.json --expected-total 39568
 */

const fs = require('node:fs');

const NU = Date.parse('2026-08-26T00:00:00.000Z');

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

function main() {
  const args = parseArgs(process.argv);
  const state = JSON.parse(fs.readFileSync(args.storePath, 'utf8'));
  const hinkar = state.bookings || {};

  let totalt = 0;
  const bookingTenants = new Map();
  const allaRader = [];
  for (const [hink, lista] of Object.entries(hinkar)) {
    const rader = Array.isArray(lista) ? lista : [];
    totalt += rader.length;
    const t = hink.split('::')[0];
    rader.forEach((rad, index) => {
      const id = text(rad?.bookingId);
      if (!id) return;
      if (!bookingTenants.has(id)) bookingTenants.set(id, new Set());
      bookingTenants.get(id).add(t);
      allaRader.push({ hink, index, rad, tenant: t });
    });
  }

  if (totalt !== args.expectedTotal) {
    avbryt(`storen har ${totalt} rader, --expected-total sa ${args.expectedTotal}.`);
  }

  const attFixa = [];
  for (const r of allaRader) {
    const id = text(r.rad?.bookingId);
    if ((bookingTenants.get(id)?.size || 0) > 1) continue; // dubblett — hoppa
    if (r.rad.rawStatus !== 'Booked' || r.rad.status !== 'upcoming') continue;
    const t = Date.parse(r.rad.startsAt) || 0;
    if (!t || t >= NU) continue; // bara förflutna
    attFixa.push(r);
  }

  const rapport = {
    torrkorning: !args.commit,
    raderFore: totalt,
    fixas: attFixa.length,
  };

  if (!args.commit) {
    process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
    if (args.sample && attFixa.length) {
      process.stdout.write(
        `\n--- ${Math.min(args.sample, attFixa.length)} av ${attFixa.length} ---\n`
      );
      for (const r of attFixa.slice(0, args.sample)) {
        process.stdout.write(`  ${r.rad.bookingId}: upcoming -> completed (${r.rad.startsAt})\n`);
      }
    }
    process.stdout.write('\nTorrkörning — ingenting skrevs.\n');
    return;
  }

  const backup = `${args.storePath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(args.storePath, backup);

  for (const r of attFixa) {
    hinkar[r.hink][r.index].status = 'completed';
  }

  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(args.storePath, JSON.stringify(state, null, 2), 'utf8');

  rapport.torrkorning = false;
  rapport.backup = backup;
  process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
}

if (require.main === module) {
  main();
}
