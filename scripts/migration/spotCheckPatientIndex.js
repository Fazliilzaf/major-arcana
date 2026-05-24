#!/usr/bin/env node
'use strict';

/**
 * C3 — Spot-check migration-index ↔ patient master (≥20 kunder).
 * Usage: npm run migration:spot-check
 *        npm run migration:spot-check -- --fixture tests/fixtures/migration-index-sample.json
 */
const fs = require('node:fs');
const path = require('node:path');
const { evaluateSpotCheck } = require('./lib/spotCheckCore');
const { resolveMigrationPaths } = require('./lib/migrationEnv');

function parseArgs(argv) {
  const args = { strict: false, fixture: '' };
  const paths = resolveMigrationPaths();
  const options = {
    tenantId: paths.tenantId,
    patientMasterPath: paths.patientMasterPath,
    indexPath: paths.indexPath,
    minMatches: 20,
    sampleSize: 30,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--tenant') options.tenantId = argv[++i];
    else if (token === '--patient-master') options.patientMasterPath = argv[++i];
    else if (token === '--index') options.indexPath = argv[++i];
    else if (token === '--min') options.minMatches = Number(argv[++i]) || 20;
    else if (token === '--sample') options.sampleSize = Number(argv[++i]) || 30;
    else if (token === '--strict') args.strict = true;
    else if (token === '--fixture') args.fixture = argv[++i];
  }
  return { ...options, ...args };
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function main() {
  const args = parseArgs(process.argv);
  const indexRaw = args.fixture ? loadJson(path.resolve(args.fixture)) : loadJson(args.indexPath);
  const masterRaw = loadJson(args.patientMasterPath);

  if (!indexRaw || !masterRaw) {
    if (args.strict) {
      console.error('❌ migration spot-check — saknar index eller patient master');
      process.exit(1);
    }
    console.log('WARN: migration spot-check — saknar data/migration-index.json eller patient master lokalt.');
    console.log('✅ migration spot-check hoppad (kör efter migration:scan)');
    return;
  }

  const result = evaluateSpotCheck({
    indexRaw,
    masterRaw,
    tenantId: args.tenantId,
    minMatches: args.minMatches,
    sampleSize: args.sampleSize,
  });

  console.log(
    `Spot-check @ tenant=${result.tenantId}\n` +
      `  index files: ${result.indexFileCount}\n` +
      `  patient master: ${result.patientCount}\n` +
      `  overlap (pnr i båda): ${result.overlapCount}\n`
  );

  let hardFail = false;
  if (!record('C3-01 index finns', result.checks.indexExists, `${result.indexFileCount} filer`)) {
    hardFail = true;
  }
  if (!record('C3-02 patient master finns', result.checks.patientMasterExists, `${result.patientCount} kunder`)) {
    hardFail = true;
  }
  if (
    !record(
      'C3-03 overlap ≥ min',
      result.checks.overlapMin,
      `${result.overlapCount} (min ${result.minMatches})`
    )
  ) {
    hardFail = true;
  }

  for (const warning of result.warnings) {
    console.log(`  ⚠ ${warning.personnummer}: ${warning.type} — ${warning.detail}`);
  }

  if (
    !record(
      'C3-04 sample spot-check',
      result.checks.sampleClean,
      `${result.checked} kontrollerade, ${result.warnings.length} avvikelser`
    )
  ) {
    hardFail = true;
  }

  if (hardFail) {
    console.error('\n❌ migration spot-check misslyckades');
    process.exit(1);
  }
  console.log('\n✅ migration spot-check klar');
}

main();
