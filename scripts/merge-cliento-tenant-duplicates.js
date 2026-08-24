#!/usr/bin/env node
'use strict';

/**
 * Slår ihop cross-tenant-dubbletter i clientoBookingStore — men BARA de par
 * där ingen uppgift står mot en annan.
 *
 * ── Bakgrund ────────────────────────────────────────────────────────────────
 *
 * Kliniken har två tenant-namnrymder i storen: `hair_tp` (legacy) och
 * `hair-tp-clinic` (kanonisk). ORD-101 städade bort dubbletterna 2026-08-13.
 * Omimporten 2026-08-24 återskapade 24 842 av dem, eftersom
 * `bookingIdIndex` var tenant-scopat (åtgärdat i `270b9914`).
 *
 * ── Varför regeln blev den här ──────────────────────────────────────────────
 *
 * Första utkastet lät den senast skrivna posten vinna. Torrkörningen mot prod
 * visade att det var fel, och varför:
 *
 *   Den NYARE kopian är rå CSV från Cliento-exporten.
 *   Den ÄLDRE kopian är CCO-berikad.
 *
 * Berikningen är den värdefulla sidan. Mätt på de 24 842 paren:
 *
 *   STATUS — 375 av 449 övergångar går BAKÅT
 *     Show      -> Booked      266     patienten kom, blir "väntar"
 *     cancelled -> completed    37     avbokad blir genomförd
 *     Cancelled -> Booked       37
 *     no_show   -> completed    14     utebliven blir genomförd
 *     NoShow    -> Booked       13
 *     Done      -> Booked        7
 *     NoShow    -> Show          1
 *
 *   ANTECKNINGAR
 *     äldre innehåller nyare   189     CSV saknar CCO-berikningen
 *     nyare innehåller äldre     3
 *     genuint olika            135
 *
 *   TID
 *     nyare senare              42
 *     nyare tidigare            97     ← oväntat, och oförklarat
 *
 * `Show`, `Done`, `NoShow` och `Cancelled` är besöksutfall som registrerats i
 * CCO efter besöket. CSV-exporten känner dem inte — den har bara `Booked`. Att
 * låta nyare vinna hade raderat 375 utfall: vilka som kom, vilka som uteblev,
 * vilka som avbokade.
 *
 * Ett konkret par ur torrkörningen (bookingId 21491363):
 *
 *   rawStatus     äldre "Show"           nyare "Booked"
 *   staffName     äldre "Louise"         nyare "Clara"
 *   endsAt        äldre 2026-06-30 15:00 nyare 2026-06-18 17:00
 *   bookingNotes  äldre "…Ombokade tid 18/6 pga sjukdom / WB"
 *                 nyare "…"              ← anteckningen borta
 *
 * Den äldre raden förklarar precis varför tiden flyttades. Den nyare har
 * tappat förklaringen.
 *
 * ── Vad skriptet därför gör ─────────────────────────────────────────────────
 *
 * Slår bara ihop par där varje skillnad är "den ena är tom". Då finns det
 * ingenting att skriva över, och riktningen spelar ingen roll:
 *
 *   serviceId       15 599 par — tomt i den äldre, noll krockar
 *   isReservation   24 842 par — tomt i den äldre, noll krockar
 *
 * Par med minst en ÄKTA krock (båda sidor ifyllda, olika värden) lämnas
 * orörda. Båda raderna får ligga kvar. Kalendern hanterar dem redan sedan
 * `b9b5538e` genom att välja den senast skrivna vid läsning, så det finns
 * ingen operativ kostnad för att vänta.
 *
 * De paren kräver ett beslut från någon som vet vad `Show -> Booked` betyder
 * för kliniken. Det beslutet ska inte fattas av ett skript.
 *
 * ── Säkerhet ────────────────────────────────────────────────────────────────
 *
 *   • Torrkörning är standard. `--commit` krävs för att skriva.
 *   • Backup skrivs alltid före skrivning, till <store>.bak-<tidsstämpel>.
 *   • `--expected-total` måste matcha radantalet, annars avbryts körningen.
 *   • Antalet unika bookingId får inte ändras. Ändras det återställs storen
 *     från backupen och ingenting skrivs.
 *   • Efter sammanslagning kontrolleras varje fält mot BÅDA källraderna: ett
 *     ifyllt värde får aldrig ha försvunnit. Hittas ett sådant fall rullas
 *     allt tillbaka.
 *
 * ── Användning ──────────────────────────────────────────────────────────────
 *
 *   node scripts/merge-cliento-tenant-duplicates.js \
 *     --store /var/data/cco/cliento-bookings.json \
 *     --expected-total 64047 \
 *     --sample 10
 *
 *   …granska, lägg sedan till --commit.
 */

const fs = require('node:fs');

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

const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const tom = (v) =>
  v === null || v === undefined || v === '' || (typeof v === 'string' && !v.trim());

/**
 * @returns {{sakert: boolean, krockar: Array<{falt, a, b}>}}
 *   `sakert` när varje skillnad är "den ena är tom".
 */
function granska(a, b) {
  const krockar = [];
  for (const falt of FALT) {
    const va = a[falt];
    const vb = b[falt];
    if (String(va ?? '') === String(vb ?? '')) continue;
    if (tom(va) || tom(vb)) continue; // kompletterande, inte motstridigt
    krockar.push({ falt, a: va, b: vb });
  }
  return { sakert: krockar.length === 0, krockar };
}

/** Union av två rader. Anropas bara när granska() sagt att inget krockar. */
function slaIhop(a, b) {
  const ut = { ...a };
  for (const falt of FALT) {
    if (tom(ut[falt]) && !tom(b[falt])) ut[falt] = b[falt];
  }
  for (const nyckel of Object.keys(b)) {
    if (!(nyckel in ut) || tom(ut[nyckel])) ut[nyckel] = ut[nyckel] ?? b[nyckel];
  }
  const ta = Date.parse(a.updatedAt || '') || 0;
  const tb = Date.parse(b.updatedAt || '') || 0;
  ut.updatedAt = tb > ta ? b.updatedAt : a.updatedAt;
  ut.createdAt =
    (Date.parse(a.createdAt || '') || Infinity) <= (Date.parse(b.createdAt || '') || Infinity)
      ? a.createdAt
      : b.createdAt;
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
    avbryt(
      `storen har ${totalt} rader, --expected-total sa ${args.expectedTotal}. ` +
        'Mät om innan du kör.'
    );
  }

  const sakra = [];
  const hoppade = [];
  const krockPerFalt = {};

  for (const [id, k] of kanoniska) {
    const l = legacy.get(id);
    if (!l) continue;
    const { sakert, krockar } = granska(k.rad, l.rad);
    if (sakert) sakra.push({ id, k, l });
    else {
      hoppade.push({ id, k, l, krockar });
      for (const kr of krockar) krockPerFalt[kr.falt] = (krockPerFalt[kr.falt] || 0) + 1;
    }
  }

  const rapport = {
    torrkorning: !args.commit,
    store: args.storePath,
    raderFore: totalt,
    unikaBookingId: allaId.size,
    par: sakra.length + hoppade.length,
    slasIhop: sakra.length,
    hoppasOver: hoppade.length,
    raderEfterBerakning: totalt - sakra.length,
    krockPerFalt,
  };

  if (!args.commit) {
    process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
    if (args.sample && hoppade.length) {
      process.stdout.write(
        `\n--- ${Math.min(args.sample, hoppade.length)} av ${hoppade.length} par som LÄMNAS ORÖRDA ---\n`
      );
      for (const h of hoppade.slice(0, args.sample)) {
        process.stdout.write(`  ${h.id}\n`);
        for (const kr of h.krockar) {
          process.stdout.write(
            `      ${kr.falt}\n` +
              `        kanonisk: ${JSON.stringify(kr.a).slice(0, 90)}\n` +
              `        legacy  : ${JSON.stringify(kr.b).slice(0, 90)}\n`
          );
        }
      }
    }
    process.stdout.write('\nTorrkörning — ingenting skrevs.\n');
    return;
  }

  const backup = `${args.storePath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(args.storePath, backup);

  for (const s of sakra) {
    const sammanslagen = slaIhop(s.k.rad, s.l.rad);
    // Ingen uppgift får ha försvunnit. Hittas ett tomt fält där någon av
    // källraderna hade ett värde är sammanslagningen fel — rulla tillbaka.
    for (const falt of FALT) {
      if (tom(sammanslagen[falt]) && (!tom(s.k.rad[falt]) || !tom(s.l.rad[falt]))) {
        fs.copyFileSync(backup, args.storePath);
        avbryt(
          `bookingId ${s.id}: fältet ${falt} tömdes av sammanslagningen. ` +
            `Ingenting skrevs, storen återställd från ${backup}.`
        );
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
    avbryt(
      `antalet unika bookingId ändrades ${allaId.size} → ${idEfter.size}. ` +
        `Ingenting skrevs, storen återställd från ${backup}.`
    );
  }

  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(args.storePath, JSON.stringify(state, null, 2), 'utf8');

  rapport.torrkorning = false;
  rapport.backup = backup;
  rapport.raderEfter = efter;
  process.stdout.write(`${JSON.stringify(rapport, null, 2)}\n`);
}

main();
