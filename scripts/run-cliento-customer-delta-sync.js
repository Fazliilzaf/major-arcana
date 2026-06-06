#!/usr/bin/env node

'use strict';

const path = require('node:path');

const { config } = require('../src/config');
const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const {
  runClientoCustomerDeltaSync,
  runClientoCustomerCsvDeltaSync,
} = require('../src/ops/clientoCustomerDeltaSync');

function parseArgs(argv) {
  const args = {
    dryRun: true,
    commit: false,
    sample: 5,
    tenantId: process.env.CCO_DEFAULT_TENANT_ID || 'hair-tp-clinic',
    csvPath: '',
    updatedSince: '',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--commit') {
      args.commit = true;
      args.dryRun = false;
    } else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--sample') args.sample = Number(argv[++i]) || 5;
    else if (token === '--tenant') args.tenantId = argv[++i];
    else if (token === '--csv') args.csvPath = argv[++i];
    else if (token === '--updated-since') args.updatedSince = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const patientMasterPath =
    process.env.CCO_PATIENT_MASTER_PATH || path.resolve('./data/cco-patient-master.json');
  const patientMasterStore = await createCcoPatientMasterStore({ filePath: patientMasterPath });

  if (args.csvPath) {
    const report = await runClientoCustomerCsvDeltaSync({
      patientMasterStore,
      tenantId: args.tenantId,
      csvPath: args.csvPath,
      dryRun: args.dryRun,
      sampleSize: args.sample,
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(1);
    return;
  }

  const report = await runClientoCustomerDeltaSync({
    patientMasterStore,
    tenantId: args.tenantId,
    config,
    dryRun: args.dryRun,
    sampleSize: args.sample,
    updatedSince: args.updatedSince,
  });

  console.log(JSON.stringify(report, null, 2));

  if (report.skipped && report.reason === 'cliento_api_key_missing') {
    console.error('\n→ CLIENTO_API_KEY saknas. Använd CSV-spår:');
    console.error('  npm run sync:cliento-customers-dry-run -- --csv "/path/to/export.csv"');
    process.exit(2);
  }
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
