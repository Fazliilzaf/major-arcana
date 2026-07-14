#!/usr/bin/env node
'use strict';

/**
 * Backfill pipedrive_import metadata på Render prod (offert / samtycken_avtal).
 * Hämtar prod cco-patient-assets.json via SSH, klassar om via manifest + filnamn,
 * pushar patch via befintlig merge-pipedrive-assets-patch.
 *
 *   node scripts/migration/backfillPipedriveAssetSectionsProd.js --dry-run
 *   node scripts/migration/backfillPipedriveAssetSectionsProd.js --write
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { BASE, getProdToken } = require('../lib/halsoHdProdClient');
const { resolveRenderSshConfig, sshArgs, uploadPipedrivePatch } = require('../lib/renderSshSync');
const {
  classifyPipedriveDocumentKind,
  mapDocumentKindToAssetMeta,
} = require('./lib/pipedriveSmartdocsImport');

const ROOT = path.join(__dirname, '../..');
const STAGING_DIR = path.join(ROOT, 'data/reports/pipedrive-section-backfill-staging');
const PROD_SNAPSHOT = path.join(STAGING_DIR, 'cco-patient-assets-prod.json');
const PATCH_PATH = path.join(STAGING_DIR, 'pipedrive-section-backfill-patch.json');
const REPORT_PATH = path.join(ROOT, 'data/reports/pipedrive-section-backfill-report.json');

const DEFAULT_ICLOUD_ROOT = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/Migration-data'
);
const DEFAULT_MANIFEST = path.join(
  DEFAULT_ICLOUD_ROOT,
  'pipedrive-smartdocs-2026-07-12/manifest.json'
);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    manifestPath: DEFAULT_MANIFEST,
    prodSnapshotPath: PROD_SNAPSHOT,
    verifyLimit: 6,
    restartProd: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--write') args.dryRun = false;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--no-restart') args.restartProd = false;
    else if (token === '--manifest') args.manifestPath = argv[++i];
    else if (token === '--prod-snapshot') args.prodSnapshotPath = argv[++i];
    else if (token === '--verify-limit') args.verifyLimit = Number.parseInt(argv[++i], 10) || 6;
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      '-o',
      'ServerAliveInterval=15',
      '-o',
      'ServerAliveCountMax=20',
      `${cfg.sshHost}:${cfg.remoteAssets}`,
      localPath,
    ],
    { stdio: 'inherit' }
  );
}

function loadManifestIndex(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest saknas: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const byFileId = new Map();
  for (const item of Object.values(manifest.items || {})) {
    const fileId = normalizeText(String(item.fileId || ''));
    if (fileId) byFileId.set(fileId, item);
  }
  return byFileId;
}

function resolveDocumentKindForAsset(asset, manifestByFileId) {
  const sourceRecordId = normalizeText(asset.sourceRecordId);
  const manifestItem = sourceRecordId ? manifestByFileId.get(sourceRecordId) : null;
  const fileName =
    normalizeText(manifestItem?.fileName) ||
    normalizeText(asset.originalFileName) ||
    normalizeText(asset.displayName);
  const fromManifest = manifestItem
    ? classifyPipedriveDocumentKind(manifestItem.fileName || '', manifestItem.description || '')
    : null;
  const fromAsset = classifyPipedriveDocumentKind(
    normalizeText(asset.originalFileName),
    normalizeText(asset.displayName)
  );
  const documentKind =
    fromManifest !== 'other'
      ? fromManifest
      : fromAsset !== 'other'
        ? fromAsset
        : classifyPipedriveDocumentKind(fileName);
  return { documentKind, fileName, manifestItem: Boolean(manifestItem) };
}

function needsMetadataUpdate(asset, targetMeta) {
  return (
    normalizeText(asset.patientCardSection) !== normalizeText(targetMeta.patientCardSection) ||
    normalizeText(asset.category) !== normalizeText(targetMeta.category) ||
    normalizeText(asset.subCategory) !== normalizeText(targetMeta.subCategory) ||
    normalizeText(asset.displayName) !== normalizeText(targetMeta.displayName)
  );
}

function buildBackfillPlan({ prodStore, manifestByFileId }) {
  const patchItems = {};
  const changes = [];
  const stats = {
    pipedriveVisible: 0,
    alreadyCorrect: 0,
    toOffer: 0,
    toAgreement: 0,
    skippedOther: 0,
  };

  for (const asset of Object.values(prodStore.items || {})) {
    if (asset?.sourceSystem !== 'pipedrive_import') continue;
    if (asset.status !== 'VISIBLE_ON_PATIENT_CARD') continue;
    stats.pipedriveVisible += 1;

    const { documentKind, fileName, manifestItem } = resolveDocumentKindForAsset(
      asset,
      manifestByFileId
    );
    if (documentKind === 'other') {
      stats.skippedOther += 1;
      continue;
    }

    const targetMeta = mapDocumentKindToAssetMeta(documentKind);
    if (!needsMetadataUpdate(asset, targetMeta)) {
      stats.alreadyCorrect += 1;
      continue;
    }

    const nextAsset = {
      ...asset,
      ...targetMeta,
      originalFileName: asset.originalFileName || fileName || asset.displayName,
    };
    patchItems[asset.id] = nextAsset;
    if (documentKind === 'offer') stats.toOffer += 1;
    if (documentKind === 'agreement') stats.toAgreement += 1;
    changes.push({
      assetId: asset.id,
      patientId: asset.patientId,
      fileName: fileName || asset.originalFileName || asset.displayName,
      documentKind,
      fromSection: asset.patientCardSection || 'ovrigt',
      toSection: targetMeta.patientCardSection,
      manifestHit: manifestItem,
    });
  }

  return {
    patchItems,
    changes,
    stats: {
      ...stats,
      patchCount: Object.keys(patchItems).length,
    },
  };
}

async function verifyDocumentBundle(token, changes, limit) {
  const agreementPatients = [
    ...new Map(
      changes
        .filter((row) => row.documentKind === 'agreement' && row.patientId)
        .map((row) => [row.patientId, row])
    ).values(),
  ].slice(0, limit);

  const checks = [];
  for (const row of agreementPatients) {
    const res = await fetch(
      `${BASE}/api/v1/cco-patient-master/patient/document-bundle?patientId=${encodeURIComponent(row.patientId)}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'x-arcana-client': 'major_arcana_admin',
        },
      }
    );
    const body = await res.json().catch(() => ({}));
    const health = body?.documents?.healthForms || body?.documents?.haelsoSamtycke || [];
    const pipedriveAgreements = health.filter(
      (doc) => doc?.documentTypeId === 'pipedrive_historical_agreement'
    );
    checks.push({
      patientId: row.patientId,
      fileName: row.fileName,
      bundleStatus: res.status,
      pipedriveAgreementRows: pipedriveAgreements.length,
      pass: res.ok && pipedriveAgreements.length > 0,
    });
  }

  return {
    checked: checks.length,
    pass: checks.filter((row) => row.pass).length,
    checks,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = resolveRenderSshConfig();
  const manifestByFileId = loadManifestIndex(args.manifestPath);

  console.error('Hämtar prod cco-patient-assets.json via SSH…');
  pullProdAssets(cfg, args.prodSnapshotPath);
  const prodStore = JSON.parse(await fsp.readFile(args.prodSnapshotPath, 'utf8'));

  const { patchItems, changes, stats } = buildBackfillPlan({ prodStore, manifestByFileId });
  const payload = {
    schemaVersion: prodStore.schemaVersion,
    sourceSystem: 'pipedrive_import',
    updatedAt: new Date().toISOString(),
    reason: 'pipedrive_section_backfill',
    items: patchItems,
  };

  await fsp.mkdir(STAGING_DIR, { recursive: true });
  await fsp.writeFile(PATCH_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    manifestPath: args.manifestPath,
    prodSnapshotPath: args.prodSnapshotPath,
    patchPath: PATCH_PATH,
    stats,
    sampleChanges: changes.slice(0, 20),
  };

  if (args.dryRun) {
    await fsp.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (stats.patchCount === 0) {
    report.note = 'Ingen patch behövdes — prod metadata redan korrekt.';
    await fsp.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.error(`Pushar patch (${stats.patchCount} assets) till Render prod…`);
  await uploadPipedrivePatch(cfg, PATCH_PATH, {
    mergeScriptPath: path.join(ROOT, 'scripts/merge-pipedrive-assets-patch-fast.js'),
  });

  if (args.restartProd) {
    console.error('Startar om Render prod för att ladda om asset store…');
    report.restart = await restartRenderProd(cfg);
    report.readyz = await waitForProdReady();
    if (!report.readyz.ok) {
      throw new Error('Prod readyz blev inte grön efter restart — verifiera manuellt.');
    }
  } else {
    report.restart = { skipped: true };
    console.error('Hoppar över restart (--no-restart). API kan visa gammal cache tills omstart.');
  }

  const token = getProdToken();
  report.verify = await verifyDocumentBundle(token, changes, args.verifyLimit);
  await fsp.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));

  if (report.verify.checked > 0 && report.verify.pass === 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
