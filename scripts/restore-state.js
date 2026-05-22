#!/usr/bin/env node
require('dotenv').config();

const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const { config } = require('../src/config');
const {
  getStateFileMap,
  restoreFromBackup,
  readBackupBundle,
} = require('../src/ops/stateBackup');

function parseArgs(argv) {
  const args = {
    file: '',
    yes: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--file') {
      args.file = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (value === '--yes') {
      args.yes = true;
    }
  }
  return args;
}

async function confirmRestore(backupFilePath) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const reply = await rl.question(
      `Återställa state från ${backupFilePath}? Skriv "ja" för att fortsätta: `
    );
    return reply.trim().toLowerCase() === 'ja';
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error('Ange backupfil med --file <path>');
  }

  const backupFilePath = path.resolve(args.file);
  await readBackupBundle(backupFilePath);

  if (!args.yes) {
    const confirmed = await confirmRestore(backupFilePath);
    if (!confirmed) {
      process.stdout.write('Avbruten.\n');
      return;
    }
  }

  const stateFileMap = getStateFileMap(config);
  const result = await restoreFromBackup({
    backupFilePath,
    stateFileMap,
  });

  process.stdout.write(`✅ Restore klart: ${result.backupFilePath}\n`);
  for (const store of result.stores) {
    process.stdout.write(
      `- ${store.name}: ${store.restored ? 'restored' : `skipped (${store.reason || 'unknown'})`}\n`
    );
  }
}

main().catch((error) => {
  console.error('❌ Restore misslyckades');
  console.error(error?.message || error);
  process.exit(1);
});
