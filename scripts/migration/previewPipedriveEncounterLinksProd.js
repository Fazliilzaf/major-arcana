#!/usr/bin/env node
'use strict';

/**
 * Read-only preview: pipedrive smartdocs (ovrigt) → encounter-länkar.
 *
 *   node scripts/migration/previewPipedriveEncounterLinksProd.js --ssh-local
 *   node scripts/migration/previewPipedriveEncounterLinksProd.js --api --patient-id <uuid>
 *   node scripts/migration/previewPipedriveEncounterLinksProd.js --json > /tmp/pd-encounter-links.json
 *
 * --ssh-local  Kör lokalt mot prod-snapshot via SSH (fungerar före deploy).
 * --api        Anropar prod preview-encounter-links (kräver deployad kod).
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const { BASE } = require('../lib/halsoHdProdClient');
const { resolveRenderSshConfig } = require('../lib/renderSshSync');
const {
  isPipedriveSmartdocAsset,
  previewEncounterLinkRepair,
} = require('../../src/ops/ccoEncounterLinkRepair');

const ROOT = path.join(__dirname, '../..');
const STAGING_DIR = path.join(ROOT, 'data/reports/pipedrive-encounter-links-staging');
const PROD_SNAPSHOT = path.join(STAGING_DIR, 'cco-patient-assets-prod.json');
const REPORT_PATH = path.join(ROOT, 'data/reports/pipedrive-encounter-links-preview.json');

const DEFAULT_CANARY = [
  '59233beb-4d70-416e-b78b-3120972067f2',
  '5683443c-cb18-4931-893d-2502d1592a65',
  '72b3c17d-19e6-4725-ad08-5fda0b85dc0d',
];

function parseArgs(argv) {
  const args = {
    mode: 'ssh-local',
    patientIds: [],
    sampleSize: 25,
    json: false,
    prodSnapshotPath: PROD_SNAPSHOT,
    refreshSnapshot: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--api') args.mode = 'api';
    else if (token === '--ssh-local') args.mode = 'ssh-local';
    else if (token === '--patient-id') args.patientIds.push(String(argv[++i] || '').trim());
    else if (token === '--sample-size') args.sampleSize = Math.max(1, Number(argv[++i]) || 25);
    else if (token === '--json') args.json = true;
    else if (token === '--no-refresh') args.refreshSnapshot = false;
    else if (token === '--prod-snapshot') args.prodSnapshotPath = argv[++i];
    else if (token === '--help' || token === '-h') {
      console.log(`Usage: node scripts/migration/previewPipedriveEncounterLinksProd.js [options]

Options:
  --ssh-local           Lokal preview mot SSH-snapshot (default)
  --api                 Prod API preview-encounter-links
  --patient-id ID       Begränsa till patient; upprepa för flera
  --sample-size N       Maskerade exempel (default 25)
  --no-refresh          Använd befintlig prod-snapshot (--ssh-local)
  --prod-snapshot PATH  Egen snapshot-fil
  --json                Skriv rapport som JSON till stdout
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
  if (parsed?.items && typeof parsed.items === 'object') {
    return Object.values(parsed.items);
  }
  return [];
}

function filterPipedriveSmartdocs(assets, patientIds = []) {
  const patientSet = patientIds.length ? new Set(patientIds) : null;
  return assets.filter((asset) => {
    if (!isPipedriveSmartdocAsset(asset)) return false;
    if (patientSet && !patientSet.has(asset.patientId)) return false;
    return true;
  });
}

function buildPatientInputsFromAssets(smartdocs) {
  const byPatient = new Map();
  for (const asset of smartdocs) {
    const patientId = asset.patientId;
    if (!patientId) continue;
    if (!byPatient.has(patientId)) byPatient.set(patientId, []);
    byPatient.get(patientId).push(asset);
  }
  return [...byPatient.entries()].map(([patientId, assets]) => ({ patientId, assets }));
}

function summarizePipedrive(report, inventory = {}) {
  return {
    mode: inventory.mode || 'ssh-local',
    generatedAt: report.generatedAt,
    zeroWrites: true,
    inventory: {
      pipedriveSmartdocsTotal: inventory.total || 0,
      withoutEncounterId: inventory.withoutEncounterId || 0,
      alreadyLinked: inventory.alreadyLinked || 0,
      patientsAffected: inventory.patientsAffected || 0,
    },
    stats: report.stats,
    samples: report.samples,
  };
}

function printHumanSummary(payload) {
  const { inventory, stats } = payload;
  console.log('\n=== Pipedrive smartdoc · encounter-link preview ===\n');
  console.log(`Mode: ${payload.mode}`);
  console.log(`Pipedrive smartdocs totalt: ${inventory.pipedriveSmartdocsTotal}`);
  console.log(`Redan länkade: ${inventory.alreadyLinked}`);
  console.log(`Saknar encounterId: ${inventory.withoutEncounterId}`);
  console.log(`Patienter med smartdocs: ${inventory.patientsAffected}`);
  console.log('');
  console.log('Förslag (saknar encounterId):');
  console.log(
    `  Linkable (high+medium): ${stats.linkable} (high ${stats.linkableHigh}, medium ${stats.linkableMedium})`
  );
  console.log(`  Review: ${stats.review}`);
  console.log(`  Saknar datum: ${stats.missingDate}`);
  console.log('');
  if (payload.samples?.length) {
    console.log('Exempel (maskerade):');
    for (const sample of payload.samples.slice(0, 10)) {
      console.log(
        `  · ${sample.fileName} · ${sample.date || '?'} → ${sample.proposedEncounterId || '—'} (${sample.confidence}/${sample.reason})`
      );
    }
  }
  console.log('\n✅ Read-only preview — inga writes.\n');
}

function runSshLocalPreview(args) {
  const cfg = resolveRenderSshConfig();
  if (args.refreshSnapshot) {
    console.error(`Hämtar prod assets via SSH → ${args.prodSnapshotPath}`);
    pullProdAssets(cfg, args.prodSnapshotPath);
  }

  const allAssets = loadAssetsSnapshot(args.prodSnapshotPath);
  const patientScope = args.patientIds.length ? args.patientIds : null;
  const smartdocs = filterPipedriveSmartdocs(allAssets, patientScope || []);
  const withoutEncounter = smartdocs.filter((asset) => !asset.encounterId);
  const patientInputs = buildPatientInputsFromAssets(smartdocs);
  const report = previewEncounterLinkRepair({
    patientInputs,
    sampleSize: args.sampleSize,
  });

  const patientsAffected = new Set(smartdocs.map((asset) => asset.patientId)).size;
  return summarizePipedrive(report, {
    mode: 'ssh-local',
    total: smartdocs.length,
    withoutEncounterId: withoutEncounter.length,
    alreadyLinked: smartdocs.length - withoutEncounter.length,
    patientsAffected,
  });
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

async function runApiPreview(args) {
  const token = fetchOwnerToken();
  const patientIds = args.patientIds.length ? args.patientIds : DEFAULT_CANARY;
  const response = await fetch(`${BASE}/api/v1/cco-patient-master/assets/preview-encounter-links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      patientIds,
      sampleSize: args.sampleSize,
      includeBookingIndex: true,
    }),
    signal: AbortSignal.timeout(120000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(`API ${response.status}: ${body.error || JSON.stringify(body)}`);
  }

  return summarizePipedrive(body, {
    mode: 'api',
    total: body.stats?.pipedriveSmartdocs ?? null,
    withoutEncounterId: body.stats?.missingEncounterId ?? null,
    alreadyLinked: body.stats?.alreadyLinked ?? null,
    patientsAffected: patientIds.length,
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const payload = args.mode === 'api' ? await runApiPreview(args) : runSshLocalPreview(args);

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(payload, null, 2)}\n`);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    printHumanSummary(payload);
    console.log(`Rapport: ${REPORT_PATH}`);
  }
}

main().catch((error) => fail(error.message || String(error)));
