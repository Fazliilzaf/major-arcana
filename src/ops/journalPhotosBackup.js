'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

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

async function createJournalPhotosBackup({ sourceDir, backupRoot }) {
  const root = String(sourceDir || '').trim();
  if (!root) {
    throw new Error('journalPhotosDir saknas.');
  }
  await fs.access(root);
  const { fileCount, totalBytes } = await summarizeDir(root);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(String(backupRoot || ''), 'journal-photos');
  await fs.mkdir(backupDir, { recursive: true });
  const archivePath = path.join(backupDir, `journal-photos-${stamp}.tar.gz`);
  const parent = path.dirname(root);
  const base = path.basename(root);
  await execFileAsync('tar', ['-czf', archivePath, '-C', parent, base]);
  const stat = await fs.stat(archivePath);
  return {
    archivePath,
    sourceDir: root,
    fileCount,
    sourceBytes: totalBytes,
    archiveBytes: stat.size,
  };
}

module.exports = {
  createJournalPhotosBackup,
  summarizeDir,
};
