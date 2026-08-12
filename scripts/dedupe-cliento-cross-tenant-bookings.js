#!/usr/bin/env node
'use strict';

/**
 * ORD-101 — tenant-stavnings-dedup (INTE boknings->patient-länkning).
 * Se docs/handover/ORDERS/ORD-101-cliento-cross-tenant-reconcile.md.
 *
 * Slår ihop bokningar som ligger dubbelt under två tenant-ID-stavningar
 * (t.ex. hair_tp / hair-tp-clinic) till en kanonisk post under
 * --canonical-tenant. Återanvänder EXAKT samma urvalslogik som det
 * maskerade kandidatmanifestet (report-cliento-link-candidates.js) via
 * mergeCrossTenantDuplicateBookings i clientoBookingStore.js — så att
 * skrivoperationen aldrig kan slå ihop ett par manifestet inte själv
 * skulle godkänt. Rör aldrig patientId/encounterId.
 *
 * Läs-endast som standard (dry-run). Skriver bara vid --commit.
 *
 *   node scripts/dedupe-cliento-cross-tenant-bookings.js \
 *     --store /var/data/cco/cliento-bookings.json \
 *     --unlinked-review /tmp/cliento-unlinked-review.json \
 *     --canonical-tenant hair-tp-clinic \
 *     --expected-total 55221 --expected-unlinked 11472
 *
 *   (lägg till --commit för att faktiskt skriva)
 */

const fs = require('node:fs');
const path = require('node:path');
const { createClientoBookingStore } = require('../src/ops/clientoBookingStore');

function requireFile(value, label) {
  const resolved = value ? path.resolve(value) : '';
  if (!resolved) throw new Error(`${label} <explicit path> krävs.`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label}-filen finns inte: ${resolved}`);
  }
  return resolved;
}

function parseNonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} måste vara ett icke-negativt heltal.`);
  }
  return parsed;
}

function parseArgs(argv = process.argv) {
  const args = {
    storePath: '',
    unlinkedReviewPath: '',
    leftTenant: 'hair_tp',
    rightTenant: 'hair-tp-clinic',
    canonicalTenant: '',
    expectedTotal: 55221,
    expectedUnlinkedReviewCount: 11472,
    commit: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--store') args.storePath = argv[++index] || '';
    else if (value === '--unlinked-review') args.unlinkedReviewPath = argv[++index] || '';
    else if (value === '--left-tenant') args.leftTenant = argv[++index] || '';
    else if (value === '--right-tenant') args.rightTenant = argv[++index] || '';
    else if (value === '--canonical-tenant') args.canonicalTenant = argv[++index] || '';
    else if (value === '--expected-total') {
      args.expectedTotal = parseNonNegativeInteger(argv[++index], '--expected-total');
    } else if (value === '--expected-unlinked') {
      args.expectedUnlinkedReviewCount = parseNonNegativeInteger(
        argv[++index],
        '--expected-unlinked'
      );
    } else if (value === '--commit') args.commit = true;
    else if (value === '--dry-run') args.commit = false;
    else throw new Error(`Okänt argument: ${value}`);
  }
  args.storePath = requireFile(args.storePath, '--store');
  args.unlinkedReviewPath = requireFile(args.unlinkedReviewPath, '--unlinked-review');
  if (!args.leftTenant || !args.rightTenant || args.leftTenant === args.rightTenant) {
    throw new Error('Två olika tenant-id krävs.');
  }
  if (!args.canonicalTenant) {
    throw new Error(
      '--canonical-tenant <explicit tenant-id> krävs — inget tyst default (se ORD-101).'
    );
  }
  if (args.canonicalTenant !== args.leftTenant && args.canonicalTenant !== args.rightTenant) {
    throw new Error(
      '--canonical-tenant måste vara samma sträng som --left-tenant eller --right-tenant.'
    );
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const store = await createClientoBookingStore({ filePath: args.storePath });
  const unlinkedReview = JSON.parse(fs.readFileSync(args.unlinkedReviewPath, 'utf8'));

  const report = await store.mergeCrossTenantDuplicateBookings({
    leftTenant: args.leftTenant,
    rightTenant: args.rightTenant,
    canonicalTenant: args.canonicalTenant,
    unlinkedReview,
    expectedTotal: args.expectedTotal,
    expectedUnlinkedReviewCount: args.expectedUnlinkedReviewCount,
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
  if (report.gate.status === 'blocked_data_invariant') process.exitCode = 2;
}

if (require.main === module || process.argv[1] === '-') {
  main().catch((error) => {
    process.stderr.write(`FEL: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
