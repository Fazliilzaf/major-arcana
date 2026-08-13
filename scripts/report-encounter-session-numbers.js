#!/usr/bin/env node
'use strict';

/**
 * CCO-STATUS.md punkt 1 — encounterMapper.js: sessionNumber räknar fel
 * (30+ möten hittade för minst en patient i stället för ett fåtal).
 *
 * Fas 2 av utredningen. `report-encounter-registry-date-fallback.js`
 * (PR #1364/#1365) testade bara två av `buildEncounterRegistry`s fyra
 * källor (journal_asset, pipedrive_smartdoc — de asset-baserade
 * grenarna) och hittade inget mönster som förklarade "FUE Operation
 * 23/25/26/30" (max sessionNumber i den datan var 6 för
 * transplant_fue). Det här skriptet stänger den luckan: bygger HELA
 * registret med produktionens egen sammansättning av alla fyra källor
 * — journalEntries, bookings (Cliento + CCO-motor + bokningscase +
 * behandlingsmöten), och båda asset-grenarna — och läser av det
 * FAKTISKA `sessionNumber` som koden själv skulle beräkna, i stället
 * för en egen proxy-metrik.
 *
 * Återanvänder produktionens egna, redan existerande funktioner
 * ordagrant, ingen egen parallell sammansättningslogik:
 *   - buildEncounterRegistry (src/ops/ccoAssetNaming/encounterMapper.js)
 *   - loadKunderBookingIndex + getBookingSignals
 *     (src/ops/ccoKunderBookingEnrichment.js) — SAMMA booking-index-
 *     uppbyggnad (Cliento + cco_booking_engine + cco_booking_store +
 *     ccoTreatmentEncounterStore, e-postmatchning) som
 *     src/routes/ccoPatientMaster.js rad ~3390-3413 använder för att
 *     bygga patientInputs.bookings till buildEncounterLinkRepairPlan.
 *
 * Läs-endast. Maskerar alltid patientId. Kör med `{}` som config till
 * loadKunderBookingIndex — den faller då tillbaka till samma
 * ARCANA_STATE_ROOT-baserade sökvägar som den körande servern redan
 * använder (src/config.js), så körning på Render-instansen speglar
 * exakt produktionens egna sökvägar utan att behöva ange dem separat.
 *
 *   node scripts/report-encounter-session-numbers.js \
 *     --patients-store /var/data/cco-patient-master.json \
 *     --journal-store /var/data/cco-journal.json \
 *     --cliento-bookings-store /var/data/cco/cliento-bookings.json \
 *     --tenant hair-tp-clinic --min-sessions 5 --top 30
 *
 * --cliento-bookings-store är obligatorisk och explicit (se
 * parseArgs-kommentaren nedan för varför — loadKunderBookingIndex
 * konsulterar INTE config.js's defaults för just den storen). De tre
 * andra booking-källorna (cco_booking_engine, cco_booking_store,
 * ccoTreatmentEncounterStore) faller korrekt tillbaka till samma
 * ARCANA_STATE_ROOT-baserade sökvägar som den körande servern redan
 * använder (src/config.js) — kräver alltså rätt miljövariabler, dvs.
 * kör via Render SSH i ~/project/src, inte lokalt.
 */

const fs = require('node:fs');
const path = require('node:path');
const { buildEncounterRegistry } = require('../src/ops/ccoAssetNaming/encounterMapper');
const {
  loadKunderBookingIndex,
  getBookingSignals,
} = require('../src/ops/ccoKunderBookingEnrichment');
const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const { createCcoJournalStore } = require('../src/ops/ccoJournalStore');
const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { resolveCanonicalPatientsForAssets } = require('../src/ops/ccoPatientAssetIdentity');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function maskPatientId(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

// listPatients() döljer matchStatus:'merged'-poster (arkiverade
// dubbletter, aldrig raderade — se ccoPatientMasterStore.js's
// mergePatients-kommentar "ARCHIVE (do not delete) secondaries").
// Historiska assets/bokningar/journalposter kan fortfarande referera de
// bortmergade ID:na. Att bara skopa mot listPatients()s aktiva mängd
// visade sig i praktiken utesluta 77 % av alla assets (97 735 av
// 126 642, uppmätt 2026-08-13) — inte en liten kantfall, utan den
// dominerande orsaken till att ett tidigare körning gav
// groupsAboveThreshold: 0. Läser därför rå-filen direkt för att fånga
// ALLA patient-ID:n (aktiva + bortmergade) i tenanten, inte bara de
// listPatients() råkar visa just nu.
function loadFullTenantPatientIdScope(patientsStorePath, tenantId) {
  const raw = JSON.parse(fs.readFileSync(patientsStorePath, 'utf8'));
  const bucket = raw?.tenants?.[tenantId];
  const ids = new Set();
  for (const patient of bucket?.patients || []) {
    const id = normalizeText(patient?.id);
    if (id) ids.add(id);
  }
  return ids;
}

function parseArgs(argv = process.argv) {
  const args = {
    patientsStorePath: '',
    journalStorePath: '',
    patientAssetsStorePath: '',
    tenant: '',
    minSessions: 5,
    top: 30,
    patientLimit: 20000,
    clientoBookingsStorePath: '',
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--patients-store') args.patientsStorePath = argv[++index] || '';
    else if (value === '--journal-store') args.journalStorePath = argv[++index] || '';
    else if (value === '--patient-assets-store') {
      args.patientAssetsStorePath = argv[++index] || '';
    } else if (value === '--cliento-bookings-store') {
      args.clientoBookingsStorePath = argv[++index] || '';
    } else if (value === '--tenant') args.tenant = argv[++index] || '';
    else if (value === '--min-sessions') args.minSessions = Number(argv[++index]);
    else if (value === '--top') args.top = Number(argv[++index]);
    else if (value === '--patient-limit') args.patientLimit = Number(argv[++index]);
    else throw new Error(`Okänt argument: ${value}`);
  }
  if (!args.patientsStorePath) throw new Error('--patients-store <explicit path> krävs.');
  if (!args.journalStorePath) throw new Error('--journal-store <explicit path> krävs.');
  if (!args.patientAssetsStorePath) {
    throw new Error('--patient-assets-store <explicit path> krävs.');
  }
  if (!args.clientoBookingsStorePath) {
    // loadKunderBookingIndex's Cliento-gren konsulterar INTE config.js's
    // defaults (till skillnad från de tre andra booking-storarna) — bara
    // ett explicit inpassat config.clientoBookingStorePath eller två
    // cwd-relativa gissningar som inte matchar /var/data/cco/... i prod.
    // Måste alltså anges explicit, annars blir Cliento-bokningar tyst
    // uteslutna ur registret utan varning.
    throw new Error(
      '--cliento-bookings-store <explicit path> krävs (t.ex. /var/data/cco/cliento-bookings.json) — ' +
        'loadKunderBookingIndex gissar annars fel sökväg och Cliento-bokningar faller tyst bort.'
    );
  }
  if (!args.tenant) throw new Error('--tenant <explicit tenantId> krävs — inget tyst default.');
  if (!Number.isInteger(args.minSessions) || args.minSessions < 1) {
    throw new Error('--min-sessions måste vara ett positivt heltal.');
  }
  if (!Number.isInteger(args.top) || args.top < 1) {
    throw new Error('--top måste vara ett positivt heltal.');
  }
  return args;
}

const SESSION_TYPES = ['transplant_fue', 'transplant_dhi', 'prp_hair', 'prp_skin'];

async function main() {
  const args = parseArgs();

  const patientStore = await createCcoPatientMasterStore({
    filePath: path.resolve(args.patientsStorePath),
  });
  const journalStore = await createCcoJournalStore({
    filePath: path.resolve(args.journalStorePath),
  });
  const assetStore = await createCcoPatientAssetStore({
    filePath: path.resolve(args.patientAssetsStorePath),
  });

  const patientsPage = await patientStore.listPatients({
    tenantId: args.tenant,
    limit: args.patientLimit,
    offset: 0,
  });
  const patients = patientsPage.patients || [];
  // Enda faktiska tenant-gränsen tillgänglig: patientMasterStore är
  // tenant-bucketad, men cco-patient-assets.json har INGEN tenantId-fält
  // alls på asset-nivå (normalizeAsset lagrar den aldrig) — så
  // listItemsForEnrichment(tenantId) är ett no-op-filter oavsett vad som
  // skickas in. Skyddet måste därför ske genom att skära mot den
  // tenant-scopade patient-ID-mängden, både på asset-input och på
  // registrets slutgiltiga per-patient-rader (bookings/journalEntries
  // kan i teorin också innehålla poster för patientId utanför tenanten).
  // Mängden hämtas från RÅ-filen (inte listPatients()) så att
  // bortmergade patienters ID:n räknas med — se
  // loadFullTenantPatientIdScope.
  const patientIdScope = loadFullTenantPatientIdScope(
    path.resolve(args.patientsStorePath),
    args.tenant
  );

  const bookingIndex = await loadKunderBookingIndex(
    { clientoBookingStorePath: path.resolve(args.clientoBookingsStorePath) },
    args.tenant,
    patients
  );

  const journalEntries = [];
  const bookings = [...bookingIndex.encounters];
  for (const patient of patients) {
    const entries = await journalStore.listEntries({
      tenantId: args.tenant,
      patientId: patient.id,
    });
    journalEntries.push(...entries);

    const signals = getBookingSignals(bookingIndex.index, patient.id);
    bookings.push(...(signals.upcomingBookings || []), ...(signals.historyBookings || []));
  }

  // asset.patientId är INTE tillförlitligt en kanonisk patient-master-ID.
  // Mätt i produktion 2026-08-13: 97 735 av 126 642 assets (77 %) matchade
  // varken aktiva eller bortmergade patienter direkt. Grävt vidare: en
  // stor andel assets bär i stället ett alias-ID som kräver samma
  // pnr/namn-baserade identitetsupplösning som resten av kodbasen redan
  // använder (ORD-85, src/ops/ccoPatientAssetIdentity.js — "identitets-
  // projektionens ENDA sanning"). Återanvänder den funktionen ordagrant
  // (resolveCanonicalPatientsForAssets) i stället för att bygga en egen,
  // parallell matchning — exakt samma resonemang som resten av den här
  // utredningen.
  const rawAssets = assetStore.listItemsForEnrichment();
  const resolutions = resolveCanonicalPatientsForAssets({ patients, assets: rawAssets });
  const canonicalByAssetId = new Map();
  for (const resolution of resolutions) {
    if (resolution.canonicalPatientId) {
      canonicalByAssetId.set(resolution.assetId, resolution.canonicalPatientId);
    }
  }
  let assetsResolvedViaAlias = 0;
  const assets = rawAssets
    .map((asset) => {
      const canonical = canonicalByAssetId.get(normalizeText(asset.id));
      if (canonical && canonical !== normalizeText(asset.patientId)) {
        assetsResolvedViaAlias += 1;
        return { ...asset, patientId: canonical };
      }
      return asset;
    })
    .filter((asset) => patientIdScope.has(normalizeText(asset.patientId)));

  const registry = buildEncounterRegistry({ journalEntries, bookings, assets });

  const rows = [];
  for (const [patientId, encMap] of registry) {
    if (!patientIdScope.has(normalizeText(patientId))) continue;
    for (const type of SESSION_TYPES) {
      const typed = [...encMap.values()].filter((enc) => enc.encounterType === type);
      if (!typed.length) continue;
      const maxSession = Math.max(...typed.map((enc) => enc.sessionNumber || 0));
      if (maxSession < args.minSessions) continue;
      const sources = new Set(typed.map((enc) => enc.source));
      rows.push({
        patientId: maskPatientId(patientId),
        encounterType: type,
        entryCount: typed.length,
        maxSessionNumber: maxSession,
        sources: [...sources].sort(),
      });
    }
  }
  rows.sort((a, b) => b.maxSessionNumber - a.maxSessionNumber);

  const report = {
    readOnly: true,
    zeroWrites: true,
    generatedAt: new Date().toISOString(),
    tenant: args.tenant,
    inputCounts: {
      patients: patients.length,
      journalEntries: journalEntries.length,
      bookings: bookings.length,
      assetsRaw: rawAssets.length,
      assetsResolvedViaAlias,
      assetsInScope: assets.length,
      assetsOutOfScope: rawAssets.length - assets.length,
    },
    bookingIndexSources: bookingIndex.sources,
    registryPatientCount: registry.size,
    minSessions: args.minSessions,
    groupsAboveThreshold: rows.length,
    topBySessionNumber: rows.slice(0, args.top),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module || process.argv[1] === '-') {
  main().catch((error) => {
    process.stderr.write(`FEL: ${error?.stack || error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, maskPatientId, SESSION_TYPES, loadFullTenantPatientIdScope };
