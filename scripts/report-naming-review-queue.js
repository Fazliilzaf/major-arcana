#!/usr/bin/env node
'use strict';

/**
 * CCO-STATUS.md punkt 1, uppföljning (2026-08-14): PR #1374/#1375 fixade
 * de två bekräftade sessionNumber-rotorsakerna genom att hålla tillbaka
 * osäkra beräkningar som `namingStatus: needs_review_for_naming` i
 * stället för att skriva dem som fakta. Dry-run mot prod visade
 * `skippedNeedsReview: 90 856` (~84 % av alla kandidater).
 *
 * INGEN gransknings-UI eller route konsumerar `needs_review_for_naming`
 * eller `uiStatus` någonstans i kodbasen idag (verifierat via
 * repo-sökning) — de 90 856 posterna skulle hamna i ett fält ingen kan
 * se eller agera på. Det här skriptet är läs-endast underlag för att
 * förstå FORMEN på den kön innan något gransknings-verktyg byggs:
 * hur många är lågkonfident namngivning (oberoende av #1374/#1375) vs.
 * hur många är fallback-daterat sessionNumber (den nya orsaken), och
 * hur de fördelar sig per patient.
 *
 * Återanvänder produktionens egna funktioner ordagrant — needsBackfill,
 * resolveAliasKeyFn, groupByPatientId (scripts/backfill-asset-display-
 * names.js) och buildAssetNamingMetadata (ccoAssetNaming/index.js) —
 * samma beräkning en riktig --dry-run skulle gjort, bara omgrupperad
 * för rapportering. Skriver ALDRIG till någon store.
 *
 *   node scripts/report-naming-review-queue.js \
 *     --patient-assets-store /var/data/cco-patient-assets.json \
 *     --patients-store /var/data/cco-patient-master.json \
 *     --tenant hair-tp-clinic --top 30
 */

const path = require('node:path');
const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const {
  buildNamingReviewQueue,
  maskId,
  classifyReason,
} = require('../src/ops/ccoAssetNaming/buildNamingReviewQueue');

function parseArgs(argv = process.argv) {
  const args = {
    patientAssetsStorePath: '',
    patientsStorePath: '',
    tenant: '',
    top: 30,
    patientLimit: 20000,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--patient-assets-store') args.patientAssetsStorePath = argv[++index] || '';
    else if (value === '--patients-store') args.patientsStorePath = argv[++index] || '';
    else if (value === '--tenant') args.tenant = argv[++index] || '';
    else if (value === '--top') args.top = Number(argv[++index]);
    else if (value === '--patient-limit') args.patientLimit = Number(argv[++index]);
    else throw new Error(`Okänt argument: ${value}`);
  }
  if (!args.patientAssetsStorePath) {
    throw new Error('--patient-assets-store <explicit path> krävs.');
  }
  if (!args.patientsStorePath) throw new Error('--patients-store <explicit path> krävs.');
  if (!args.tenant) throw new Error('--tenant <explicit tenantId> krävs — inget tyst default.');
  if (!Number.isInteger(args.top) || args.top < 1) {
    throw new Error('--top måste vara ett positivt heltal.');
  }
  return args;
}

async function main() {
  const args = parseArgs();

  const patientStore = await createCcoPatientMasterStore({
    filePath: path.resolve(args.patientsStorePath),
  });
  const assetStore = await createCcoPatientAssetStore({
    filePath: path.resolve(args.patientAssetsStorePath),
  });

  const report = await buildNamingReviewQueue(patientStore, assetStore, {
    tenantId: args.tenant,
    top: args.top,
    patientLimit: args.patientLimit,
    maskIds: true,
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module || process.argv[1] === '-') {
  main().catch((error) => {
    process.stderr.write(`FEL: ${error?.stack || error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, maskId, classifyReason };
