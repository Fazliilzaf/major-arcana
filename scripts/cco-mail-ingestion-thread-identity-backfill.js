#!/usr/bin/env node
'use strict';

/**
 * Backfill: populerar threadIdentityIndex för befintliga MATCHED-meddelanden.
 *
 * Läser befintliga länkningar från mailProcessingLedger och bygger trådidentiteter
 * utan att ändra patient-länkningarna. Skriver bara till threadIdentityIndex.
 *
 * Användning på Render:
 *   node scripts/cco-mail-ingestion-thread-identity-backfill.js \
 *     --store /var/data/cco-mail-ingestion.json
 */

const { createCcoMailIngestionStore } = require('../src/ops/ccoMailIngestion/store');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv) {
  const storeFlag = argv.indexOf('--store');
  const dryRunFlag = argv.indexOf('--dry-run');
  return {
    filePath: storeFlag >= 0 ? argv[storeFlag + 1] : '',
    dryRun: dryRunFlag >= 0,
  };
}

async function main() {
  const { filePath, dryRun } = parseArgs(process.argv);
  if (!filePath) {
    console.error('Använd: node scripts/cco-mail-ingestion-thread-identity-backfill.js --store /sökväg/till/cco-mail-ingestion.json [--dry-run]');
    process.exit(1);
  }

  const store = await createCcoMailIngestionStore({ filePath });
  const state = store.getState();
  const ledgers = Object.values(state.mailProcessingLedger || {});

  const matchedLedgers = ledgers.filter((ledger) => {
    const status = normalizeText(ledger.status).toUpperCase();
    return status === 'MATCHED' && normalizeText(ledger.patientId);
  });

  console.error(`[backfill] Hittade ${matchedLedgers.length} MATCHED ledger-poster att backfilla.`);

  let updated = 0;
  for (const ledger of matchedLedgers) {
    const rawMessageId = normalizeText(ledger.rawMessageId);
    const patientId = normalizeText(ledger.patientId);
    const linkedBy = normalizeText(ledger.linkedBy) || normalizeText(ledger.actorUserId) || 'backfill';
    const linkedAt = normalizeText(ledger.linkedAt) || normalizeText(ledger.completedAt) || normalizeText(ledger.processedAt) || null;

    if (!dryRun) {
      await store.updateThreadIdentityForMessage({
        rawMessageId,
        patientId,
        linkedBy,
        linkedAt,
        persist: false, // spara batch-vis nedan
      });
    }
    updated += 1;
  }

  if (!dryRun) {
    await store.save();
  }

  console.log(JSON.stringify({
    filePath,
    dryRun,
    matchedLedgers: matchedLedgers.length,
    updated,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
