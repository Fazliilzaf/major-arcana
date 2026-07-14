#!/usr/bin/env node
'use strict';

/**
 * Apply encounter-länkar för pipedrive smartdocs på Render prod.
 *
 *   node scripts/migration/applyPipedriveEncounterLinksProd.js --dry-run
 *   node scripts/migration/applyPipedriveEncounterLinksProd.js --write
 *   node scripts/migration/applyPipedriveEncounterLinksProd.js --write --patient-id <uuid>
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const { BASE } = require('../lib/halsoHdProdClient');
const { resolveRenderSshConfig } = require('../lib/renderSshSync');
const {
  isPipedriveSmartdocAsset,
  buildEncounterLinkRepairPlan,
} = require('../../src/ops/ccoEncounterLinkRepair');
const { uploadPipedrivePatch } = require('../lib/renderSshSync');

const ROOT = path.join(__dirname, '../..');
const STAGING_DIR = path.join(ROOT, 'data/reports/pipedrive-encounter-links-staging');
const PROD_SNAPSHOT = path.join(STAGING_DIR, 'cco-patient-assets-prod.json');
const REPORT_PATH = path.join(ROOT, 'data/reports/pipedrive-encounter-links-apply.json');
const CHECKPOINT_PATH = path.join(
  ROOT,
  'data/reports/pipedrive-encounter-links-apply.checkpoint.json'
);
const PATCH_PATH = path.join(STAGING_DIR, 'pipedrive-encounter-links-patch.json');
const CONFIRM_TEXT = 'REPAIR ENCOUNTER LINKS';

function parseArgs(argv) {
  const args = {
    dryRun: true,
    patientIds: [],
    batchSize: 10,
    prodSnapshotPath: PROD_SNAPSHOT,
    refreshSnapshot: true,
    maxPatients: null,
    retries: 5,
    resume: false,
    batchDelayMs: 2500,
    sshWrite: false,
    sshDryRun: false,
    restartProd: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--write') args.dryRun = false;
    else if (token === '--ssh-write') {
      args.dryRun = false;
      args.sshWrite = true;
    } else if (token === '--ssh-dry-run') {
      args.dryRun = true;
      args.sshWrite = true;
    } else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--patient-id') args.patientIds.push(String(argv[++i] || '').trim());
    else if (token === '--batch-size') args.batchSize = Math.max(1, Number(argv[++i]) || 10);
    else if (token === '--batch-delay-ms') args.batchDelayMs = Math.max(0, Number(argv[++i]) || 0);
    else if (token === '--max-patients') args.maxPatients = Math.max(1, Number(argv[++i]) || 1);
    else if (token === '--no-refresh') args.refreshSnapshot = false;
    else if (token === '--prod-snapshot') args.prodSnapshotPath = argv[++i];
    else if (token === '--retries') args.retries = Math.max(1, Number(argv[++i]) || 5);
    else if (token === '--no-restart') args.restartProd = false;
    else if (token === '--resume') args.resume = true;
    else if (token === '--help' || token === '-h') {
      console.log(`Usage: node scripts/migration/applyPipedriveEncounterLinksProd.js [options]

Options:
  --dry-run             Förhandskörning via repair-encounter-links (default)
  --write               Skarp körning via prod API
  --ssh-write           Skarp körning via SSH-patch (bulk, undviker API 502)
  --patient-id ID       Begränsa till patient; upprepa för flera
  --batch-size N        Patienter per API-anrop (default 10)
  --batch-delay-ms N    Paus mellan batchar (default 2500)
  --max-patients N      Cap för pilot
  --resume              Fortsätt från checkpoint-fil
  --no-refresh          Använd befintlig prod-snapshot
  --no-restart          Hoppa över Render restart efter SSH-patch
  --prod-snapshot PATH  Egen snapshot-fil
  --retries N           Retries per batch (default 5)
`);
      process.exit(0);
    }
  }
  args.patientIds = [...new Set(args.patientIds.filter(Boolean))];
  return args;
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
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

function loadAssetsSnapshot(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) fail(`Snapshot saknas: ${snapshotPath}`);
  const parsed = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  if (Array.isArray(parsed?.assets)) return parsed.assets;
  if (Array.isArray(parsed)) return parsed;
  if (parsed?.items && typeof parsed.items === 'object') return Object.values(parsed.items);
  return [];
}

function collectTargetPatientIds(assets, { patientIds = [], maxPatients = null } = {}) {
  const scope = patientIds.length ? new Set(patientIds) : null;
  const ordered = [];
  const seen = new Set();
  for (const asset of assets) {
    if (!isPipedriveSmartdocAsset(asset)) continue;
    if (asset.encounterId) continue;
    const patientId = asset.patientId;
    if (!patientId) continue;
    if (scope && !scope.has(patientId)) continue;
    if (seen.has(patientId)) continue;
    seen.add(patientId);
    ordered.push(patientId);
    if (maxPatients && ordered.length >= maxPatients) break;
  }
  return ordered;
}

function buildPatientInputsFromAssets(assets, patientIds = []) {
  const scope = patientIds.length ? new Set(patientIds) : null;
  const byPatient = new Map();
  for (const asset of assets) {
    if (!isPipedriveSmartdocAsset(asset)) continue;
    if (asset.encounterId) continue;
    const patientId = asset.patientId;
    if (!patientId) continue;
    if (scope && !scope.has(patientId)) continue;
    if (!byPatient.has(patientId)) byPatient.set(patientId, []);
    byPatient.get(patientId).push(asset);
  }
  return [...byPatient.entries()].map(([patientId, patientAssets]) => ({
    patientId,
    assets: patientAssets,
  }));
}

function buildEncounterPatchPlan(assets, { patientIds = [] } = {}) {
  const patientInputs = buildPatientInputsFromAssets(assets, patientIds);
  const plan = buildEncounterLinkRepairPlan({ patientInputs });
  const patchItems = {};
  const changes = [];
  for (const mapping of plan.linkable) {
    const asset = plan.assetById.get(mapping.assetId);
    if (!asset || asset.encounterId || !mapping.encounterId) continue;
    patchItems[asset.id] = {
      ...asset,
      encounterId: mapping.encounterId,
    };
    changes.push({
      assetId: asset.id,
      patientId: asset.patientId,
      encounterId: mapping.encounterId,
      confidence: mapping.confidence,
      reason: mapping.reason,
    });
  }
  return {
    patientInputs,
    plan,
    patchItems,
    changes,
    stats: {
      patientsAffected: patientInputs.length,
      candidates: plan.missingMappings.length,
      linkable: plan.linkable.length,
      review: plan.review.length,
      patchCount: Object.keys(patchItems).length,
    },
  };
}

function restartRenderProd(cfg) {
  try {
    execFileSync('render', ['restart', cfg.serviceId, '--confirm'], { stdio: 'inherit' });
    return true;
  } catch {
    console.error('render CLI saknas — starta om manuellt efter patch.');
    return false;
  }
}

async function runSshApply(args) {
  const cfg = resolveRenderSshConfig();
  if (args.refreshSnapshot) {
    console.error(`Hämtar prod assets via SSH → ${args.prodSnapshotPath}`);
    pullProdAssets(cfg, args.prodSnapshotPath);
  }

  const assets = loadAssetsSnapshot(args.prodSnapshotPath);
  const { patchItems, changes, stats, plan } = buildEncounterPatchPlan(assets, {
    patientIds: args.patientIds,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.dryRun ? 'ssh-dry-run' : 'ssh-write',
    stats,
    sampleChanges: changes.slice(0, 10),
  };

  if (stats.patchCount === 0) {
    console.log(JSON.stringify({ ...report, note: 'Ingen encounter-patch behövdes.' }, null, 2));
    return;
  }

  if (args.dryRun) {
    console.log(JSON.stringify(report, null, 2));
    console.log(`\n✅ SSH dry-run: ${stats.patchCount} assets skulle patchas.\n`);
    return;
  }

  fs.mkdirSync(path.dirname(PATCH_PATH), { recursive: true });
  fs.writeFileSync(PATCH_PATH, `${JSON.stringify({ items: patchItems }, null, 2)}\n`);
  console.error(`Pushar encounter-patch (${stats.patchCount} assets)…`);
  await uploadPipedrivePatch(cfg, PATCH_PATH, {
    mergeScriptPath: path.join(ROOT, 'scripts/merge-pipedrive-assets-patch-fast.js'),
  });

  if (args.restartProd) {
    console.error('Startar om Render prod…');
    report.restart = restartRenderProd(cfg);
    report.readyz = await waitForProdReady();
  }

  const token = fetchOwnerToken();
  report.verify = await verifyCanaryPatient(token, '59233beb-4d70-416e-b78b-3120972067f2');
  report.remainingUnlinked = plan.missingMappings.length - stats.patchCount;
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  clearCheckpoint();

  console.log('\n=== Pipedrive smartdoc · SSH encounter-link apply ===\n');
  console.log(`Patchade: ${stats.patchCount}`);
  console.log(`Review kvar (ej patchade): ${stats.review}`);
  if (report.verify?.ok) {
    console.log(`Canary: ${report.verify.linked}/${report.verify.total} smartdocs linked`);
  }
  console.log(`\nRapport: ${REPORT_PATH}\n`);
}

function fetchOwnerToken() {
  const result = spawnSync('node', ['scripts/get-prod-auth-token.js', '--owner', '--no-fallback'], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(result.stderr?.trim() || result.stdout?.trim() || 'owner-token misslyckades');
  }
  const token = (result.stdout || '').trim();
  if (!token) fail('tom owner-token');
  return token;
}

async function waitForProdReady({ attempts = 24, delayMs = 10000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`${BASE}/readyz`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return { ok: true, attempt };
    } catch {
      // retry
    }
    console.error(`Väntar på prod readyz (${attempt}/${attempts})…`);
    await sleep(delayMs);
  }
  return { ok: false, attempt: attempts };
}

async function repairBatch({ token, patientIds, dryRun, retries }) {
  const body = { patientIds, dryRun };
  if (!dryRun) body.confirmText = CONFIRM_TEXT;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(
        `${BASE}/api/v1/cco-patient-master/assets/repair-encounter-links`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(180000),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      lastError = new Error(`HTTP ${response.status}: ${payload.error || JSON.stringify(payload)}`);
      if (![401, 429, 502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) {
      console.error(`Batch retry ${attempt}/${retries}: ${lastError.message}`);
      await sleep(attempt * 3000);
    }
  }
  throw lastError || new Error('repair batch misslyckades');
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function verifyCanaryPatient(token, patientId) {
  const res = await fetch(`${BASE}/api/v1/cco/patients/${encodeURIComponent(patientId)}/assets`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(60000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error || `HTTP ${res.status}` };
  const rows = (body.items || body.assets || []).filter(
    (row) => row?.sourceSystem === 'pipedrive_import' && row?.patientCardSection === 'ovrigt'
  );
  const linked = rows.filter((row) => row.encounterId).length;
  return { ok: true, total: rows.length, linked, unlinked: rows.length - linked };
}

function readCheckpoint() {
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeCheckpoint(checkpoint) {
  fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, `${JSON.stringify(checkpoint, null, 2)}\n`);
}

function clearCheckpoint() {
  try {
    fs.unlinkSync(CHECKPOINT_PATH);
  } catch {
    // ignore
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.sshWrite) return runSshApply(args);

  const ready = await waitForProdReady();
  if (!ready.ok) fail('Prod readyz timeout — avbryter apply.');

  const cfg = resolveRenderSshConfig();
  if (args.refreshSnapshot) {
    console.error(`Hämtar prod assets via SSH → ${args.prodSnapshotPath}`);
    pullProdAssets(cfg, args.prodSnapshotPath);
  }

  const assets = loadAssetsSnapshot(args.prodSnapshotPath);
  let patientIds = collectTargetPatientIds(assets, {
    patientIds: args.patientIds,
    maxPatients: args.maxPatients,
  });
  if (!patientIds.length) fail('Inga pipedrive smartdocs utan encounterId hittades.');

  const priorCheckpoint = args.resume ? readCheckpoint() : null;
  if (priorCheckpoint?.completedPatientIds?.length) {
    const done = new Set(priorCheckpoint.completedPatientIds);
    patientIds = patientIds.filter((id) => !done.has(id));
    console.error(
      `Resume: hoppar över ${done.size} redan klara patienter, ${patientIds.length} kvar.`
    );
  }
  if (!patientIds.length) {
    console.log('✅ Alla mål-patienter redan processade enligt checkpoint.');
    return;
  }

  const token = fetchOwnerToken();
  const batches = chunk(patientIds, args.batchSize);
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    patientsTargeted: patientIds.length,
    batchSize: args.batchSize,
    batches: priorCheckpoint?.batches || [],
    totals: priorCheckpoint?.totals || {
      patientsScanned: 0,
      linkable: 0,
      linked: 0,
      review: 0,
    },
    completedPatientIds: priorCheckpoint?.completedPatientIds || [],
  };

  console.error(
    `${args.dryRun ? 'DRY-RUN' : 'WRITE'} · ${patientIds.length} patienter · ${batches.length} batchar`
  );

  for (let index = 0; index < batches.length; index += 1) {
    const batchPatientIds = batches[index];
    console.error(`Batch ${index + 1}/${batches.length} (${batchPatientIds.length} patienter)…`);
    let payload;
    try {
      payload = await repairBatch({
        token,
        patientIds: batchPatientIds,
        dryRun: args.dryRun,
        retries: args.retries,
      });
    } catch (error) {
      writeCheckpoint({
        ...report,
        lastError: error.message,
        updatedAt: new Date().toISOString(),
      });
      throw error;
    }
    const batchReport = {
      index: report.batches.length + 1,
      patientCount: batchPatientIds.length,
      stats: payload.stats || {},
    };
    report.batches.push(batchReport);
    report.totals.patientsScanned += Number(payload.stats?.patientsScanned || 0);
    report.totals.linkable += Number(payload.stats?.linkable || 0);
    report.totals.linked += Number(payload.stats?.linked || 0);
    report.totals.review += Number(payload.stats?.review || 0);
    report.completedPatientIds.push(...batchPatientIds);
    writeCheckpoint({
      ...report,
      updatedAt: new Date().toISOString(),
    });
    console.error(
      `  linkable=${payload.stats?.linkable ?? '?'} linked=${payload.stats?.linked ?? '?'} review=${payload.stats?.review ?? '?'}`
    );
    if (args.batchDelayMs > 0 && index < batches.length - 1) {
      await sleep(args.batchDelayMs);
    }
  }

  const canaryId = args.patientIds[0] || '59233beb-4d70-416e-b78b-3120972067f2';
  if (!args.dryRun) {
    report.verify = await verifyCanaryPatient(token, canaryId);
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  if (!args.dryRun) clearCheckpoint();

  console.log('\n=== Pipedrive smartdoc · encounter-link apply ===\n');
  console.log(`Mode: ${args.dryRun ? 'dry-run' : 'write'}`);
  console.log(`Patienter: ${report.patientsTargeted}`);
  console.log(`Linkable: ${report.totals.linkable}`);
  console.log(`Linked: ${report.totals.linked}`);
  console.log(`Review: ${report.totals.review}`);
  if (report.verify) {
    console.log(
      `Canary verify (${canaryId}): ${report.verify.linked}/${report.verify.total} smartdocs linked`
    );
  }
  console.log(`\nRapport: ${REPORT_PATH}\n`);
  if (args.dryRun) {
    console.log('✅ Dry-run klar — kör med --write för skarp apply.\n');
  } else {
    console.log('✅ Skarp apply klar.\n');
  }
}

main().catch((error) => fail(error.message || String(error)));
