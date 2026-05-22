#!/usr/bin/env node
require('dotenv').config();

const path = require('node:path');

const { config } = require('../src/config');
const { getStateFileMap, createStateBackup } = require('../src/ops/stateBackup');

async function main() {
  const stateFileMap = getStateFileMap(config);
  const backup = await createStateBackup({
    stateFileMap,
    backupDir: config.backupDir,
    createdBy: process.env.ARCANA_OWNER_EMAIL || 'cli',
  });

  process.stdout.write(`✅ Backup skapad: ${backup.filePath}\n`);
  process.stdout.write(`   Storlek: ${backup.sizeBytes} bytes\n`);
  process.stdout.write(`   Stores: ${backup.stores.length}\n`);
  for (const store of backup.stores) {
    const marker = store.exists ? 'ok' : 'missing';
    process.stdout.write(`   - ${store.name}: ${marker}, bytes=${store.sizeBytes}\n`);
  }
  process.stdout.write(`\nTips restore:\n`);
  process.stdout.write(
    `node ${path.join('scripts', 'restore-state.js')} --file "${backup.filePath}" --yes\n`
  );
}

main().catch((error) => {
  console.error('❌ Backup misslyckades');
  console.error(error?.message || error);
  process.exit(1);
});
