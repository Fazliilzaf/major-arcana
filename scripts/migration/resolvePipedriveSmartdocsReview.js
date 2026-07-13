#!/usr/bin/env node
'use strict';

/**
 * Auto-resolve pipedrive_import assets i NEEDS_REVIEW via filnamn + people-CSV + patient-master.
 * ORD-59b steg 2.
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { resolveMigrationPaths } = require('./lib/migrationEnv');
const {
  buildPipedrivePatientIndex,
  buildPipedrivePeopleNameIndex,
  resolvePatientForManifestItem,
} = require('./lib/pipedriveSmartdocsImport');

const DEFAULT_ICLOUD_ROOT = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/Migration-data'
);

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function loadPeopleCsv(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return [];
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

function parseArgs(argv) {
  const paths = resolveMigrationPaths();
  const args = {
    dryRun: true,
    tenantId: paths.tenantId,
    patientMasterPath: paths.patientMasterPath,
    assetPath: path.join(process.cwd(), 'data/cco-patient-assets.json'),
    peopleCsv: path.join(DEFAULT_ICLOUD_ROOT, 'pipedrive-2026-05-24/personer-2026-05-24.csv'),
    limit: 0,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--commit') args.dryRun = false;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--limit') args.limit = Number.parseInt(argv[++i], 10) || 0;
    else if (token === '--people-csv') args.peopleCsv = argv[++i];
    else if (token === '--assets') args.assetPath = argv[++i];
    else if (token === '--patient-master') args.patientMasterPath = argv[++i];
    else if (token === '--tenant') args.tenantId = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: args.patientMasterPath,
  });
  const listed = await patientMasterStore.listPatients({ tenantId: args.tenantId, limit: 20000 });
  const patients = listed.patients || [];
  const patientIndex = buildPipedrivePatientIndex(patients, { tenantId: args.tenantId });
  const peopleIndex = buildPipedrivePeopleNameIndex(loadPeopleCsv(args.peopleCsv));

  const assetStore = await createCcoPatientAssetStore({ filePath: args.assetPath });
  const assetState = JSON.parse(fs.readFileSync(args.assetPath, 'utf8'));
  let candidates = Object.values(assetState.items || {}).filter(
    (a) => a?.sourceSystem === 'pipedrive_import' && a.status === 'NEEDS_REVIEW'
  );
  if (args.limit > 0) candidates = candidates.slice(0, args.limit);

  console.log(`\n=== PIPEDRIVE REVIEW AUTO-RESOLVE ${args.dryRun ? '(DRY-RUN)' : '(COMMIT)'} ===`);
  console.log(`NEEDS_REVIEW pipedrive_import: ${candidates.length}`);

  const totals = { processed: 0, resolved: 0, stillReview: 0, failed: 0 };
  assetStore.beginBatch();
  try {
    for (const asset of candidates) {
      totals.processed += 1;
      const item = {
        fileId: asset.sourceRecordId || asset.provenance?.pipedriveFileId,
        fileName: asset.originalFileName || asset.displayName,
        personId: asset.provenance?.pipedrivePersonId || null,
        dealId: asset.provenance?.pipedriveDealId || null,
      };
      const match = resolvePatientForManifestItem(item, patientIndex, peopleIndex);
      if (!match.patientId || match.confidence !== 'high') {
        totals.stillReview += 1;
        continue;
      }
      if (args.dryRun) {
        totals.resolved += 1;
        continue;
      }
      try {
        await assetStore.reassignToPatient(asset.id, {
          patientId: match.patientId,
          actor: { role: 'system', id: 'pipedrive-review-resolve' },
          reason: `auto_resolve:${match.method}`,
        });
        await assetStore.markAsVisibleOnPatientCard(asset.id, {
          actor: { role: 'system', id: 'pipedrive-review-resolve' },
        });
        totals.resolved += 1;
      } catch (error) {
        totals.failed += 1;
        console.error(`FAIL asset=${asset.id}: ${error.message}`);
      }
    }
  } finally {
    await assetStore.flushBatch();
  }

  console.log(JSON.stringify(totals, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
