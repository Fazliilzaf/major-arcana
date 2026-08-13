#!/usr/bin/env node
'use strict';

/**
 * CCO-STATUS.md punkt 1 — encounterMapper.js/backfill: sessionNumber
 * räknar fel (30+ möten hittade för minst en patient i stället för ett
 * fåtal, "FUE Operation 23/25/26/30").
 *
 * KORRIGERAD RIKTNING 2026-08-13: `buildEncounterRegistry`
 * (encounterMapper.js, utredd i #1364-#1368) används bara av
 * encounter-länk-reparationsverktyget — INGEN live-route beräknar
 * patientkortets faktiska `sessionNumber` därifrån. Den riktiga
 * mekanismen är `countTreatmentSession()`
 * (src/ops/ccoAssetNaming/encounterNameResolver.js), anropad från
 * `scripts/backfill-asset-display-names.js` — exakt det skript
 * originalbuggen upptäcktes i (CCO-STATUS.md: "Upptäckt via
 * backfill-dry-run... 2026-08-07").
 *
 * Hypotes som testas: `backfill-asset-display-names.js`s
 * `groupByPatientId()` grupperar syskon-assets på RÅ `asset.patientId`
 * utan alias-upplösning — samma brist #1368 fixade i diagnostikverktyget
 * (91 222 av 126 642 assets bar ett alias-ID, inte en kanonisk
 * patient-master-ID; se PR #1368). Om flera olika riktiga patienters
 * dokument delar samma rå-alias-platshållare, blandas deras dokument
 * ihop i EN syskon-grupp, och sessionNumber räknas upp över flera
 * patienters behandlingar som om det vore en enda persons.
 *
 * Detta skript verifierar hypotesen LÄS-ENDAST: återanvänder
 * `countTreatmentSession` (encounterNameResolver.js) och
 * `resolveCanonicalPatientsForAssets` (ccoPatientAssetIdentity.js,
 * ORD-85) ordagrant — samma exakta funktioner som backfill-skriptet och
 * #1368 redan använder. Skriver ALDRIG till någon store, kallar aldrig
 * `--commit`-vägen i backfill-skriptet, importerar det inte ens.
 * `groupByPatientId` är kopierad verbatim (6 rader, inte exporterad
 * därifrån) för att spegla exakt samma gruppering utan att röra den
 * skrivande filen.
 *
 *   node scripts/report-backfill-sibling-collision.js \
 *     --patient-assets-store /var/data/cco-patient-assets.json \
 *     --patients-store /var/data/cco-patient-master.json \
 *     --tenant hair-tp-clinic --min-session 5 --top 30
 */

const path = require('node:path');
const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const { resolveCanonicalPatientsForAssets } = require('../src/ops/ccoPatientAssetIdentity');
const { countTreatmentSession } = require('../src/ops/ccoAssetNaming/encounterNameResolver');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function maskId(value) {
  const text = normalizeText(value);
  if (!text) return '(tomt)';
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function parseArgs(argv = process.argv) {
  const args = {
    patientAssetsStorePath: '',
    patientsStorePath: '',
    tenant: '',
    minSession: 5,
    top: 30,
    patientLimit: 20000,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--patient-assets-store') args.patientAssetsStorePath = argv[++index] || '';
    else if (value === '--patients-store') args.patientsStorePath = argv[++index] || '';
    else if (value === '--tenant') args.tenant = argv[++index] || '';
    else if (value === '--min-session') args.minSession = Number(argv[++index]);
    else if (value === '--top') args.top = Number(argv[++index]);
    else if (value === '--patient-limit') args.patientLimit = Number(argv[++index]);
    else throw new Error(`Okänt argument: ${value}`);
  }
  if (!args.patientAssetsStorePath) {
    throw new Error('--patient-assets-store <explicit path> krävs.');
  }
  if (!args.patientsStorePath) throw new Error('--patients-store <explicit path> krävs.');
  if (!args.tenant) throw new Error('--tenant <explicit tenantId> krävs — inget tyst default.');
  if (!Number.isInteger(args.minSession) || args.minSession < 1) {
    throw new Error('--min-session måste vara ett positivt heltal.');
  }
  if (!Number.isInteger(args.top) || args.top < 1) {
    throw new Error('--top måste vara ett positivt heltal.');
  }
  return args;
}

// Kopierad verbatim från scripts/backfill-asset-display-names.js
// (groupByPatientId, ej exporterad därifrån) — samma gruppering, utan
// att importera eller röra den skrivande filen.
function groupByPatientId(assets) {
  const map = new Map();
  for (const asset of assets) {
    const pid = normalizeText(asset.patientId);
    if (!pid) continue;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(asset);
  }
  return map;
}

async function main() {
  const args = parseArgs();

  const patientStore = await createCcoPatientMasterStore({
    filePath: path.resolve(args.patientsStorePath),
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

  const allAssets = assetStore.listItemsForEnrichment();
  const resolutions = resolveCanonicalPatientsForAssets({ patients, assets: allAssets });
  const canonicalByAssetId = new Map();
  for (const resolution of resolutions) {
    if (resolution.canonicalPatientId) {
      canonicalByAssetId.set(resolution.assetId, resolution.canonicalPatientId);
    }
  }

  // Exakt samma gruppering som backfill-skriptet gör idag — RÅ
  // asset.patientId, ingen alias-upplösning. Det är precis den här
  // grupperingen som countTreatmentSession() körs mot i produktion.
  const rawGroups = groupByPatientId(allAssets);

  const collisionGroups = [];
  for (const [rawPatientId, siblingAssets] of rawGroups) {
    const canonicalIds = new Set(
      siblingAssets
        .map(
          (asset) =>
            canonicalByAssetId.get(normalizeText(asset.id)) || normalizeText(asset.patientId)
        )
        .filter(Boolean)
    );
    if (canonicalIds.size <= 1) continue; // Ingen kollision — en grupp, en patient.

    // Reproducera EXAKT vad backfill-skriptet skulle beräkna idag för
    // varje asset i den här (kolliderande) syskon-gruppen.
    const bySessionResult = [];
    for (const asset of siblingAssets) {
      const result = countTreatmentSession(asset, siblingAssets);
      if (!result.sessionNumber) continue;
      bySessionResult.push({
        assetId: asset.id,
        canonicalPatientId:
          canonicalByAssetId.get(normalizeText(asset.id)) || normalizeText(asset.patientId),
        treatmentType: result.treatmentType,
        sessionNumber: result.sessionNumber,
      });
    }
    const maxSession = bySessionResult.reduce(
      (max, row) => Math.max(max, row.sessionNumber || 0),
      0
    );
    if (maxSession < args.minSession) continue;

    const byCanonicalPatient = new Map();
    for (const row of bySessionResult) {
      if (!byCanonicalPatient.has(row.canonicalPatientId)) {
        byCanonicalPatient.set(row.canonicalPatientId, { maxSession: 0, count: 0 });
      }
      const entry = byCanonicalPatient.get(row.canonicalPatientId);
      entry.maxSession = Math.max(entry.maxSession, row.sessionNumber);
      entry.count += 1;
    }

    collisionGroups.push({
      rawPatientIdRef: maskId(rawPatientId),
      groupSize: siblingAssets.length,
      distinctCanonicalPatients: canonicalIds.size,
      maxSessionInGroup: maxSession,
      affectedPatients: [...byCanonicalPatient.entries()]
        .map(([canonicalId, entry]) => ({
          patientId: maskId(canonicalId),
          maxSessionNumber: entry.maxSession,
          assetsInGroup: entry.count,
        }))
        .sort((a, b) => b.maxSessionNumber - a.maxSessionNumber),
    });
  }

  collisionGroups.sort((a, b) => b.maxSessionInGroup - a.maxSessionInGroup);

  const report = {
    readOnly: true,
    zeroWrites: true,
    generatedAt: new Date().toISOString(),
    tenant: args.tenant,
    totalAssetsScanned: allAssets.length,
    totalRawPatientIdGroups: rawGroups.size,
    minSession: args.minSession,
    collisionGroupsFound: collisionGroups.length,
    topCollisionGroups: collisionGroups.slice(0, args.top),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module || process.argv[1] === '-') {
  main().catch((error) => {
    process.stderr.write(`FEL: ${error?.stack || error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, maskId, groupByPatientId };
