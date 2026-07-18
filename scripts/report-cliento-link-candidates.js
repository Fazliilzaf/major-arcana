#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createClientoBookingStore } = require('../src/ops/clientoBookingStore');
const {
  buildClientoLinkCandidateManifest,
} = require('../src/ops/clientoLinkCandidateManifest');

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

function parseArgs(argv) {
  const args = {
    storePath: '',
    unlinkedReviewPath: '',
    leftTenant: 'hair_tp',
    rightTenant: 'hair-tp-clinic',
    expectedTotal: 55221,
    expectedUnlinkedReviewCount: 11472,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--store') args.storePath = argv[++index] || '';
    else if (value === '--unlinked-review') args.unlinkedReviewPath = argv[++index] || '';
    else if (value === '--left-tenant') args.leftTenant = argv[++index] || '';
    else if (value === '--right-tenant') args.rightTenant = argv[++index] || '';
    else if (value === '--expected-total') {
      args.expectedTotal = parseNonNegativeInteger(argv[++index], '--expected-total');
    } else if (value === '--expected-unlinked') {
      args.expectedUnlinkedReviewCount = parseNonNegativeInteger(
        argv[++index],
        '--expected-unlinked'
      );
    } else throw new Error(`Okänt argument: ${value}`);
  }
  args.storePath = requireFile(args.storePath, '--store');
  args.unlinkedReviewPath = requireFile(args.unlinkedReviewPath, '--unlinked-review');
  if (!args.leftTenant || !args.rightTenant || args.leftTenant === args.rightTenant) {
    throw new Error('Två olika tenant-id krävs.');
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const store = await createClientoBookingStore({ filePath: args.storePath });
  const unlinkedReview = JSON.parse(fs.readFileSync(args.unlinkedReviewPath, 'utf8'));
  const manifest = buildClientoLinkCandidateManifest({
    leftTenant: args.leftTenant,
    rightTenant: args.rightTenant,
    leftBookings: store.listAllBookings({ tenantId: args.leftTenant, limit: 0 }),
    rightBookings: store.listAllBookings({ tenantId: args.rightTenant, limit: 0 }),
    unlinkedReview,
    expectedTotal: args.expectedTotal,
    expectedUnlinkedReviewCount: args.expectedUnlinkedReviewCount,
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  if (manifest.gate.status !== 'review_candidates_only') process.exitCode = 2;
}

if (require.main === module || process.argv[1] === '-') {
  main().catch((error) => {
    process.stderr.write(`FEL: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
