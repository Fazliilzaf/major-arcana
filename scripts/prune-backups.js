#!/usr/bin/env node
require('dotenv').config();

const { config } = require('../src/config');
const { pruneBackups } = require('../src/ops/stateBackup');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = String(argv[index] || '').trim();
    if (item === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (item === '--apply') {
      args.dryRun = false;
      continue;
    }
    if (item === '--dryRun') {
      args.dryRun = parseBoolean(argv[index + 1], true);
      index += 1;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await pruneBackups({
    backupDir: config.backupDir,
    maxFiles: config.backupRetentionMaxFiles,
    maxAgeDays: config.backupRetentionMaxAgeDays,
    dryRun: args.dryRun,
  });

  process.stdout.write(
    `${result.dryRun ? 'Preview' : 'Prune'}: scanned=${result.scannedCount}, deleted=${result.deletedCount}, kept=${result.keptCount}\n`
  );
  process.stdout.write(
    `Settings: maxFiles=${result.settings.maxFiles}, maxAgeDays=${result.settings.maxAgeDays}\n`
  );
  if (!result.deleted.length) return;

  for (const file of result.deleted) {
    process.stdout.write(
      `- ${file.fileName} | reason=${file.reason} | ${file.mtime} | ${file.sizeBytes} bytes\n`
    );
  }
}

main().catch((error) => {
  console.error('❌ Kunde inte pruna backups');
  console.error(error?.message || error);
  process.exit(1);
});
