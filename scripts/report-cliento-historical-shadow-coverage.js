#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createClientoBookingStore } = require('../src/ops/clientoBookingStore');
const { createClientoLinkSidecarLedger } = require('../src/ops/clientoLinkSidecarLedger');
const {
  buildClientoHistoricalShadowCoverageReport,
  fileSha256,
} = require('../src/ops/clientoHistoricalShadowCoverageReport');

function parseArgs(argv) {
  const args = {
    bookingsPath: '',
    ledgerPath: '',
    unlinkedReviewPath: '',
    expectedBookingsSha256: '',
    expectedLedgerSha256: '',
    expectedUnlinkedReviewSha256: '',
    leftTenant: 'hair_tp',
    rightTenant: 'hair-tp-clinic',
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--bookings') args.bookingsPath = argv[++index] || '';
    else if (value === '--ledger') args.ledgerPath = argv[++index] || '';
    else if (value === '--unlinked-review') args.unlinkedReviewPath = argv[++index] || '';
    else if (value === '--expected-bookings-sha256') {
      args.expectedBookingsSha256 = argv[++index] || '';
    } else if (value === '--expected-ledger-sha256')
      args.expectedLedgerSha256 = argv[++index] || '';
    else if (value === '--expected-unlinked-review-sha256') {
      args.expectedUnlinkedReviewSha256 = argv[++index] || '';
    } else if (value === '--left-tenant') args.leftTenant = argv[++index] || '';
    else if (value === '--right-tenant') args.rightTenant = argv[++index] || '';
    else throw new Error(`Okänt argument: ${value}`);
  }
  args.bookingsPath = requireFile(args.bookingsPath, '--bookings');
  args.ledgerPath = requireFile(args.ledgerPath, '--ledger');
  if (args.unlinkedReviewPath) {
    args.unlinkedReviewPath = requireFile(args.unlinkedReviewPath, '--unlinked-review');
  }
  requireChecksum(args.expectedBookingsSha256, '--expected-bookings-sha256');
  requireChecksum(args.expectedLedgerSha256, '--expected-ledger-sha256');
  if (args.unlinkedReviewPath) {
    requireChecksum(args.expectedUnlinkedReviewSha256, '--expected-unlinked-review-sha256');
  }
  if (!args.leftTenant || !args.rightTenant || args.leftTenant === args.rightTenant) {
    throw new Error('Två olika tenant-id krävs.');
  }
  return args;
}

function requireFile(value, label) {
  const resolved = value ? path.resolve(value) : '';
  if (!resolved) throw new Error(`${label} <explicit path> krävs.`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${label}-filen finns inte: ${resolved}`);
  }
  return resolved;
}

function requireChecksum(value, label) {
  if (!/^[a-f0-9]{64}$/.test(String(value || ''))) {
    throw new Error(`${label} krävs och måste vara SHA-256 hex.`);
  }
}

function assertChecksum(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} checksum mismatch: expected ${expected}, got ${actual}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const bookingsChecksum = fileSha256(args.bookingsPath);
  const ledgerChecksum = fileSha256(args.ledgerPath);
  assertChecksum('bookings', bookingsChecksum, args.expectedBookingsSha256);
  assertChecksum('ledger', ledgerChecksum, args.expectedLedgerSha256);

  let unlinkedReview = null;
  if (args.unlinkedReviewPath) {
    const reviewChecksum = fileSha256(args.unlinkedReviewPath);
    assertChecksum('unlinked-review', reviewChecksum, args.expectedUnlinkedReviewSha256);
    unlinkedReview = JSON.parse(fs.readFileSync(args.unlinkedReviewPath, 'utf8'));
  }

  const store = await createClientoBookingStore({ filePath: args.bookingsPath });
  const ledger = await createClientoLinkSidecarLedger({
    filePath: args.ledgerPath,
    gates: { ledgerWriteAllowed: false, activationAllowed: false },
  });
  const report = buildClientoHistoricalShadowCoverageReport({
    bookings: [
      ...store.listAllBookings({ tenantId: args.leftTenant, limit: 0 }),
      ...store.listAllBookings({ tenantId: args.rightTenant, limit: 0 }),
    ],
    ledgerEvents: ledger.listEvents(),
    bookingsChecksum,
    ledgerChecksum,
    leftTenant: args.leftTenant,
    rightTenant: args.rightTenant,
    unlinkedReview,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module || process.argv[1] === '-') {
  main().catch((error) => {
    process.stderr.write(`FEL: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
