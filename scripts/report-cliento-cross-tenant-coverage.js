#!/usr/bin/env node
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createClientoBookingStore } = require('../src/ops/clientoBookingStore');
const { buildClientoCrossTenantCoverageReport } = require('../src/ops/clientoCrossTenantCoverage');

function parseArgs(argv) {
  const args = {
    storePath: '',
    leftTenant: 'hair_tp',
    rightTenant: 'hair-tp-clinic',
    expectedTotal: 55221,
    expectedUnlinkedReviewCount: 11472,
    sampleLimit: 20,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--store') {
      const rawPath = argv[++index] || '';
      args.storePath = rawPath ? path.resolve(rawPath) : '';
    } else if (value === '--left-tenant') args.leftTenant = argv[++index] || '';
    else if (value === '--right-tenant') args.rightTenant = argv[++index] || '';
    else if (value === '--expected-total') args.expectedTotal = Number(argv[++index]);
    else if (value === '--expected-unlinked') {
      args.expectedUnlinkedReviewCount = Number(argv[++index]);
    } else if (value === '--sample-limit') args.sampleLimit = Number(argv[++index]);
    else throw new Error(`Okänt argument: ${value}`);
  }
  if (!args.storePath) throw new Error('--store <explicit path> krävs.');
  if (!fs.existsSync(args.storePath) || !fs.statSync(args.storePath).isFile()) {
    throw new Error(`Store-filen finns inte: ${args.storePath}`);
  }
  if (!Number.isInteger(args.expectedTotal) || args.expectedTotal < 0) {
    throw new Error('--expected-total måste vara ett icke-negativt heltal.');
  }
  if (!Number.isInteger(args.expectedUnlinkedReviewCount) || args.expectedUnlinkedReviewCount < 0) {
    throw new Error('--expected-unlinked måste vara ett icke-negativt heltal.');
  }
  if (!Number.isInteger(args.sampleLimit) || args.sampleLimit < 0) {
    throw new Error('--sample-limit måste vara ett icke-negativt heltal.');
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const store = await createClientoBookingStore({ filePath: args.storePath });
  const leftBookings = store.listAllBookings({ tenantId: args.leftTenant, limit: 0 });
  const rightBookings = store.listAllBookings({ tenantId: args.rightTenant, limit: 0 });
  const report = buildClientoCrossTenantCoverageReport({
    leftTenant: args.leftTenant,
    rightTenant: args.rightTenant,
    leftBookings,
    rightBookings,
    expectedTotal: args.expectedTotal,
    expectedUnlinkedReviewCount: args.expectedUnlinkedReviewCount,
    sampleLimit: args.sampleLimit,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.population.complete) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`FEL: ${error?.message || error}\n`);
  process.exitCode = 1;
});
