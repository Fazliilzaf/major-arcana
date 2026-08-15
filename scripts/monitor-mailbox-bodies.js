#!/usr/bin/env node
'use strict';

/**
 * ORD-99 övervakning — upptäck om inline bodyText/bodyHtml återkommit i
 * truth-shardarna efter body-migreringen.
 *
 * Körs antingen manuellt eller via scheduler-jobbet `cco_mailbox_body_monitor`.
 * Skannar strömmande, håller aldrig hela shard-filer i minnet.
 *
 * Exit code:
 *   0 = inga inline-kroppar hittade (allt är migrerat)
 *   2 = regression: minst en shard bär fortfarande bodyText/bodyHtml inline
 *   1 = övrigt fel (t.ex. konfiguration eller I/O)
 */

const { config } = require('../src/config');
const { measureMailboxTruthBodyShare } = require('../src/ops/mailboxTruthBodyShareScan');

const mb = (bytes) => (Number(bytes || 0) / (1024 * 1024)).toFixed(1);

async function main() {
  const measurement = await measureMailboxTruthBodyShare(config);
  if (!measurement.mailboxes.length) {
    console.error('Inga mailbox-truth-shardar hittades. Kör detta där shardsen ligger.');
    process.exitCode = 1;
    return;
  }

  const regressions = measurement.mailboxes.filter(
    (row) => row.bodyDecodedChars > 0 || row.bodyTextValues > 0 || row.bodyHtmlValues > 0
  );

  console.log(`Skannade ${measurement.mailboxes.length} shard(ar).`);
  console.log(`Totalt fil-MB: ${mb(measurement.totalFileBytes)}`);
  console.log(`Regressionskandidater (inline bodyText/bodyHtml): ${regressions.length}`);

  if (regressions.length > 0) {
    console.error(
      regressions.map((row) => ({
        mailbox: row.mailbox,
        fileMb: mb(row.fileBytes),
        bodyValues: row.bodyTextValues + row.bodyHtmlValues,
        bodyDecodedChars: row.bodyDecodedChars,
      }))
    );
    process.exitCode = 2;
    return;
  }

  console.log('OK: inga inline bodyText/bodyHtml hittade i någon shard.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
