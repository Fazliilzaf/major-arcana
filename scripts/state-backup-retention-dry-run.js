#!/usr/bin/env node
/**
 * Torrkörning av retentionsregeln för engångsbackuper.
 *
 * Raderar ingenting. Listar vad startsvepet SKULLE ta vid nästa omstart, och
 * vad det skulle behålla, så att beslutet fattas på en lista med filnamn i
 * stället för på en regex man litar på.
 *
 * Kör i Render Web Shell:
 *   node scripts/state-backup-retention-dry-run.js
 *   node scripts/state-backup-retention-dry-run.js --days 14
 */

const path = require('node:path');

const { config } = require('../src/config');
const { pruneRetainableBackupsInDirectory } = require('../src/ops/startupDiskGuard');

const DAY_MS = 24 * 60 * 60 * 1000;

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const raw = process.argv[index + 1];
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function mb(bytes) {
  return (Number(bytes || 0) / (1024 * 1024)).toFixed(1);
}

function rad(item) {
  return `  ${String(mb(item.sizeBytes)).padStart(9)} MB  ${String(item.ageDays).padStart(6)} d  ${
    item.filePath
  }`;
}

async function main() {
  const days = argValue('days', Number(config.startupStateBackupRetentionDays) || 30);
  const directories = [...new Set([config.stateRoot, config.backupDir, config.reportsDir])]
    .filter(Boolean)
    .map((dir) => path.resolve(dir));

  console.log(`Retention: ${days} dagar. Torrkörning — ingenting raderas.`);
  console.log(`Kataloger: ${directories.join(', ')}\n`);

  const allaKandidater = [];
  const allaBehallna = [];

  for (const directoryPath of directories) {
    try {
      const { deleted, kept } = await pruneRetainableBackupsInDirectory({
        directoryPath,
        olderThanMs: days * DAY_MS,
        dryRun: true,
      });
      allaKandidater.push(...deleted);
      allaBehallna.push(...kept);
    } catch (error) {
      console.error(`  FEL i ${directoryPath}: ${error?.message || error}`);
    }
  }

  allaKandidater.sort((a, b) => Number(b.sizeBytes) - Number(a.sizeBytes));
  allaBehallna.sort((a, b) => Number(b.sizeBytes) - Number(a.sizeBytes));

  const summa = allaKandidater.reduce((acc, item) => acc + Number(item.sizeBytes || 0), 0);
  const summaBehallen = allaBehallna.reduce((acc, item) => acc + Number(item.sizeBytes || 0), 0);

  console.log(`SKULLE RADERAS — ${allaKandidater.length} filer, ${mb(summa)} MB`);
  if (allaKandidater.length === 0) console.log('  (inga)');
  for (const item of allaKandidater) console.log(rad(item));

  console.log(
    `\nBEHÅLLS (yngre än ${days} d) — ${allaBehallna.length} filer, ${mb(summaBehallen)} MB`
  );
  if (allaBehallna.length === 0) console.log('  (inga)');
  for (const item of allaBehallna) console.log(rad(item));

  console.log('\nGranska listan ovan innan regeln får radera skarpt.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
