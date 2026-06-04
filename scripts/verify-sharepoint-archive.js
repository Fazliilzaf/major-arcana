#!/usr/bin/env node
'use strict';

/**
 * C4 — Verifiera SharePoint-arkiv mot GitHub source of truth.
 *
 * Usage:
 *   npm run verify:sharepoint-archive
 *   npm run migration:sync-sharepoint && npm run verify:sharepoint-archive
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function resolveManifestPath() {
  const candidates = [
    process.env.ARCANA_SHAREPOINT_MANIFEST_PATH,
    path.join(REPO_ROOT, 'docs', 'migration', 'sharepoint-manifest.json'),
    path.join(REPO_ROOT, '..', 'MA-Archive', 'sharepoint', 'manifest.json'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function resolveArchiveRoot(manifestPath) {
  if (process.env.MA_ARCHIVE_SHAREPOINT_ROOT) {
    return process.env.MA_ARCHIVE_SHAREPOINT_ROOT;
  }
  const sibling = path.join(path.dirname(manifestPath), '..');
  if (fs.existsSync(path.join(sibling, 'markdown'))) return sibling;
  return path.join(REPO_ROOT, '..', 'MA-Archive', 'sharepoint');
}

function main() {
  let hardFail = false;
  const manifestPath = resolveManifestPath();
  if (!fs.existsSync(manifestPath)) {
    record('C4 manifest', false, manifestPath);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  record('C4 manifest', true, manifestPath);

  let githubOk = 0;
  for (const file of files) {
    const githubPath = path.join(REPO_ROOT, file.githubPath || '');
    const ok = fs.existsSync(githubPath);
    if (!record(`C4 github ${file.id}`, ok, file.githubPath)) hardFail = true;
    else githubOk += 1;
  }

  const archiveRoot = resolveArchiveRoot(manifestPath);
  const archiveExists = fs.existsSync(archiveRoot);
  record('C4 archive root', archiveExists, archiveRoot);
  if (!archiveExists) {
    console.log('Tips: kör npm run migration:sync-sharepoint');
  }

  if (archiveExists) {
    let archiveOk = 0;
    const withArchivePath = files.filter((file) => file.archivePath);
    for (const file of withArchivePath) {
      const archivePath = path.join(archiveRoot, file.archivePath);
      if (fs.existsSync(archivePath)) {
        record(`C4 archive ${file.id}`, true, file.archivePath);
        archiveOk += 1;
      } else {
        record(`C4 archive ${file.id}`, false, `${file.archivePath} saknas — kör sync`);
        hardFail = true;
      }
    }
    if (withArchivePath.length) {
      record(
        'C4 archive coverage',
        archiveOk === withArchivePath.length,
        `${archiveOk}/${withArchivePath.length}`
      );
    }
  }

  const syncScript = path.join(REPO_ROOT, 'scripts', 'sync-sharepoint-archive.sh');
  if (process.argv.includes('--sync')) {
    console.log('\nKör sync-sharepoint-archive.sh …');
    const result = spawnSync('bash', [syncScript], { stdio: 'inherit', cwd: REPO_ROOT });
    if (result.status !== 0) hardFail = true;
  }

  record('C4 github source files', githubOk === files.length, `${githubOk}/${files.length}`);

  if (hardFail) {
    console.error('\n❌ SharePoint archive verify misslyckades');
    process.exit(1);
  }
  console.log('\n✅ SharePoint archive verify klar');
}

main();
