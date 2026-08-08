#!/usr/bin/env node
'use strict';

/**
 * Sanera dubbletter i clientoBookingStore skrivna INNAN den globala
 * bookingId-dedupen fanns (ORD-100 Fas 0, 2026-08-08 — 17 727 poster i prod).
 *
 *   node scripts/sanera-clientobooking-dubbletter.js --dry-run
 *   node scripts/sanera-clientobooking-dubbletter.js --dry-run --tenant-id hair_tp
 *   node scripts/sanera-clientobooking-dubbletter.js --commit
 *
 * Läs-endast som standard. Skriver bara vid --commit. Rapporten innehåller
 * aldrig e-post/telefon — bara identitetstypen (email/phone/clientoCustomerId)
 * varje kopia låg under, se bucketKeyIdentityType i clientoBookingStore.js.
 */

require('dotenv').config({ quiet: true });

const { config } = require('../src/config');
const { createClientoBookingStore } = require('../src/ops/clientoBookingStore');

function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: true, commit: false, tenantId: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--commit') args.commit = true;
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--tenant-id') args.tenantId = String(argv[++i] || '').trim();
  }
  if (args.commit) args.dryRun = false;
  return args;
}

async function main() {
  const args = parseArgs();
  const store = await createClientoBookingStore({ filePath: config.clientoBookingStorePath });

  const report = await store.dedupeBookings({
    tenantId: args.tenantId || undefined,
    commit: args.commit,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        mode: args.commit ? 'commit' : 'dry-run',
        generatedAt: new Date().toISOString(),
        ...report,
      },
      null,
      2
    )}\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[sanera-clientobooking-dubbletter] ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
