#!/usr/bin/env node
'use strict';

/**
 * Synka pipedrive_import-PDF:er (secure storage) + cco-patient-assets.json till Render prod.
 * Mönster: scripts/sync-getaccept-pdfs-to-render-prod.js
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { resolveSecureStorageRoot } = require('./lib/halsoHdLocalPdfReader');

const ROOT = path.join(__dirname, '..');
const SERVICE_ID = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';
const SSH_HOST = process.env.RENDER_SSH_HOST || `${SERVICE_ID}@ssh.frankfurt.render.com`;
const SSH_KEY = process.env.RENDER_SSH_KEY || path.join(os.homedir(), '.ssh/id_render');
const REMOTE_DATA = process.env.RENDER_REMOTE_DATA || '/var/data';
const REMOTE_STORAGE = `${REMOTE_DATA}/cco-secure-storage`;
const REMOTE_ASSETS = `${REMOTE_DATA}/cco-patient-assets.json`;
const LOCAL_ASSETS = path.join(ROOT, 'data/cco-patient-assets.json');
const STAGING_DIR = path.join(ROOT, 'data/reports/pipedrive-render-sync-staging');
const MANIFEST_PATH = path.join(STAGING_DIR, 'pipedrive-pdf-rsync-manifest.txt');
const REPORT_PATH = path.join(ROOT, 'data/reports/pipedrive-render-sync-report.json');

function sshArgs(extra = []) {
  return ['-i', SSH_KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=60', SSH_HOST, ...extra];
}

async function buildManifest() {
  const assets = JSON.parse(await fs.readFile(LOCAL_ASSETS, 'utf8'));
  const keys = new Set();
  let pipedriveCount = 0;
  for (const asset of Object.values(assets.items || {})) {
    if (asset?.sourceSystem !== 'pipedrive_import') continue;
    pipedriveCount += 1;
    const key = String(asset.storageKey || '').trim();
    if (key && key !== 'pending-no-binary') keys.add(key);
  }
  const lines = [...keys].sort();
  await fs.mkdir(STAGING_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, `${lines.join('\n')}\n`, 'utf8');
  return {
    fileCount: lines.length,
    pipedriveAssetCount: pipedriveCount,
    manifestPath: MANIFEST_PATH,
  };
}

async function upload({ storageRoot }) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  execFileSync(
    'ssh',
    sshArgs([
      'mkdir',
      '-p',
      REMOTE_STORAGE,
      `${REMOTE_DATA}/backups/pre-pipedrive-pdf-sync-${stamp}`,
    ]),
    { stdio: 'inherit' }
  );

  console.error('SCP uppdaterad cco-patient-assets.json…');
  execFileSync(
    'scp',
    ['-i', SSH_KEY, '-o', 'BatchMode=yes', LOCAL_ASSETS, `${SSH_HOST}:${REMOTE_ASSETS}`],
    { stdio: 'inherit' }
  );

  console.error('RSYNC pipedrive_import-PDF:er…');
  execFileSync(
    'rsync',
    [
      '-avz',
      '--relative',
      '--files-from',
      MANIFEST_PATH,
      '-e',
      `ssh -i ${SSH_KEY} -o BatchMode=yes`,
      `${storageRoot.replace(/\/$/, '')}/`,
      `${SSH_HOST}:${REMOTE_STORAGE}/`,
    ],
    { stdio: 'inherit' }
  );

  const remoteCheck = execFileSync(
    'ssh',
    sshArgs([
      `wc -c ${REMOTE_ASSETS}; find ${REMOTE_STORAGE}/pipedrive-import -type f 2>/dev/null | wc -l`,
    ]),
    { encoding: 'utf8' }
  );
  console.error(remoteCheck.trim());
}

async function verify() {
  const assets = JSON.parse(await fs.readFile(LOCAL_ASSETS, 'utf8'));
  const pipedrive = Object.values(assets.items || {}).filter(
    (a) => a?.sourceSystem === 'pipedrive_import' && a.storageKey
  );
  const sample = pipedrive.slice(0, 5);
  const checks = [];
  for (const asset of sample) {
    const remotePath = `${REMOTE_STORAGE}/${asset.storageKey}`;
    const out = execFileSync('ssh', sshArgs([`test -f ${remotePath} && echo OK || echo MISSING`]), {
      encoding: 'utf8',
    }).trim();
    checks.push({ assetId: asset.id, storageKey: asset.storageKey, remote: out });
  }
  const report = {
    verifiedAt: new Date().toISOString(),
    pipedriveAssets: pipedrive.length,
    sampleChecks: checks,
    allSampleOk: checks.every((c) => c.remote === 'OK'),
  };
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  const mode = process.argv[2] || '--manifest';
  const storageRoot = resolveSecureStorageRoot(process.env.ARCANA_CCO_SECURE_STORAGE_ROOT || '');

  if (mode === '--manifest') {
    const result = await buildManifest();
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (mode === '--upload') {
    await buildManifest();
    await upload({ storageRoot });
    return;
  }
  if (mode === '--verify') {
    const report = await verify();
    if (!report.allSampleOk) process.exit(1);
    return;
  }
  if (mode === '--all') {
    const manifest = await buildManifest();
    console.log(JSON.stringify(manifest, null, 2));
    await upload({ storageRoot });
    const report = await verify();
    if (!report.allSampleOk) process.exit(1);
    return;
  }
  console.error(
    'Usage: node scripts/sync-pipedrive-pdfs-to-render-prod.js [--manifest|--upload|--verify|--all]'
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
