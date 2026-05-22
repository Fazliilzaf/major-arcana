#!/usr/bin/env node
require('dotenv').config();

const { config } = require('../src/config');
const { listBackups } = require('../src/ops/stateBackup');

function parseLimit(argv) {
  const idx = argv.findIndex((item) => item === '--limit');
  if (idx === -1) return 20;
  const value = argv[idx + 1];
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(200, parsed));
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  const backups = await listBackups({
    backupDir: config.backupDir,
    limit,
  });

  process.stdout.write(`BackupDir: ${config.backupDir}\n`);
  process.stdout.write(`Count: ${backups.length}\n`);
  if (!backups.length) return;

  for (const backup of backups) {
    process.stdout.write(
      `- ${backup.fileName} | ${backup.mtime} | ${backup.sizeBytes} bytes\n`
    );
  }
}

main().catch((error) => {
  console.error('❌ Kunde inte lista backups');
  console.error(error?.message || error);
  process.exit(1);
});
