#!/usr/bin/env node
'use strict';

/**
 * ORD-192 — kör Cliento-importen. Torrkörning som standard.
 *
 * Skriptet finns för att importen ska gå att köra av någon annan än den som
 * skrev den, och för att den ska kunna köras OM — den ska köras igen på
 * cutover-morgonen, för allt som bokats i Cliento sedan förra gången.
 *
 *   node scripts/import-cliento-framtida.js
 *     Torrkörning mot hela materialet. Skriver ingenting. Rapporterar vad som
 *     skulle hända, inklusive varje post som hoppas över och varför.
 *
 *   node scripts/import-cliento-framtida.js --resurs=sabina
 *     Bara en behandlares tider. Så här gör man en cutover per person i stället
 *     för allt på en gång — det är PERSONEN som krockar, inte tjänsten.
 *
 *   node scripts/import-cliento-framtida.js --commit
 *     Skriver. Kräver flaggan uttryckligen.
 *
 * VARFÖR TORRKÖRNING ÄR STANDARD. En import som skriver av misstag lämnar
 * hundratals block utspridda i kalendern, och att städa dem för hand är
 * timmar. Att köra en torrkörning för mycket kostar tio sekunder.
 *
 * INGET GÅR TILL KUND. Importen skriver kalenderblock, aldrig bokningar, och
 * ett block kan strukturellt inte trigga bekräftelser eller påminnelser. Utöver
 * det står ORD-184:s utskicksspärr avstängd. Dubbelt skydd.
 */

const fs = require('node:fs');
const path = require('node:path');

const { importeraFramtidaClientoTider } = require('../src/ops/clientoFramtidaImport');
const { createCcoBookingEngineStore } = require('../src/ops/ccoBookingEngineStore');
const config = require('../src/config');

function parseArgs(argv) {
  const args = { commit: false, resurs: '', clientoPath: '', enginePath: '', limit: 0 };
  for (const raw of argv.slice(2)) {
    if (raw === '--commit') args.commit = true;
    else if (raw.startsWith('--resurs=')) args.resurs = raw.slice('--resurs='.length).trim();
    else if (raw.startsWith('--cliento=')) args.clientoPath = raw.slice('--cliento='.length);
    else if (raw.startsWith('--engine=')) args.enginePath = raw.slice('--engine='.length);
    else if (raw.startsWith('--limit=')) args.limit = Number(raw.slice('--limit='.length)) || 0;
    else {
      console.error(`Okänd flagga: ${raw}`);
      process.exit(2);
    }
  }
  return args;
}

function lasClientoBokningar(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const ut = [];
  // Storen är ett objekt med kund-id som nyckel och en array av bokningar per
  // kund — inte en platt lista. Uppmätt: 19 140 nycklar, 39 686 bokningar.
  const bokningar = raw?.bookings;
  if (Array.isArray(bokningar)) return bokningar;
  for (const nyckel of Object.keys(bokningar || {})) {
    for (const b of bokningar[nyckel] || []) ut.push(b);
  }
  return ut;
}

async function main() {
  const args = parseArgs(process.argv);

  const clientoPath =
    args.clientoPath || config.clientoBookingStorePath || '/var/data/cco/cliento-bookings.json';
  const enginePath =
    args.enginePath || config.ccoBookingEngineStorePath || '/var/data/cco-booking-engine.json';

  if (!fs.existsSync(clientoPath)) {
    console.error(`Cliento-filen finns inte: ${clientoPath}`);
    process.exit(1);
  }

  const mappning = require(path.join('..', 'config', 'cliento-kalendermappning.json'));
  const alla = lasClientoBokningar(clientoPath);

  const store = args.commit ? await createCcoBookingEngineStore({ filePath: enginePath }) : null;

  const res = await importeraFramtidaClientoTider({
    bokningar: alla,
    mappning,
    bookingEngineStore: store,
    commit: args.commit,
  });

  // Filtrering på resurs görs EFTER byggandet, inte före: rapporten ska visa
  // hela bilden även när man bara skriver en behandlares tider. Annars ser en
  // person-cutover ut som om resten inte fanns.
  const valda = args.resurs
    ? res.block.filter((b) => b.resourceIds.includes(args.resurs))
    : res.block;

  if (args.commit && args.resurs) {
    // Har vi filtrerat måste vi skriva om — importen skrev allt.
    console.error(
      'Kombinationen --commit och --resurs stöds inte i ett steg: importen skulle ha ' +
        'skrivit alla block. Kör med --resurs först för att se vad som gäller den ' +
        'behandlaren, och kör sedan --commit när ni är redo att ta allt.'
    );
    process.exit(2);
  }

  console.log(args.commit ? '=== SKARP KÖRNING ===' : '=== TORRKÖRNING (inget skrivet) ===');
  console.log(`Cliento-fil : ${clientoPath}`);
  console.log(`Motorfil    : ${enginePath}`);
  console.log(`Poster in   : ${alla.length}`);
  console.log(`Block       : ${res.skapade}`);
  console.log(`Hoppade     : ${res.hoppade}`);
  console.log('');

  console.log('Skäl att hoppa över:');
  for (const [skal, antal] of Object.entries(res.skalRakning).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(antal).padStart(6)}  ${skal}`);
  }
  console.log('');

  const perResurs = new Map();
  for (const b of res.block) {
    const nyckel = b.resourceIds.length ? b.resourceIds.join(',') : '(hela kliniken)';
    perResurs.set(nyckel, (perResurs.get(nyckel) || 0) + 1);
  }
  console.log('Block per resurs:');
  for (const [nyckel, antal] of [...perResurs].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(antal).padStart(6)}  ${nyckel}`);
  }
  console.log('');

  const omappade = res.hoppadeposter.filter((x) => x.skal.startsWith('omappad'));
  if (omappade.length) {
    console.log(`MÅSTE LÄGGAS IN FÖR HAND — ${omappade.length} poster på tjänstekalendrar:`);
    for (const x of omappade.slice(0, args.limit || 50)) {
      console.log(`  ${x.startsAt.slice(0, 16)}  ${x.kalender.padEnd(22)}  ${x.kund}`);
    }
    if (omappade.length > (args.limit || 50)) {
      console.log(`  ... och ${omappade.length - (args.limit || 50)} till`);
    }
    console.log('');
    console.log(
      'De ligger på "Fysisk konsultation" / "Online konsultation" — tjänstekalendrar, ' +
        'inte personer. Att blockera hela kliniken för ett trettiominuters samtal vore ' +
        'fel, och att gissa en person vore värre.'
    );
    console.log('');
  }

  if (args.resurs) {
    console.log(`Filtrerat på resurs "${args.resurs}": ${valda.length} block`);
    for (const b of valda.slice(0, args.limit || 30)) {
      console.log(`  ${b.dateFrom}  ${b.startTime}–${b.endTime}  ${b.label}`);
    }
    console.log('');
  }

  if (!args.commit) {
    console.log('Ingenting skrevs. Lägg till --commit när ni bestämt datum.');
  }
}

main().catch((err) => {
  console.error('Importen misslyckades:', err?.message || err);
  process.exit(1);
});
