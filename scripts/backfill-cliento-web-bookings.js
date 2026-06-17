#!/usr/bin/env node
'use strict';

/**
 * Backfill Cliento web booking notification emails into cliento-bookings.json.
 *
 * Usage:
 *   node scripts/backfill-cliento-web-bookings.js [--dry-run] [--since=2026-06-01]
 *
 * Reads mailbox truth messages and upserts parsed web bookings so kundkort
 * can derive todayVisit / activeVisit from clientoBookingStore.
 */

const path = require('node:path');
const { config } = require('../src/config');
const { createCcoMailboxTruthStore } = require('../src/ops/ccoMailboxTruthStore');
const { createClientoBookingStore } = require('../src/ops/clientoBookingStore');
const { createCcoClientoBookingIngest } = require('../src/ops/ccoClientoBookingIngest');
const { isClientoBookingMail } = require('../src/ops/clientoBookingMailParser');

function parseArgs(argv) {
  const out = { dryRun: false, since: null, limit: 0 };
  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--since=')) out.since = arg.slice('--since='.length);
    else if (arg.startsWith('--limit=')) out.limit = Number(arg.slice('--limit='.length)) || 0;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const truthPath =
    config.ccoMailboxTruthStorePath ||
    path.join(config.dataDir || path.join(process.cwd(), 'data'), 'cco-mailbox-truth.json');
  const bookingPath =
    config.clientoBookingStorePath ||
    path.join(config.dataDir || path.join(process.cwd(), 'data'), 'cco', 'cliento-bookings.json');

  const truthStore = await createCcoMailboxTruthStore({ filePath: truthPath });
  const clientoBookingStore = await createClientoBookingStore({ filePath: bookingPath });
  const ingest = createCcoClientoBookingIngest({
    config,
    clientoBookingStore,
    logger: console,
  });

  const messages = truthStore.listMessages({
    sinceIso: args.since,
    limit: args.limit || 0,
  });

  let scanned = 0;
  let matched = 0;
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const message of messages) {
    scanned += 1;
    const rawMessage = {
      id: message.graphMessageId || message.id,
      graphMessageId: message.graphMessageId,
      internetMessageId: message.internetMessageId,
      fromEmail: message.fromEmail || message.from?.address,
      fromName: message.fromName || message.from?.name,
      subject: message.subject,
      bodyText: message.bodyText || message.bodyPreview,
      bodyPreview: message.bodyPreview,
      receivedDateTime: message.receivedAt || message.receivedDateTime,
    };
    if (!isClientoBookingMail(rawMessage)) continue;
    matched += 1;
    try {
      const result = await ingest.processRawMessage({
        rawMessage,
        mode: args.dryRun ? 'dry_run' : 'read_only',
        tenantId: config.defaultTenantId || config.defaultTenant || 'hair-tp-clinic',
      });
      if (result.imported || result.dryRun) imported += 1;
      else skipped += 1;
      console.log(
        `[backfill-cliento-web-bookings] ${result.imported || result.dryRun ? 'OK' : 'SKIP'} ${rawMessage.subject}`
      );
    } catch (error) {
      failed += 1;
      console.error(
        `[backfill-cliento-web-bookings] FAIL ${rawMessage.subject}`,
        error?.message || error
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        matched,
        imported,
        skipped,
        failed,
        dryRun: args.dryRun,
        truthPath,
        bookingPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('[backfill-cliento-web-bookings] fatal', error);
  process.exit(1);
});
