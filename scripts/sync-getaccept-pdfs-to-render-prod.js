#!/usr/bin/env node
'use strict';

/**
 * Synka GetAccept-PDF:er (secure storage) till Render /var/data/cco-secure-storage.
 *
 *   node scripts/sync-getaccept-pdfs-to-render-prod.js --manifest
 *   node scripts/sync-getaccept-pdfs-to-render-prod.js --upload
 *   node scripts/sync-getaccept-pdfs-to-render-prod.js --verify
 *   node scripts/sync-getaccept-pdfs-to-render-prod.js --all
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { resolveSecureStorageRoot } = require('./lib/halsoHdLocalPdfReader');
const { BASE, getProdToken, fetchProdPatients } = require('./lib/halsoHdProdClient');

const ROOT = path.join(__dirname, '..');
const SERVICE_ID = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';
const SSH_HOST = process.env.RENDER_SSH_HOST || `${SERVICE_ID}@ssh.frankfurt.render.com`;
const SSH_KEY = process.env.RENDER_SSH_KEY || path.join(os.homedir(), '.ssh/id_render');
const REMOTE_DATA = process.env.RENDER_REMOTE_DATA || '/var/data';
const REMOTE_STORAGE = `${REMOTE_DATA}/cco-secure-storage`;
const REMOTE_ASSETS = `${REMOTE_DATA}/cco-patient-assets.json`;
const LOCAL_ASSETS = path.join(ROOT, 'data/cco-patient-assets.json');
const LEGACY_PATH = path.join(ROOT, 'data/cco-legacy-agreements.json');
const STAGING_DIR = path.join(ROOT, 'data/reports/getaccept-render-sync-staging');
const MANIFEST_PATH = path.join(STAGING_DIR, 'getaccept-pdf-rsync-manifest.txt');
const REPORT_PATH = path.join(ROOT, 'data/reports/getaccept-render-sync-report.json');

function sshArgs(extra = []) {
  return ['-i', SSH_KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=60', SSH_HOST, ...extra];
}

async function buildManifest() {
  const assets = JSON.parse(await fs.readFile(LOCAL_ASSETS, 'utf8'));
  const keys = new Set();
  for (const asset of Object.values(assets.items || {})) {
    if (asset?.sourceSystem !== 'getaccept_import') continue;
    const key = String(asset.storageKey || '').trim();
    if (key && key !== 'pending-no-binary') keys.add(key);
  }
  const legacy = JSON.parse(await fs.readFile(LEGACY_PATH, 'utf8'));
  for (const agreement of Object.values(legacy.agreements || {})) {
    const key = String(agreement.pdfStorageKey || '').trim();
    if (key) keys.add(key);
  }
  const lines = [...keys].sort();
  await fs.mkdir(STAGING_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, `${lines.join('\n')}\n`, 'utf8');
  return { fileCount: lines.length, manifestPath: MANIFEST_PATH };
}

async function upload({ storageRoot }) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  execFileSync(
    'ssh',
    sshArgs([
      'mkdir',
      '-p',
      REMOTE_STORAGE,
      `${REMOTE_DATA}/backups/pre-getaccept-pdf-sync-${stamp}`,
    ]),
    {
      stdio: 'inherit',
    }
  );

  console.error('SCP uppdaterad cco-patient-assets.json…');
  execFileSync(
    'scp',
    ['-i', SSH_KEY, '-o', 'BatchMode=yes', LOCAL_ASSETS, `${SSH_HOST}:${REMOTE_ASSETS}`],
    {
      stdio: 'inherit',
    }
  );

  console.error('RSYNC GetAccept-PDF:er (~2.3 GB)…');
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
    sshArgs([`wc -c ${REMOTE_ASSETS}; find ${REMOTE_STORAGE} -type f -name '*.pdf' | wc -l`]),
    { encoding: 'utf8' }
  );
  console.error(remoteCheck.trim());
}

async function verify() {
  const legacy = JSON.parse(await fs.readFile(LEGACY_PATH, 'utf8'));
  const withPdf = Object.values(legacy.agreements || {}).filter(
    (a) => a.pdfStorageKey && a.assetId
  );
  const token = getProdToken();
  const patients = await fetchProdPatients(token);
  const emailToProd = new Map();
  for (const p of patients) {
    const emails = [p.primaryEmail, ...(p.emails || []), p.cliento?.primaryEmail].filter(Boolean);
    for (const e of emails) emailToProd.set(String(e).trim().toLowerCase(), p.id);
  }

  const stickprov = [];
  for (const agreement of withPdf) {
    if (stickprov.length >= 5) break;
    const email = String(agreement.recipients?.[0]?.email || '')
      .trim()
      .toLowerCase();
    const prodId = emailToProd.get(email);
    if (!prodId || !agreement.assetId) continue;
    stickprov.push({
      label: agreement.documentName,
      patientId: prodId,
      assetId: agreement.assetId,
    });
  }

  const results = [];
  for (const row of stickprov) {
    const listRes = await fetch(
      `${BASE}/api/v1/cco/patients/${encodeURIComponent(row.patientId)}/assets`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'x-arcana-client': 'major_arcana_admin',
        },
      }
    );
    const listPayload = await listRes.json().catch(() => ({}));
    const items = Array.isArray(listPayload.items) ? listPayload.items : [];
    const listed = items.some((item) => item.id === row.assetId);

    const dlRes = await fetch(
      `${BASE}/api/v1/cco/assets/${encodeURIComponent(row.assetId)}/download?inline=1`,
      {
        headers: {
          Accept: 'application/pdf,*/*',
          Authorization: `Bearer ${token}`,
          'x-arcana-client': 'major_arcana_admin',
        },
      }
    );
    const buf = dlRes.ok ? Buffer.from(await dlRes.arrayBuffer()) : null;
    const pdfOk = Boolean(buf && buf.length > 1000 && buf.slice(0, 4).toString() === '%PDF');

    results.push({
      ...row,
      assetListedOnPatient: listed,
      downloadStatus: dlRes.status,
      pdfOk,
      pass: listed && pdfOk,
    });
  }

  const report = {
    ok: results.length > 0 && results.every((r) => r.pass),
    verifiedAt: new Date().toISOString(),
    stickprov: results,
  };
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    manifest: false,
    upload: false,
    verify: false,
    all: false,
    storageRoot: resolveSecureStorageRoot(process.env.ARCANA_CCO_SECURE_STORAGE_ROOT || ''),
  };
  for (const token of argv.slice(2)) {
    if (token === '--manifest') args.manifest = true;
    else if (token === '--upload') args.upload = true;
    else if (token === '--verify') args.verify = true;
    else if (token === '--all') args.all = true;
    else if (token === '--storage-root')
      args.storageRoot = path.resolve(argv[argv.indexOf(token) + 1] || '');
  }
  if (args.all) args.manifest = args.upload = args.verify = true;
  if (!args.manifest && !args.upload && !args.verify) args.all = true;
  if (args.all) args.manifest = args.upload = args.verify = true;
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.manifest) {
    const manifest = await buildManifest();
    console.log(JSON.stringify(manifest, null, 2));
  }
  if (args.upload) {
    await fs.access(MANIFEST_PATH).catch(async () => {
      await buildManifest();
    });
    await upload(args);
  }
  if (args.verify) await verify();
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
