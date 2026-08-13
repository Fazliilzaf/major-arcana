#!/usr/bin/env node
'use strict';

/**
 * CCO-STATUS.md punkt 1 — encounterMapper.js: sessionNumber räknar fel
 * (30+ möten hittade för minst en patient i stället för ett fåtal).
 *
 * Testar hypotesen: `buildEncounterRegistry`s asset-baserade grenar
 * (journal_asset, pipedrive_smartdoc) faller tillbaka till `importedAt`
 * när riktiga datumfält saknas (`assetEncounterDate` i
 * src/ops/ccoAssetNaming/encounterMapper.js). Import-tidpunkter kan
 * skilja sig mellan flera assets som egentligen hör till SAMMA fysiska
 * behandlingstillfälle — varje distinkt datum blir en egen
 * registerpost, vilket fragmenterar ett tillfälle till många.
 *
 * Återanvänder EXAKT samma funktioner som produktionskoden
 * (assetEncounterDate, inferEncounterTypeFromAsset från
 * encounterMapper.js; isPipedriveSmartdocAsset från
 * ccoEncounterLinkRepair.js) — bygger inte en egen, parallell
 * tolkning. Läs-endast. Maskerar alltid patientId i utdata (samma
 * mönster som ccoEncounterLinkRepair.js: behåll bara start/slut).
 *
 *   node scripts/report-encounter-registry-date-fallback.js \
 *     --patient-assets-store /var/data/cco-patient-assets.json \
 *     --min-assets 5 --top 15
 *
 * (--patient-assets-store pekar på monolit-sökvägen — sharddatan ligger i
 * en syskonkatalog `<namn>.shards/`, avledd automatiskt av storen.)
 */

const path = require('node:path');
const {
  assetEncounterDate,
  inferEncounterTypeFromAsset,
} = require('../src/ops/ccoAssetNaming/encounterMapper');
const { isPipedriveSmartdocAsset } = require('../src/ops/ccoEncounterLinkRepair');
const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function maskPatientId(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function parseArgs(argv = process.argv) {
  const args = { patientAssetsStorePath: '', minAssets: 5, top: 15 };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--patient-assets-store') {
      args.patientAssetsStorePath = argv[++index] || '';
    } else if (value === '--min-assets') {
      args.minAssets = Number(argv[++index]);
    } else if (value === '--top') {
      args.top = Number(argv[++index]);
    } else throw new Error(`Okänt argument: ${value}`);
  }
  if (!args.patientAssetsStorePath) {
    throw new Error('--patient-assets-store <explicit path> krävs.');
  }
  if (!Number.isInteger(args.minAssets) || args.minAssets < 1) {
    throw new Error('--min-assets måste vara ett positivt heltal.');
  }
  if (!Number.isInteger(args.top) || args.top < 1) {
    throw new Error('--top måste vara ett positivt heltal.');
  }
  return args;
}

// Speglar buildEncounterRegistry (encounterMapper.js) rad-för-rad: vilka
// asset-baserade grenar bidrar till registret, vilket datum de faktiskt
// använder, och vilken encounterType de kokar ner till.
function classifyAsset(asset) {
  const category = normalizeText(asset.category);
  if (['journal', 'cco_journal_sign'].includes(category)) {
    const hasRealDate = Boolean(asset.documentDate);
    const date = asset.documentDate || asset.importedAt;
    return {
      branch: 'journal_asset',
      encounterType: inferEncounterTypeFromAsset(asset) || 'other',
      date: date ? String(date).slice(0, 10) : null,
      usedImportedAtFallback: !hasRealDate && Boolean(asset.importedAt),
    };
  }
  if (isPipedriveSmartdocAsset(asset)) {
    const hasRealDate = Boolean(
      asset.captureDateTime ||
      asset.captureDate ||
      asset.documentDate ||
      asset.visitDate ||
      asset.photoDate
    );
    const date = assetEncounterDate(asset);
    return {
      branch: 'pipedrive_smartdoc',
      encounterType: inferEncounterTypeFromAsset(asset) || 'consultation',
      date,
      usedImportedAtFallback: !hasRealDate && Boolean(asset.importedAt),
    };
  }
  return null;
}

async function main() {
  const args = parseArgs();
  const store = await createCcoPatientAssetStore({
    filePath: path.resolve(args.patientAssetsStorePath),
  });
  const items = store.listItemsForEnrichment();

  // key: `${patientId}::${encounterType}`
  const groups = new Map();
  let classifiedTotal = 0;

  for (const asset of items) {
    const patientId = normalizeText(asset.patientId);
    if (!patientId || patientId === 'unknown') continue;
    const classified = classifyAsset(asset);
    if (!classified || !classified.date) continue;
    classifiedTotal += 1;

    const key = `${patientId}::${classified.encounterType}`;
    if (!groups.has(key)) {
      groups.set(key, {
        patientId,
        encounterType: classified.encounterType,
        assetCount: 0,
        fallbackCount: 0,
        dates: new Set(),
        branches: new Set(),
      });
    }
    const group = groups.get(key);
    group.assetCount += 1;
    if (classified.usedImportedAtFallback) group.fallbackCount += 1;
    group.dates.add(classified.date);
    group.branches.add(classified.branch);
  }

  const rows = [...groups.values()]
    .filter((group) => group.assetCount >= args.minAssets)
    .map((group) => ({
      patientId: maskPatientId(group.patientId),
      encounterType: group.encounterType,
      assetCount: group.assetCount,
      distinctDates: group.dates.size,
      fallbackCount: group.fallbackCount,
      fallbackShare: Number((group.fallbackCount / group.assetCount).toFixed(2)),
      branches: [...group.branches].sort(),
    }))
    .sort((a, b) => b.distinctDates - a.distinctDates)
    .slice(0, args.top);

  const report = {
    readOnly: true,
    zeroWrites: true,
    generatedAt: new Date().toISOString(),
    totalAssetsScanned: items.length,
    totalClassified: classifiedTotal,
    groupsAboveThreshold: [...groups.values()].filter((g) => g.assetCount >= args.minAssets).length,
    minAssets: args.minAssets,
    topByDistinctDates: rows,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module || process.argv[1] === '-') {
  main().catch((error) => {
    process.stderr.write(`FEL: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, classifyAsset, maskPatientId };
