#!/usr/bin/env node
'use strict';

/**
 * C1 → C2 — Orkestrerar Drive-scan, Cliento-import och bulk journalimport.
 *
 * Usage:
 *   npm run migration:run-bulk
 *   npm run migration:run-bulk -- --skip-scan --include-images --limit 50
 *   npm run migration:run-bulk -- --dry-run
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { resolveMigrationPaths } = require('./lib/migrationEnv');

function parseArgs(argv) {
  const args = {
    skipScan: false,
    skipCliento: false,
    skipJournals: false,
    dryRun: false,
    includeImages: false,
    limitPatients: 0,
    useFolderMirror: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--skip-scan') args.skipScan = true;
    else if (token === '--skip-cliento') args.skipCliento = true;
    else if (token === '--skip-journals') args.skipJournals = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--include-images') args.includeImages = true;
    else if (token === '--folder-mirror') args.useFolderMirror = true;
    else if (token === '--limit') args.limitPatients = Number(argv[++i]) || 0;
    else if (token === '--tenant') args.tenantId = argv[++i];
  }
  return args;
}

function runStep(label, command, commandArgs, { dryRun = false } = {}) {
  console.log(`\n=== ${label} ===`);
  if (dryRun) {
    console.log(`DRY-RUN: ${command} ${commandArgs.join(' ')}`);
    return { status: 0 };
  }
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..', '..'),
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${label} misslyckades (exit ${result.status})`);
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv);
  const paths = resolveMigrationPaths(args);
  const startedAt = new Date().toISOString();

  console.log('Bulk migration pipeline');
  console.log(`  tenant: ${paths.tenantId}`);
  console.log(`  index: ${paths.indexPath}`);
  console.log(`  patient master: ${paths.patientMasterPath}`);
  console.log(`  journal: ${paths.journalPath}`);
  if (args.dryRun) console.log('  mode: DRY-RUN');

  if (!args.skipScan) {
    if (args.useFolderMirror) {
      if (!paths.driveMirrorRoot || !fs.existsSync(paths.driveMirrorRoot)) {
        throw new Error(`Drive mirror saknas: ${paths.driveMirrorRoot || '(tom)'}`);
      }
      runStep(
        'C1 folder mirror scan',
        'node',
        ['scripts/migration/scanDriveFolder.js', '--root', paths.driveMirrorRoot, '--out', paths.indexPath],
        { dryRun: args.dryRun }
      );
    } else {
      runStep('C1 preflight', 'node', ['scripts/migration/preflightDriveApi.js'], {
        dryRun: args.dryRun,
      });
      runStep(
        'C1 Drive API scan',
        'node',
        ['scripts/migration/scanGoogleDriveApi.js', '--out', paths.indexPath],
        { dryRun: args.dryRun }
      );
    }
  } else {
    console.log('\n=== C1 scan — SKIPPED ===');
  }

  if (!args.skipCliento && !args.dryRun) {
    runStep(
      'Cliento + Drive profile merge',
      'node',
      [
        'scripts/migration/runMigrationPipeline.js',
        '--root',
        paths.migrationRoot,
        '--tenant',
        paths.tenantId,
        '--patient-master',
        paths.patientMasterPath,
        '--index',
        paths.indexPath,
      ],
      { dryRun: false }
    );
  } else if (args.dryRun) {
    console.log('\n=== Cliento merge — SKIPPED (dry-run) ===');
  }

  if (!args.dryRun && fs.existsSync(paths.indexPath) && fs.existsSync(paths.patientMasterPath)) {
    runStep(
      'C3 spot-check',
      'node',
      [
        'scripts/migration/spotCheckPatientIndex.js',
        '--tenant',
        paths.tenantId,
        '--patient-master',
        paths.patientMasterPath,
        '--index',
        paths.indexPath,
      ],
      { dryRun: false }
    );
  } else if (args.dryRun) {
    console.log('\n=== C3 spot-check — SKIPPED (dry-run) ===');
  }

  if (!args.skipJournals) {
    const journalArgs = [
      'scripts/migration/importHistoricalJournals.js',
      '--tenant',
      paths.tenantId,
      '--patient-master',
      paths.patientMasterPath,
      '--journal',
      paths.journalPath,
      '--index',
      paths.indexPath,
    ];
    if (args.includeImages) journalArgs.push('--include-images');
    if (args.limitPatients > 0) journalArgs.push('--limit', String(args.limitPatients));
    if (args.dryRun) journalArgs.push('--dry-run');

    runStep('C2 bulk journal import', 'node', journalArgs, { dryRun: args.dryRun });
  } else {
    console.log('\n=== C2 bulk journal import — SKIPPED ===');
  }

  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    tenantId: paths.tenantId,
    indexPath: paths.indexPath,
    dryRun: args.dryRun,
    steps: {
      scan: !args.skipScan,
      cliento: !args.skipCliento && !args.dryRun,
      spotCheck: !args.dryRun,
      journals: !args.skipJournals && !args.dryRun,
    },
  };

  const reportDir = path.join(process.cwd(), 'docs', 'ops');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'migration-bulk-latest.json');
  if (!args.dryRun) {
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`\nRapport: ${reportPath}`);
  }

  console.log('\n✅ Bulk migration pipeline klar');
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
