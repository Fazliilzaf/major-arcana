#!/usr/bin/env node
'use strict';

/**
 * Steg 2 — Synka lokal cco-patient-assets.json + m365_halso binärer till Render /var/data.
 * Patchar asset patientId från Phase 1 dedup (prod UUID). Rör INTE patient-master.
 *
 * Framåt: stickprov → Claude → Fazli GO → commit (även när dry-run ser perfekt ut).
 *
 * Usage:
 *   node scripts/sync-halso-assets-to-render-prod.js --prepare
 *   node scripts/sync-halso-assets-to-render-prod.js --upload
 *   node scripts/sync-halso-assets-to-render-prod.js --env-and-restart
 *   node scripts/sync-halso-assets-to-render-prod.js --verify
 *   node scripts/sync-halso-assets-to-render-prod.js --all
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { fetchAllRenderEnvRows, resolveRenderApiKey } = require('./lib/renderEnvApi');
const {
  buildProdAssetStorePayload,
  buildM365RsyncManifest,
  verifyStickprovFilesOnProd,
} = require('./lib/halsoRenderAssetSync');
const { resolveSecureStorageRoot } = require('./lib/halsoHdLocalPdfReader');
const { BASE, getProdToken } = require('./lib/halsoHdProdClient');

const ROOT = path.join(__dirname, '..');
const SERVICE_ID = process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng';
const SSH_HOST = process.env.RENDER_SSH_HOST || `${SERVICE_ID}@ssh.frankfurt.render.com`;
const SSH_KEY = process.env.RENDER_SSH_KEY || path.join(os.homedir(), '.ssh/id_render');
const REMOTE_DATA = process.env.RENDER_REMOTE_DATA || '/var/data';
const REMOTE_ASSETS = `${REMOTE_DATA}/cco-patient-assets.json`;
const REMOTE_STORAGE = `${REMOTE_DATA}/cco-secure-storage`;

const DEFAULT_LOCAL_ASSETS = path.join(ROOT, 'data/cco-patient-assets.json');
const DEFAULT_DEDUP = path.join(ROOT, 'data/reports/halso-hd-phase1-dedup.json');
const STAGING_DIR = path.join(ROOT, 'data/reports/halso-render-sync-staging');
const STAGED_ASSETS = path.join(STAGING_DIR, 'cco-patient-assets.prod-sync.json');
const RSYNC_MANIFEST = path.join(STAGING_DIR, 'm365-halso-rsync-manifest.txt');
const SYNC_REPORT = path.join(ROOT, 'data/reports/halso-render-sync-report.json');

function sshArgs(extra = []) {
  return ['-i', SSH_KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30', SSH_HOST, ...extra];
}

function runStep(name, fn) {
  console.error(`== ${name} ==`);
  return fn();
}

async function prepare({ localAssetsPath, dedupPath, storageRoot }) {
  const { payload, stats } = await buildProdAssetStorePayload({
    localAssetsPath,
    dedupPath,
  });
  await fs.mkdir(STAGING_DIR, { recursive: true });
  await fs.writeFile(STAGED_ASSETS, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const manifest = await buildM365RsyncManifest({
    localAssetsPath,
    outPath: RSYNC_MANIFEST,
  });

  const stagedStat = await fs.stat(STAGED_ASSETS);
  console.error(`Staging: ${STAGED_ASSETS} (${(stagedStat.size / 1e6).toFixed(1)} MB)`);
  console.error(`Manifest: ${manifest.fileCount} m365_halso filer`);
  console.error(`Patchade patientId: ${stats.patchedPatientIds}/${stats.m365Count} m365_halso`);
  console.error(`Lokal storage root: ${storageRoot}`);
  return { stats, manifest, stagedAssetsPath: STAGED_ASSETS };
}

async function upload({ storageRoot }) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  execFileSync(
    'ssh',
    sshArgs(['mkdir', '-p', REMOTE_STORAGE, `${REMOTE_DATA}/backups/pre-halso-sync-${stamp}`]),
    {
      stdio: 'inherit',
    }
  );

  execFileSync(
    'ssh',
    sshArgs([
      `if [ -f ${REMOTE_ASSETS} ]; then cp ${REMOTE_ASSETS} ${REMOTE_DATA}/backups/pre-halso-sync-${stamp}/; fi`,
    ]),
    { stdio: 'inherit' }
  );

  console.error('SCP asset store…');
  execFileSync(
    'scp',
    ['-i', SSH_KEY, '-o', 'BatchMode=yes', STAGED_ASSETS, `${SSH_HOST}:${REMOTE_ASSETS}`],
    {
      stdio: 'inherit',
    }
  );

  console.error('RSYNC m365_halso binärer (~170 MB)…');
  execFileSync(
    'rsync',
    [
      '-avz',
      '--relative',
      '--files-from',
      RSYNC_MANIFEST,
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
      `wc -c ${REMOTE_ASSETS}; find ${REMOTE_STORAGE} -type f | wc -l; du -sh ${REMOTE_STORAGE}`,
    ]),
    { encoding: 'utf8' }
  );
  console.error(remoteCheck.trim());
}

async function envAndRestart() {
  const apiKey = resolveRenderApiKey();
  if (!apiKey) throw new Error('Saknar Render API key (~/.render/cli.yaml)');

  const rows = await fetchAllRenderEnvRows(SERVICE_ID, apiKey);
  const map = new Map(
    rows.map((row) => {
      const ev = row.envVar || row;
      return [ev.key, ev.value ?? ''];
    })
  );
  map.set('ARCANA_CCO_SECURE_STORAGE_ROOT', REMOTE_STORAGE);
  map.set('ARCANA_CCO_PATIENT_ASSETS_PATH', REMOTE_ASSETS);

  const putRes = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/env-vars`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([...map.entries()].map(([key, value]) => ({ key, value }))),
  });
  if (!putRes.ok) {
    throw new Error(`Render env PUT ${putRes.status}: ${(await putRes.text()).slice(0, 200)}`);
  }
  console.error(
    `Env PUT OK (${map.size} nycklar) — ARCANA_CCO_SECURE_STORAGE_ROOT=${REMOTE_STORAGE}`
  );

  const deployRes = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const deployBody = await deployRes.json().catch(() => ({}));
  if (!deployRes.ok) {
    throw new Error(
      `Render deploy ${deployRes.status}: ${JSON.stringify(deployBody).slice(0, 200)}`
    );
  }
  const deployId = deployBody.id || 'ok';
  console.error(`Deploy startad: ${deployId}`);

  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 15000));
    const statusRes = await fetch(
      `https://api.render.com/v1/services/${SERVICE_ID}/deploys/${deployId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      }
    );
    const statusBody = await statusRes.json().catch(() => ({}));
    const deployStatus = statusBody.status || statusBody.deploy?.status || '';
    const ready = await fetch(`${BASE}/readyz`);
    console.error(`… deploy=${deployStatus || '?'} readyz=${ready.status} (${(i + 1) * 15}s)`);
    if (deployStatus === 'live' && ready.ok) {
      console.error(`Deploy live + readyz PASS efter ${(i + 1) * 15}s`);
      return { deployId, readyz: true };
    }
  }
  throw new Error('deploy live/readyz timeout');
}

async function verify() {
  const token = getProdToken();
  const report = await verifyStickprovFilesOnProd({ baseUrl: BASE, token });
  await fs.mkdir(path.dirname(SYNC_REPORT), { recursive: true });
  await fs.writeFile(
    SYNC_REPORT,
    `${JSON.stringify({ ok: report.ok, verifiedAt: new Date().toISOString(), ...report }, null, 2)}\n`,
    'utf8'
  );
  console.log(JSON.stringify(report, null, 2));
  console.error(`Verify-rapport: ${SYNC_REPORT}`);
  if (!report.ok) process.exitCode = 1;
  return report;
}

function parseArgs(argv) {
  const args = {
    prepare: false,
    upload: false,
    envAndRestart: false,
    verify: false,
    all: false,
    localAssetsPath: DEFAULT_LOCAL_ASSETS,
    dedupPath: DEFAULT_DEDUP,
    storageRoot: resolveSecureStorageRoot(process.env.ARCANA_CCO_SECURE_STORAGE_ROOT || ''),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--prepare') args.prepare = true;
    else if (token === '--upload') args.upload = true;
    else if (token === '--env-and-restart') args.envAndRestart = true;
    else if (token === '--verify') args.verify = true;
    else if (token === '--all') args.all = true;
    else if (token === '--assets-path') args.localAssetsPath = path.resolve(argv[++i] || '');
    else if (token === '--dedup') args.dedupPath = path.resolve(argv[++i] || '');
    else if (token === '--storage-root') args.storageRoot = path.resolve(argv[++i] || '');
    else if (token === '--help' || token === '-h') {
      console.log(
        `Usage: node scripts/sync-halso-assets-to-render-prod.js [--prepare|--upload|--env-and-restart|--verify|--all]`
      );
      process.exit(0);
    }
  }
  if (args.all) {
    args.prepare = args.upload = args.envAndRestart = args.verify = true;
  }
  if (!args.prepare && !args.upload && !args.envAndRestart && !args.verify) {
    args.all = true;
    args.prepare = args.upload = args.envAndRestart = args.verify = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.prepare) await runStep('prepare', () => prepare(args));
  if (args.upload) await runStep('upload', () => upload(args));
  if (args.envAndRestart) await runStep('env-and-restart', () => envAndRestart());
  if (args.verify) await runStep('verify', () => verify());
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
