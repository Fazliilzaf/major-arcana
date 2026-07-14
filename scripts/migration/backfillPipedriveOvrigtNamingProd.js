#!/usr/bin/env node
'use strict';

/**
 * Backfill visningsnamn för pipedrive_import smartdocs (ovrigt) på Render prod.
 *
 *   node scripts/migration/backfillPipedriveOvrigtNamingProd.js --dry-run
 *   node scripts/migration/backfillPipedriveOvrigtNamingProd.js --write
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { BASE, getProdToken } = require('../lib/halsoHdProdClient');
const { resolveRenderSshConfig, uploadPipedrivePatch } = require('../lib/renderSshSync');
const { buildPipedriveOvrigtDisplayMeta } = require('./lib/pipedriveSmartdocsImport');

const ROOT = path.join(__dirname, '../..');
const STAGING_DIR = path.join(ROOT, 'data/reports/pipedrive-ovrigt-naming-staging');
const PROD_SNAPSHOT = path.join(STAGING_DIR, 'cco-patient-assets-prod.json');
const PATCH_PATH = path.join(STAGING_DIR, 'pipedrive-ovrigt-naming-patch.json');
const REPORT_PATH = path.join(ROOT, 'data/reports/pipedrive-ovrigt-naming-report.json');

const GENERIC_NAMES = new Set(['pipedrive-dokument', 'pipedrive smartdoc', 'pipedrive smartdoc ·']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    prodSnapshotPath: PROD_SNAPSHOT,
    restartProd: true,
    verifyPatientId: '59233beb-4d70-416e-b78b-3120972067f2',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--write') args.dryRun = false;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--no-restart') args.restartProd = false;
    else if (token === '--prod-snapshot') args.prodSnapshotPath = argv[++i];
    else if (token === '--verify-patient') args.verifyPatientId = argv[++i];
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pullProdAssets(cfg, localPath) {
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  execFileSync(
    'scp',
    [
      '-i',
      cfg.sshKey,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=120',
      `${cfg.sshHost}:${cfg.remoteAssets}`,
      localPath,
    ],
    { stdio: 'inherit' }
  );
}

async function restartRenderProd(cfg) {
  try {
    execFileSync('render', ['restart', cfg.serviceId, '--confirm'], { stdio: 'inherit' });
    return true;
  } catch {
    console.error('render CLI saknas — starta om manuellt efter patch.');
    return false;
  }
}

async function waitForProdReady({ attempts = 12, delayMs = 10000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`${BASE}/readyz`, { headers: { Accept: 'application/json' } });
      if (res.ok) return { ok: true, attempt };
    } catch {
      // retry
    }
    console.error(`Väntar på prod readyz (${attempt}/${attempts})…`);
    await sleep(delayMs);
  }
  return { ok: false, attempt: attempts };
}

function isOvrigtSmartdoc(asset) {
  if (asset?.sourceSystem !== 'pipedrive_import') return false;
  if (!['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(asset.status)) return false;
  const section = normalizeText(asset.patientCardSection).toLowerCase();
  return section === 'ovrigt' || section === '' || section === 'other';
}

function needsNamingUpdate(asset, targetMeta) {
  const currentName = normalizeText(asset.displayName).toLowerCase();
  if (!GENERIC_NAMES.has(currentName) && !currentName.startsWith('pipedrive-dokument')) {
    if (normalizeText(asset.displayName) === normalizeText(targetMeta.displayName)) return false;
    if (currentName.startsWith('smartdoc ·')) return false;
  }
  return (
    normalizeText(asset.displayName) !== normalizeText(targetMeta.displayName) ||
    normalizeText(asset.documentTitle) !== normalizeText(targetMeta.documentTitle) ||
    normalizeText(asset.visitLabel) !== normalizeText(targetMeta.visitLabel) ||
    normalizeText(asset.subCategory) !== normalizeText(targetMeta.subCategory)
  );
}

function buildNamingPlan(prodStore) {
  const patchItems = {};
  const changes = [];
  const stats = { candidates: 0, patchCount: 0, skippedCustom: 0 };

  for (const asset of Object.values(prodStore.items || {})) {
    if (!isOvrigtSmartdoc(asset)) continue;
    stats.candidates += 1;
    const fileName = normalizeText(asset.originalFileName) || normalizeText(asset.displayName);
    const targetMeta = buildPipedriveOvrigtDisplayMeta(fileName, asset.documentDate);
    if (!needsNamingUpdate(asset, targetMeta)) {
      stats.skippedCustom += 1;
      continue;
    }
    const docDate =
      targetMeta.captureDate || normalizeText(asset.documentDate).slice(0, 10) || null;
    patchItems[asset.id] = {
      ...asset,
      ...targetMeta,
      documentDate: docDate || asset.documentDate || null,
    };
    stats.patchCount += 1;
    changes.push({
      assetId: asset.id,
      patientId: asset.patientId,
      from: asset.displayName,
      to: targetMeta.displayName,
      visitLabel: targetMeta.visitLabel,
    });
  }

  return { patchItems, changes, stats };
}

async function verifyPatientAssets(token, patientId) {
  const res = await fetch(`${BASE}/api/v1/cco/patients/${encodeURIComponent(patientId)}/assets`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
  });
  const body = await res.json().catch(() => ({}));
  const rows = (body?.items || body?.assets || []).filter(
    (row) =>
      row?.sourceSystem === 'pipedrive_import' &&
      normalizeText(row.patientCardSection).toLowerCase() === 'ovrigt'
  );
  const smartdocLabels = rows.filter((row) =>
    String(row.fileName || row.displayName || row.name || '')
      .toLowerCase()
      .startsWith('smartdoc ·')
  );
  return {
    status: res.status,
    ovrigtCount: rows.length,
    smartdocLabelCount: smartdocLabels.length,
    sample: rows.slice(0, 3).map((row) => ({
      displayName: row.fileName || row.displayName || row.name,
      visitLabel: row.visitLabel,
      timelineDate: row.timelineDate,
    })),
    pass: res.ok && rows.length > 0 && smartdocLabels.length > 0,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = resolveRenderSshConfig();

  console.error('Hämtar prod cco-patient-assets.json via SSH…');
  pullProdAssets(cfg, args.prodSnapshotPath);
  const prodStore = JSON.parse(await fsp.readFile(args.prodSnapshotPath, 'utf8'));
  const { patchItems, changes, stats } = buildNamingPlan(prodStore);

  const payload = {
    schemaVersion: prodStore.schemaVersion,
    sourceSystem: 'pipedrive_import',
    updatedAt: new Date().toISOString(),
    reason: 'pipedrive_ovrigt_naming_backfill',
    items: patchItems,
  };

  await fsp.mkdir(STAGING_DIR, { recursive: true });
  await fsp.writeFile(PATCH_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    stats,
    sampleChanges: changes.slice(0, 15),
  };

  if (args.dryRun) {
    await fsp.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (stats.patchCount === 0) {
    report.note = 'Ingen naming-patch behövdes.';
    await fsp.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.error(`Pushar naming-patch (${stats.patchCount} assets)…`);
  await uploadPipedrivePatch(cfg, PATCH_PATH, {
    mergeScriptPath: path.join(ROOT, 'scripts/merge-pipedrive-assets-patch-fast.js'),
  });

  if (args.restartProd) {
    console.error('Startar om Render prod…');
    report.restart = await restartRenderProd(cfg);
    report.readyz = await waitForProdReady();
  }

  const token = getProdToken();
  report.verify = await verifyPatientAssets(token, args.verifyPatientId);
  await fsp.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));

  if (!report.verify.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
