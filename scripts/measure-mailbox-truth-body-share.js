#!/usr/bin/env node
'use strict';

/**
 * ORD-89 steg 1 — hur stor del av truth-shardsen är brödtext?
 *
 * Två vägar, samma mätning:
 *   ägar-API (föredras):  GET /api/v1/ops/mailbox-truth/body-share
 *   på prod-disken:       node scripts/measure-mailbox-truth-body-share.js
 *
 * Båda kallar `measureMailboxTruthBodyShare`, så CLI:t kan inte glida isär från
 * det ändpunkten svarar. Mätningen går inte genom `loadShard()` — varje läsväg
 * där parsar hela filen, alltså exakt felläget vi undersöker.
 *
 * Ordningen är MINST FÖRST. `kons@` (0,9 MB) före `egzona@` (179 MB).
 */

const { config } = require('../src/config');
const { measureMailboxTruthBodyShare } = require('../src/ops/mailboxTruthBodyShareScan');

const mb = (bytes) => (Number(bytes || 0) / (1024 * 1024)).toFixed(1);
const pct = (share) => `${(Number(share || 0) * 100).toFixed(1)} %`;

async function main() {
  const measurement = await measureMailboxTruthBodyShare(config);
  if (!measurement.mailboxes.length) {
    console.error('Inga shardar hittades. Kör detta där shardsen ligger.');
    process.exitCode = 1;
    return;
  }

  console.table(
    measurement.mailboxes.map((row) => ({
      mailbox: row.mailbox,
      'fil MB': mb(row.fileBytes),
      'brödtext MB': mb(row.bodyRawBytes),
      andel: pct(row.bodyShare),
      'bodyText-värden': row.bodyTextValues,
      'bodyHtml-värden': row.bodyHtmlValues,
      ms: row.msSpent,
      // Ska inte följa filstorleken. Gör den det är skannern inte strömmande.
      'RSS-delta MB': mb(row.rssDeltaBytes),
    }))
  );

  console.log(
    JSON.stringify(
      {
        totaltFilMb: mb(measurement.totalFileBytes),
        totaltBrodtextMb: mb(measurement.totalBodyBytes),
        andelAvAllt: pct(measurement.totalBodyShare),
        measuredAt: measurement.measuredAt,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
