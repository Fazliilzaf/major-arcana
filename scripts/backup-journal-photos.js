#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const { config } = require('../src/config');

async function summarizeDir(dir) {
  let fileCount = 0;
  let totalBytes = 0;
  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      fileCount += 1;
      const stat = await fs.stat(fullPath);
      totalBytes += Number(stat.size || 0);
    }
  }
  await walk(dir);
  return { fileCount, totalBytes };
}

async function main() {
  const sourceDir = String(config.journalPhotosDir || '').trim();
  if (!sourceDir) {
    throw new Error('journalPhotosDir saknas (sätt ARCANA_JOURNAL_PHOTOS_DIR eller stateRoot).');
  }

  await fs.access(sourceDir);
  const { fileCount, totalBytes } = await summarizeDir(sourceDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(
    config.backupDir || path.join(config.stateRoot, 'backups'),
    'journal-photos'
  );
  await fs.mkdir(backupDir, { recursive: true });
  const archivePath = path.join(backupDir, `journal-photos-${stamp}.tar.gz`);
  const parent = path.dirname(sourceDir);
  const base = path.basename(sourceDir);

  await execFileAsync('tar', ['-czf', archivePath, '-C', parent, base]);

  const stat = await fs.stat(archivePath);
  process.stdout.write(`✅ Journal photo backup: ${archivePath}\n`);
  process.stdout.write(`   Källa: ${sourceDir}\n`);
  process.stdout.write(`   Filer: ${fileCount}\n`);
  process.stdout.write(`   Storlek källa: ${totalBytes} bytes\n`);
  process.stdout.write(`   Arkiv: ${stat.size} bytes\n`);
  process.stdout.write(`\nRestore:\n`);
  process.stdout.write(`tar -xzf "${archivePath}" -C "${parent}"\n`);
}

main().catch((error) => {
  console.error('❌ Journal photo backup misslyckades');
  console.error(error?.message || error);
  process.exit(1);
});
