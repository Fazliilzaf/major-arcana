#!/usr/bin/env node
require('dotenv').config();

const path = require('node:path');
const { config } = require('../src/config');
const { createJournalPhotosBackup } = require('../src/ops/journalPhotosBackup');

async function main() {
  const sourceDir = String(config.journalPhotosDir || '').trim();
  if (!sourceDir) {
    throw new Error('journalPhotosDir saknas (sätt ARCANA_JOURNAL_PHOTOS_DIR eller stateRoot).');
  }

  const backup = await createJournalPhotosBackup({
    sourceDir,
    backupRoot: config.backupDir || path.join(config.stateRoot, 'backups'),
  });
  process.stdout.write(`✅ Journal photo backup: ${backup.archivePath}\n`);
  process.stdout.write(`   Källa: ${backup.sourceDir}\n`);
  process.stdout.write(`   Filer: ${backup.fileCount}\n`);
  process.stdout.write(`   Storlek källa: ${backup.sourceBytes} bytes\n`);
  process.stdout.write(`   Arkiv: ${backup.archiveBytes} bytes\n`);
  process.stdout.write(`\nRestore:\n`);
  process.stdout.write(`tar -xzf "${backup.archivePath}" -C "${path.dirname(backup.sourceDir)}"\n`);
}

main().catch((error) => {
  console.error('❌ Journal photo backup misslyckades');
  console.error(error?.message || error);
  process.exit(1);
});
