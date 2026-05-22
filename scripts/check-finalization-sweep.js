#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv) {
  const args = {
    reportFile: normalizeText(
      process.env.ARCANA_FINALIZATION_SWEEP_REPORT_FILE ||
        path.join('data', 'reports', 'finalization-sweep-latest.json')
    ),
    expectedExternalFailSteps: normalizeText(
      process.env.ARCANA_EXPECTED_EXTERNAL_FAIL_STEPS ||
        'bootstrap_release_cycle,check_pentest_evidence,report_release_readiness,report_stability_window,release_go_live_gate,release_final_live_signoff'
    ),
    strictExpectedOnly: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeText(argv[index]);
    if (item === '--report-file') {
      args.reportFile = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--expected-fail-steps') {
      args.expectedExternalFailSteps = normalizeText(argv[index + 1]);
      index += 1;
      continue;
    }
    if (item === '--allow-subset') {
      args.strictExpectedOnly = false;
      continue;
    }
  }

  return args;
}

function parseList(rawValue = '') {
  return String(rawValue || '')
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = path.resolve(args.reportFile);
  if (!fs.existsSync(reportPath)) {
    console.error('❌ finalization sweep report saknas:', reportPath);
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const failed = Array.isArray(report?.summary?.failedSteps) ? report.summary.failedSteps : [];
  const expected = parseList(args.expectedExternalFailSteps);
  const expectedSet = new Set(expected);

  const unexpected = failed.filter((id) => !expectedSet.has(id));
  const missingExpected = expected.filter((id) => !failed.includes(id));

  process.stdout.write('== Finalization Sweep Guard ==\n');
  process.stdout.write(`report: ${reportPath}\n`);
  process.stdout.write(`failed: ${failed.join(',') || '-'}\n`);
  process.stdout.write(`expected: ${expected.join(',') || '-'}\n`);
  process.stdout.write(`unexpected: ${unexpected.join(',') || '-'}\n`);
  process.stdout.write(`missingExpected: ${missingExpected.join(',') || '-'}\n`);

  if (unexpected.length > 0) {
    console.error('❌ Oväntade regressionsfel i finalization-sweep.');
    process.exitCode = 1;
    return;
  }

  if (args.strictExpectedOnly && missingExpected.length > 0) {
    process.stdout.write(
      'ℹ️ Vissa tidigare externa blocker-steg passerar nu. Uppdatera expected-listan om detta är avsiktligt.\n'
    );
  }
}

run();
