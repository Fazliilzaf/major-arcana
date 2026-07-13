#!/usr/bin/env node
'use strict';

/**
 * Synka pipedrive_import-PDF:er (secure storage) + asset-patch till Render prod.
 * Batchad rsync + retry — Render SSH tappar långa sessioner.
 *
 * Usage:
 *   node scripts/sync-pipedrive-pdfs-to-render-prod.js --prepare
 *   node scripts/sync-pipedrive-pdfs-to-render-prod.js --upload [--skip-assets] [--batch-size N]
 *   node scripts/sync-pipedrive-pdfs-to-render-prod.js --verify
 *   node scripts/sync-pipedrive-pdfs-to-render-prod.js --all
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { resolveSecureStorageRoot } = require('./lib/halsoHdLocalPdfReader');
const { BASE, getProdToken } = require('./lib/halsoHdProdClient');
const { buildPipedrivePatchPayload } = require('./lib/pipedriveRenderAssetSync');
const {
  resolveRenderSshConfig,
  sshArgs,
  runWithRetry,
  uploadAssetsJson,
  uploadPipedrivePatch,
  scpManifestBatched,
  tarManifestBatched,
  rsyncManifestBatched,
} = require('./lib/renderSshSync');

const ROOT = path.join(__dirname, '..');
const LOCAL_ASSETS = path.join(ROOT, 'data/cco-patient-assets.json');
const STAGING_DIR = path.join(ROOT, 'data/reports/pipedrive-render-sync-staging');
const LOCAL_PDF_STAGE = path.join(STAGING_DIR, 'local-pdf-stage');
const PATCH_PATH = path.join(STAGING_DIR, 'pipedrive-assets-patch.json');
const MANIFEST_PATH = path.join(STAGING_DIR, 'pipedrive-pdf-rsync-manifest.txt');
const PROGRESS_PATH = path.join(STAGING_DIR, 'pipedrive-pdf-upload-progress.json');
const REPORT_PATH = path.join(ROOT, 'data/reports/pipedrive-render-sync-report.json');

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

async function stageLocalPdfs({
  storageRoot,
  manifestPath = MANIFEST_PATH,
  outRoot = LOCAL_PDF_STAGE,
} = {}) {
  const raw = await fs.readFile(manifestPath, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let copied = 0;
  let skipped = 0;
  for (const rel of lines) {
    const src = path.join(storageRoot, rel);
    const dest = path.join(outRoot, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fs.access(dest);
      skipped += 1;
    } catch {
      await fs.copyFile(src, dest);
      copied += 1;
    }
  }
  return { outRoot, fileCount: lines.length, copied, skipped };
}

async function prepare({ localAssetsPath = LOCAL_ASSETS, storageRoot } = {}) {
  const manifest = await buildManifest();
  const { payload, stats } = await buildPipedrivePatchPayload({ localAssetsPath });
  await fs.mkdir(STAGING_DIR, { recursive: true });
  await fs.writeFile(PATCH_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const patchStat = await fs.stat(PATCH_PATH);
  const stage = storageRoot
    ? await stageLocalPdfs({ storageRoot, manifestPath: MANIFEST_PATH })
    : null;
  return {
    ...manifest,
    patchPath: PATCH_PATH,
    patchBytes: patchStat.size,
    patchStats: stats,
    localStage: stage,
  };
}

async function upload({
  storageRoot,
  batchSize = 5,
  skipAssets = false,
  usePatch = true,
  transport = 'scp',
  useLocalStage = true,
}) {
  const cfg = resolveRenderSshConfig();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  let uploadRoot = storageRoot;
  if (useLocalStage) {
    try {
      await fs.access(LOCAL_PDF_STAGE);
      uploadRoot = LOCAL_PDF_STAGE;
      console.error(`Använder lokal staging: ${uploadRoot}`);
    } catch {
      console.error(
        'Lokal staging saknas — kör --prepare först eller stäng av med --no-local-stage'
      );
    }
  }

  await runWithRetry('ssh mkdir', () => {
    execFileSync(
      'ssh',
      sshArgs(cfg, [
        'mkdir',
        '-p',
        cfg.remoteStorage,
        `${cfg.remoteData}/backups/pre-pipedrive-pdf-sync-${stamp}`,
      ]),
      { stdio: 'inherit' }
    );
  });

  if (!skipAssets) {
    if (usePatch) {
      await fs.access(PATCH_PATH).catch(async () => {
        await prepare();
      });
      console.error('SCP + merge pipedrive asset-patch (~4 MB)…');
      await uploadPipedrivePatch(cfg, PATCH_PATH);
    } else {
      console.error('SCP uppdaterad cco-patient-assets.json…');
      await uploadAssetsJson(cfg, LOCAL_ASSETS);
    }
  } else {
    console.error('Hoppar över assets-json (redan på prod).');
  }

  console.error(`RSYNC pipedrive_import-PDF:er (${transport}, batchat)…`);
  const rsyncStats =
    transport === 'rsync'
      ? await rsyncManifestBatched(cfg, {
          storageRoot: uploadRoot,
          manifestPath: MANIFEST_PATH,
          batchSize,
          ignoreExisting: true,
        })
      : transport === 'tar'
        ? await tarManifestBatched(cfg, {
            storageRoot: uploadRoot,
            manifestPath: MANIFEST_PATH,
            batchSize,
            missingOnly: false,
            stagingDir: STAGING_DIR,
            progressPath: PROGRESS_PATH,
          })
        : await scpManifestBatched(cfg, {
            storageRoot: uploadRoot,
            manifestPath: MANIFEST_PATH,
            batchSize,
            stagingDir: STAGING_DIR,
            progressPath: PROGRESS_PATH,
          });

  const remoteCheck = await runWithRetry('remote file count', () =>
    execFileSync(
      'ssh',
      sshArgs(cfg, [
        `node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('${cfg.remoteAssets}','utf8'));let keys=new Set();for(const x of Object.values(a.items||{})){if(x.sourceSystem!=='pipedrive_import')continue;const k=String(x.storageKey||'').trim();if(k&&k!=='pending-no-binary')keys.add(k);}let present=0,missing=0;for(const k of keys){if(fs.existsSync('${cfg.remoteStorage}/'+k))present++;else missing++;}console.log(JSON.stringify({pipedriveKeys:keys.size,present,missing}));"`,
      ]),
      { encoding: 'utf8' }
    )
  );
  console.error(remoteCheck.trim());
  return rsyncStats;
}

async function verifyViaHttp() {
  const assets = JSON.parse(await fs.readFile(LOCAL_ASSETS, 'utf8'));
  const pipedrive = Object.values(assets.items || {}).filter(
    (a) =>
      a?.sourceSystem === 'pipedrive_import' &&
      a.storageKey &&
      a.status === 'VISIBLE_ON_PATIENT_CARD' &&
      a.patientId &&
      a.patientId !== 'unknown'
  );
  const token = getProdToken();
  const sample = pipedrive.slice(0, 12);
  const checks = [];

  for (const asset of sample) {
    const dlRes = await fetch(
      `${BASE}/api/v1/cco/assets/${encodeURIComponent(asset.id)}/download?inline=1`,
      {
        headers: {
          Accept: 'application/pdf,*/*',
          Authorization: `Bearer ${token}`,
          'x-arcana-client': 'major_arcana_admin',
        },
      }
    );
    const buf = dlRes.ok ? Buffer.from(await dlRes.arrayBuffer()) : null;
    const pdfOk = Boolean(buf && buf.length > 500 && buf.slice(0, 4).toString() === '%PDF');
    checks.push({
      assetId: asset.id,
      patientId: asset.patientId,
      storageKey: asset.storageKey,
      downloadStatus: dlRes.status,
      pdfOk,
      pass: dlRes.ok && pdfOk,
    });
  }

  const report = {
    verifiedAt: new Date().toISOString(),
    verifyMethod: 'http_asset_download',
    pipedriveAssets: pipedrive.length,
    sampleChecks: checks,
    allSampleOk: checks.length > 0 && checks.every((c) => c.pass),
  };
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  return report;
}

function parseArgs(argv) {
  const args = {
    mode: '--all',
    batchSize: 5,
    skipAssets: false,
    usePatch: true,
    transport: 'tar',
    useLocalStage: true,
    storageRoot: resolveSecureStorageRoot(process.env.ARCANA_CCO_SECURE_STORAGE_ROOT || ''),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--manifest') args.mode = '--manifest';
    else if (token === '--prepare') args.mode = '--prepare';
    else if (token === '--upload') args.mode = '--upload';
    else if (token === '--verify') args.mode = '--verify';
    else if (token === '--all') args.mode = '--all';
    else if (token === '--skip-assets') args.skipAssets = true;
    else if (token === '--full-assets') args.usePatch = false;
    else if (token === '--rsync') args.transport = 'rsync';
    else if (token === '--tar') args.transport = 'tar';
    else if (token === '--scp') args.transport = 'scp';
    else if (token === '--no-local-stage') args.useLocalStage = false;
    else if (token === '--stage-local') args.mode = '--stage-local';
    else if (token === '--batch-size') args.batchSize = Number.parseInt(argv[++i], 10) || 5;
    else if (token === '--storage-root') args.storageRoot = path.resolve(argv[++i]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.mode === '--manifest') {
    console.log(JSON.stringify(await buildManifest(), null, 2));
    return;
  }
  if (args.mode === '--stage-local') {
    await fs.access(MANIFEST_PATH).catch(() => buildManifest());
    console.log(JSON.stringify(await stageLocalPdfs({ storageRoot: args.storageRoot }), null, 2));
    return;
  }
  if (args.mode === '--prepare') {
    console.log(JSON.stringify(await prepare({ storageRoot: args.storageRoot }), null, 2));
    return;
  }
  if (args.mode === '--upload') {
    await fs.access(MANIFEST_PATH).catch(() => buildManifest());
    await upload({
      storageRoot: args.storageRoot,
      batchSize: args.batchSize,
      skipAssets: args.skipAssets,
      usePatch: args.usePatch,
      transport: args.transport,
      useLocalStage: args.useLocalStage,
    });
    return;
  }
  if (args.mode === '--verify') {
    const report = await verifyViaHttp();
    if (!report.allSampleOk) process.exit(1);
    return;
  }
  if (args.mode === '--all') {
    console.log(JSON.stringify(await prepare({ storageRoot: args.storageRoot }), null, 2));
    await upload({
      storageRoot: args.storageRoot,
      batchSize: args.batchSize,
      skipAssets: args.skipAssets,
      usePatch: args.usePatch,
      transport: args.transport,
      useLocalStage: args.useLocalStage,
    });
    const report = await verifyViaHttp();
    if (!report.allSampleOk) process.exit(1);
    return;
  }
  console.error(
    'Usage: node scripts/sync-pipedrive-pdfs-to-render-prod.js [--prepare|--manifest|--upload|--verify|--all] [--batch-size N] [--skip-assets] [--full-assets]'
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
