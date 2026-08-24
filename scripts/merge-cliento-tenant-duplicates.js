#!/usr/bin/env node
'use strict';

/**
 * Slår ihop cross-tenant-dubbletter i clientoBookingStore på `updatedAt`.
 *
 * ── Varför ett nytt skript ──────────────────────────────────────────────────
 *
 * `dedupe-cliento-cross-tenant-bookings.js` finns redan, men är byggt för ett
 * annat problem: den letar par som är IDENTISKA så när som på identitetsfält.
 * Kört mot prod 2026-08-24 släppte den igenom 244 av 24 842 par, och
 * exkluderade 15 015 på `coreChecksumMismatch`.
 *
 * Mätningen visar varför den siffran är missvisande:
 *
 *   fält            tom i gammal   tom i ny   äkta krock
 *   serviceId             15 599          0            0
 *   isReservation         24 842          0            0
 *   notes                      1         41          197
 *   endsAt                     0          0          172
 *   startsAt                   0          0          139
 *   bookingNotes               1         30          130
 *   status                     0          0          125
 *   staffName                  0          0           66
 *   …
 *   ÄKTA KROCKAR: 863 av 24 842 par (3,5 %)
 *
 * `serviceId` och `isReservation` skiljer sig i nästan alla par — inte för att
 * uppgifterna krockar, utan för att den gamla `hair_tp`-kopian skrevs innan
 * fälten fanns. Den ingår i checksumman, så skriptet läser "olika" där det
 * egentligen står "den ena är tom".
 *
 * De 863 äkta krockarna är bokningar som ändrades i Cliento mellan de två
 * importerna: flyttad tid (startsAt/endsAt), ändrad status, byte av behandlare.
 * Där är den NYARE kopian rätt — den speglar Clientos aktuella tillstånd.
 *
 * Därför: slå ihop på `updatedAt`, inte på likhet.
 *
 * ── Vad det gör ─────────────────────────────────────────────────────────────
 *
 * För varje bookingId som finns i båda tenant-namnrymderna behålls posten med
 * senast `updatedAt`, men fält för fält: ett tomt värde i den nyare skriver
 * aldrig över ett ifyllt i den äldre. Så kompletterande uppgifter bevaras även
 * när den ena raden är rikare.
 *
 * Resultatet skrivs till den kanoniska tenanten. Den andra kopian tas bort.
 *
 * ── Säkerhet ────────────────────────────────────────────────────────────────
 *
 *   • Torrkörning är standard. `--commit` krävs för att skriva.
 *   • Backup skrivs alltid före skrivning, till <store>.bak-<tidsstämpel>.
 *   • `--expected-total` måste matcha antalet rader i storen, annars avbryts
 *     körningen. Kör mot fel fil eller inaktuell mätning ska inte gå.
 *   • Antalet UNIKA bookingId får inte ändras. Ändras det är något fel och
 *     ingenting skrivs.
 *   • `--sample N` skriver ut N exempel på äkta krockar med före/efter, så
 *     besluten går att granska innan de tas.
 *
 * ── Användning ──────────────────────────────────────────────────────────────
 *
 *   node scripts/merge-cliento-tenant-duplicates.js \
 *     --store /var/data/cco/cliento-bookings.json \
 *     --canonical-tenant hair-tp-clinic \
 *     --legacy-tenant hair_tp \
 *     --expected-total 64047 \
 *     --sample 10
 *
 *   …granska utskriften, lägg sedan till --commit.
 */

const fs = require('node:fs');

const FALT_ATT_JAMFORA = [
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

function parseArgs(argv) {
  const args = {
    storePath: '',
    canonicalTenant: 'hair-tp-clinic',
    legacyTenant: 'hair_tp',
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

function avbryt(meddelande) {
  process.stderr.write(`AVBRUTET: ${meddelande}\n`);
  process.exit(1);
}

const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const tom = (v) =>
  v === null || v === undefined || v === '' || (typeof v === 'string' && !v.trim());

function tidsstampel(rad) {
  return Date.parse(rad?.updatedAt || '') || Date.parse(rad?.createdAt || '') || 0;
}

/**
 * Fält för fält, med den nyare som utgångspunkt. Ett tomt värde i den nyare
 * skriver aldrig över ett ifyllt i den äldre — annars tappas uppgifter som
 * bara finns i den ena kopian.
 */
function slaIhop(aldre, nyare) {
  const ut = { ...aldre, ...nyare };
  for (const falt of FALT_ATT_JAMFORA) {
    if (tom(nyare[falt]) && !tom(aldre[falt])) ut[falt] = aldre[falt];
  }
  ut.createdAt = aldre.createdAt || nyare.createdAt;
  ut.updatedAt = nyare.updatedAt || aldre.updatedAt;
  return ut;
}

function main() {
  const args = parseArgs(process.argv);
  const state = JSON.parse(fs.readFileSync(args.storePath, 'utf8'));
  const hinkar = state.bookings || {};

  const prefixK = `${args.canonicalTenant}::`;
  const prefixL = `${args.legacyTenant}::`;

  let totalt = 0;
  const alla = new Set();
  const kanoniska = new Map(); // bookingId → { hink, index, rad }
  const legacy = new Map();

  for (const [hink, lista] of Object.entries(hinkar)) {
    const rader = Array.isArray(lista) ? lista : [];
    totalt += rader.length;
    const mal = hink.startsWith(prefixK) ? kanoniska : hink.startsWith(prefixL) ? legacy : null;
    rader.forEach((rad, index) => {
      const id = text(rad?.bookingId);
      if (!id) return;
      alla.add(id);
      if (mal && !mal.has(id)) mal.set(id, { hink, index, rad });
    });
  }

  if (totalt !== args.expectedTotal) {
    avbryt(
      `storen har ${totalt} rader, --expected-total sa ${args.expectedTotal}. ` +
        'Mät om innan du kör — siffran är där för att fånga fel fil eller inaktuell mätning.'
    );
  }

  const par = [];
  for (const [id, k] of kanoniska) {
    const l = legacy.get(id);
    if (l) par.push({ id, kanonisk: k, legacy: l });
  }

  const krockar = [];
  const rapport = {
    torrkorning: !args.commit,
    store: args.storePath,
    kanoniskTenant: args.canonicalTenant,
    legacyTenant: args.legacyTenant,
    raderFore: totalt,
    unikaBookingIdFore: alla.size,
    par: par.length,
    nyareVinnare: { kanonisk: 0, legacy: 0, lika: 0 },
    faltSomSkiljer: {},
    aktaKrockar: 0,
  };

  for (const p of par) {
    const a = p.kanonisk.rad;
    const b = p.legacy.rad;
    const ta = tidsstampel(a);
    const tb = tidsstampel(b);
    if (ta > tb) rapport.nyareVinnare.kanonisk += 1;
    else if (tb > ta) rapport.nyareVinnare.legacy += 1;
    else rapport.nyareVinnare.lika += 1;

    for (const falt of FALT_ATT_JAMFORA) {
      const va = String(a[falt] ?? '');
      const vb = String(b[falt] ?? '');
      if (va === vb) continue;
      const post = (rapport.faltSomSkiljer[falt] = rapport.faltSomSkiljer[falt] || {
        tomIEna: 0,
        aktaKrock: 0,
      });
      if (!va || !vb) post.tomIEna += 1;
      else {
        post.aktaKrock += 1;
        rapport.aktaKrockar += 1;
        if (krockar.length < args.sample) {
          const [aldre, nyare] = ta >= tb ? [b, a] : [a, b];
          krockar.push({
            bookingId: p.id,
            falt,
            aldre: aldre[falt],
            nyare: nyare[falt],
            behalls: nyare[falt],
          });
        }
      }
    }
  }

  if (!args.commit) {
    process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
    if (krockar.length) {
      process.stdout.write('\n--- exempel på äkta krockar (nyare behålls) ---\n');
      for (const k of krockar) {
        process.stdout.write(
          `  ${k.bookingId}  ${k.falt}\n` +
            `      äldre: ${JSON.stringify(k.aldre)}\n` +
            `      nyare: ${JSON.stringify(k.nyare)}   ← behålls\n`
        );
      }
    }
    process.stdout.write(
      '\nTorrkörning — ingenting skrevs. Lägg till --commit när diffen ser rätt ut.\n'
    );
    return;
  }

  const backup = `${args.storePath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(args.storePath, backup);

  let bortagna = 0;
  for (const p of par) {
    const a = p.kanonisk.rad;
    const b = p.legacy.rad;
    const [aldre, nyare] = tidsstampel(a) >= tidsstampel(b) ? [b, a] : [a, b];
    hinkar[p.kanonisk.hink][p.kanonisk.index] = slaIhop(aldre, nyare);
    hinkar[p.legacy.hink][p.legacy.index] = null;
    bortagna += 1;
  }
  for (const hink of Object.keys(hinkar)) {
    const kvar = (hinkar[hink] || []).filter(Boolean);
    if (kvar.length) hinkar[hink] = kvar;
    else delete hinkar[hink];
  }

  let efter = 0;
  const allaEfter = new Set();
  for (const lista of Object.values(hinkar)) {
    for (const rad of lista || []) {
      efter += 1;
      const id = text(rad?.bookingId);
      if (id) allaEfter.add(id);
    }
  }

  if (allaEfter.size !== alla.size) {
    fs.copyFileSync(backup, args.storePath);
    avbryt(
      `antalet unika bookingId ändrades ${alla.size} → ${allaEfter.size}. ` +
        `Ingenting skrevs, storen återställd från ${backup}.`
    );
  }

  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(args.storePath, JSON.stringify(state, null, 2), 'utf8');

  rapport.torrkorning = false;
  rapport.backup = backup;
  rapport.raderEfter = efter;
  rapport.borttagnaDubbletter = bortagna;
  rapport.unikaBookingIdEfter = allaEfter.size;
  process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
}

main();
